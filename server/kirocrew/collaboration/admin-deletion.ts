/**
 * Shared Investigations — GHOST_Admin_Service permanent-deletion authority and
 * the absorbing Tombstone / cleanup state machine (task 4.4).
 *
 * Owner: Ghostv2 GHOST_Admin_Service, CollaborationRepository, and the
 * Object_Store cleanup worker (`deletion-cleanup-worker.ts`). The disabled-first
 * EventBridge schedule that drives the cleanup worker is provisioned in
 * `terraform/modules/collaboration/scheduler.tf` (the `deletion_cleanup`
 * schedule); this module is the TypeScript authority + state machine the route
 * seam (`api-runtime.ts` `AdminDeletionPort`, wired at `api-handlers.ts`
 * `deleteInvestigation`) plugs into.
 *
 * What this module owns (Requirements 20.1-20.12, 23.10, 24.18):
 *
 *   1. **Atomic Tombstone before denial.** `requestDeletion` commits, in ONE
 *      all-or-nothing transaction on the dedicated Cloud_Record_Store: a
 *      content-free Tombstone at `DELETE#{tenant}#{space}#{investigation} /
 *      TOMBSTONE`, a content-free `deletion` Change_Feed item at the next
 *      Team_Space Server_Sequence, and the durable cleanup job at
 *      `DELETE#… / JOB#{step}`. Access is denied the instant the Tombstone
 *      commits — physical cleanup is asynchronous and never gates denial
 *      (Requirement 20.1, 20.3, 20.8, 23.10).
 *
 *   2. **Absorbing Tombstone.** Once a Tombstone exists it is terminal. A retry
 *      of the deletion returns the SAME content-free acknowledgement without a
 *      second feed item or a second sequence burn (idempotent). A cleanup
 *      failure, a space disable then enable, and an offline replay of any
 *      earlier mutation can NEVER move the record out of `Tombstoned`, recreate
 *      it, or expose it: the Tombstone is checked first and the transition
 *      matrix only allows `Tombstoned -> Tombstoned` (Requirement 20.7, 20.9,
 *      20.10, 20.11, 24.18; design "Lifecycle state models").
 *
 *   3. **Content-free receipts only.** The Tombstone and every deletion feed
 *      item carry only opaque identifiers, lifecycle status, and the accepted
 *      Server_Sequence — never Investigation content, subject labels, group
 *      ids, or storage detail (Requirement 20.6, 23.10, 24.2). After cleanup
 *      completes only a minimal receipt (the Tombstone with a `cleanupState` of
 *      `complete` and counts) is retained; content rows, projections, and every
 *      object version are gone (Requirement 20.5, 20.6).
 *
 * This module deliberately depends only on the storage-engine-neutral
 * {@link TransactionalRecordStore} (`record-store.ts`) and the shared key
 * helpers (`keys.ts`), exactly like the CollaborationRepository, so the state
 * machine is testable against the deterministic
 * {@link InMemoryTransactionalRecordStore} without any AWS dependency. The
 * production wiring binds the same store to DynamoDB.
 */

import { randomUUID } from 'node:crypto'
import {
  changeFeedKey,
  deletionJobKey,
  sequenceCounterKey,
  tombstoneKey,
  type InvestigationScope,
  type SpaceScope
} from './keys'
import {
  TransactionConflictError,
  type StoredRecord,
  type TransactionalRecordStore,
  type TransactionOp
} from './record-store'
import type { ServerSequence } from './repository-types'
import type { AdminDeletionAck, AdminDeletionPort } from './api-runtime'

/** How many times an internal Server_Sequence allocation conflict is retried. */
const DEFAULT_MAX_SEQUENCE_RETRIES = 8

/**
 * Lifecycle status of a Tombstone's asynchronous physical cleanup. The Tombstone
 * exists (and access is denied) the moment it is written; this only tracks how
 * far the restart-safe cleanup job has progressed. `failed` never restores
 * access — the record is still `Tombstoned` — it only signals that the worker
 * should resume (Requirement 20.9, 20.11).
 */
export type CleanupState = 'pending' | 'in-progress' | 'failed' | 'complete'

/** The canonical single cleanup job step key for an Investigation deletion. */
export const DELETION_CLEANUP_STEP = 'cleanup'

/**
 * The content-free Tombstone record. This is the absorbing lifecycle marker and,
 * after cleanup, the ONLY retained receipt for the deleted identifier. It holds
 * no Investigation content, subject label, group id, or storage detail
 * (Requirement 20.6, 23.10).
 */
export interface TombstoneRecord {
  tenantId: string
  spaceId: string
  investigationId: string
  /** The Server_Sequence at which the Tombstone + deletion feed change committed. */
  acceptedServerSequence: ServerSequence
  tombstonedAt: string
  cleanupState: CleanupState
  /** Populated once cleanup finishes; a minimal, content-free receipt count. */
  removedObjectVersions?: number
  removedRecords?: number
  cleanupCompletedAt?: string
}

/**
 * The durable, restart-safe cleanup job. It is committed atomically with the
 * Tombstone so a deletion can never be accepted without also enqueuing the work
 * that removes content records, projections, and every object version
 * (Requirement 20.4, 20.5, 20.12). The Object_Store cleanup worker
 * (`deletion-cleanup-worker.ts`) claims and advances it.
 */
export interface DeletionJobRecord {
  tenantId: string
  spaceId: string
  investigationId: string
  step: string
  cleanupState: CleanupState
  /** Opaque cursor for restart-safe object-version enumeration; worker-owned. */
  progressCursor?: string
  removedObjectVersions: number
  removedRecords: number
  attempts: number
  createdAt: string
  updatedAt: string
}

/** Injectable clock + id generator so the service is deterministic in tests. */
export interface AdminDeletionClock {
  now(): Date
  newReceiptId(): string
}

const defaultClock: AdminDeletionClock = {
  now: () => new Date(),
  newReceiptId: () => `del-${randomUUID()}`
}

/**
 * Resolves whether an Investigation currently exists inside the target space
 * WITHOUT the admin service reaching into read projections it does not own. The
 * route (`deleteInvestigation`) has already proven collaboration object
 * authorization and separate current Administrator authority before this port
 * is called; this existence probe only lets a delete of an unknown/foreign
 * identifier resolve to a non-disclosing not-found rather than minting a
 * Tombstone for a target that was never in this space (Requirement 4.7, 24.2).
 *
 * Returning `true` for an already-tombstoned identifier is expected and
 * harmless: the absorbing check handles idempotent re-deletion.
 */
export type InvestigationExistsProbe = (scope: InvestigationScope) => Promise<boolean> | boolean

export interface GhostAdminDeletionServiceConfig {
  clock?: AdminDeletionClock
  maxSequenceRetries?: number
  /**
   * Optional existence probe. When omitted, the service trusts that the route's
   * prior object authorization already proved containment and proceeds to
   * tombstone; when provided, a non-existent, non-tombstoned target is a
   * non-disclosing not-found.
   */
  existsProbe?: InvestigationExistsProbe
}

/**
 * A non-disclosing "resource not found" thrown when a deletion targets an
 * identifier that is neither a live Investigation in this space nor already
 * tombstoned. It carries no content and is indistinguishable from any other
 * not-found (Requirement 4.7, 24.2). Kept as a plain typed error so the route
 * boundary maps it to the same safe envelope as every other denial.
 */
export class AdminDeletionNotFoundError extends Error {
  readonly code = 'not_found' as const
  readonly retryable = false
  constructor(readonly safeMessage = 'The requested collaboration resource was not found.') {
    super(safeMessage)
    this.name = 'AdminDeletionNotFoundError'
  }
}

/**
 * The concrete GHOST_Admin_Service permanent-deletion authority. It implements
 * the {@link AdminDeletionPort} the route seam depends on: after the route has
 * enforced collaboration object authorization AND separate current
 * Administrator authorization, this atomically tombstones the Investigation and
 * enqueues its restart-safe cleanup, then denies access.
 */
export class GhostAdminDeletionService implements AdminDeletionPort {
  private readonly clock: AdminDeletionClock
  private readonly maxSequenceRetries: number
  private readonly existsProbe?: InvestigationExistsProbe

  constructor(
    private readonly store: TransactionalRecordStore,
    config: GhostAdminDeletionServiceConfig = {}
  ) {
    this.clock = config.clock ?? defaultClock
    this.maxSequenceRetries = config.maxSequenceRetries ?? DEFAULT_MAX_SEQUENCE_RETRIES
    this.existsProbe = config.existsProbe
  }

  /**
   * Accept a permanent-deletion request for one Investigation.
   *
   * Absorbing-first: if a Tombstone already exists, this returns the SAME
   * content-free acknowledgement it minted originally — no second feed item, no
   * second sequence burn, no reopen. This is what makes a retry, a
   * disable/enable cycle, or an offline replay of the delete a no-op rather than
   * a duplicate (Requirement 20.7, 20.9, 20.10, 24.18).
   *
   * Otherwise it commits — atomically — the content-free Tombstone, the
   * content-free `deletion` Change_Feed item at the next Server_Sequence, and
   * the durable cleanup job, then returns the acknowledgement. The moment that
   * transaction commits, every read/write/replay for the identifier is denied
   * by the absorbing Tombstone (Requirement 20.1, 20.3, 20.8, 23.10).
   */
  async requestDeletion(scope: InvestigationScope): Promise<AdminDeletionAck> {
    // Absorbing: an existing Tombstone is terminal. Return the original receipt.
    const existing = await this.readTombstone(scope)
    if (existing) {
      return this.ackFrom(existing)
    }

    // Non-disclosing containment: a target that was never a live Investigation
    // in this space (and is not already tombstoned) is a not-found rather than
    // a fresh Tombstone for a non-existent identifier (Requirement 4.7, 24.2).
    if (this.existsProbe) {
      const exists = await this.existsProbe(scope)
      if (!exists) throw new AdminDeletionNotFoundError()
    }

    return this.withSequenceRetry(scope, async (sequence, expectedCurrent) => {
      const nowIso = this.clock.now().toISOString()

      const tombstone: TombstoneRecord = {
        tenantId: scope.tenantId,
        spaceId: scope.spaceId,
        investigationId: scope.investigationId,
        acceptedServerSequence: sequence,
        tombstonedAt: nowIso,
        cleanupState: 'pending'
      }
      const job: DeletionJobRecord = {
        tenantId: scope.tenantId,
        spaceId: scope.spaceId,
        investigationId: scope.investigationId,
        step: DELETION_CLEANUP_STEP,
        cleanupState: 'pending',
        removedObjectVersions: 0,
        removedRecords: 0,
        attempts: 0,
        createdAt: nowIso,
        updatedAt: nowIso
      }

      const ops: TransactionOp[] = [
        this.counterOp(scope, expectedCurrent, sequence),
        // The Tombstone. putIfAbsent so two concurrent deletions converge on
        // one Tombstone rather than double-writing (absorbing).
        { op: 'putIfAbsent', id: 'tombstone', item: this.tombstoneItem(scope, tombstone) },
        // Content-free deletion feed change so every replica invalidates only
        // the matching replicated state (Requirement 20.8, 23.10).
        this.deletionFeedOp(scope, sequence),
        // Durable, restart-safe cleanup job committed with the Tombstone.
        { op: 'putIfAbsent', id: 'cleanup-job', item: this.jobItem(scope, job) }
      ]

      try {
        await this.store.transactWrite({ ops })
        return this.ackFrom(tombstone)
      } catch (error) {
        if (error instanceof TransactionConflictError) {
          // A concurrent deletion won the Tombstone putIfAbsent (or burned the
          // sequence). If a Tombstone now exists, converge on it (absorbing);
          // a bare counter conflict is retried by withSequenceRetry.
          const winner = await this.readTombstone(scope)
          if (winner) return this.ackFrom(winner)
        }
        throw error
      }
    })
  }

  /**
   * Whether the identifier is tombstoned. This is the single predicate every
   * read/write/replay path consults to enforce the absorbing rule: a `true`
   * result means the operation must be rejected as `Tombstoned`, regardless of
   * whether physical cleanup has finished (Requirement 20.9, 20.10, 24.18).
   */
  async isTombstoned(scope: InvestigationScope): Promise<boolean> {
    return (await this.readTombstone(scope)) !== null
  }

  /** Read the content-free Tombstone receipt, or null when none exists. */
  async readTombstone(scope: InvestigationScope): Promise<TombstoneRecord | null> {
    const found = await this.store.get(tombstoneKey(scope))
    if (!found) return null
    return found as unknown as TombstoneRecord
  }

  /** Read the durable cleanup job, or null when none exists. */
  async readCleanupJob(scope: InvestigationScope): Promise<DeletionJobRecord | null> {
    const found = await this.store.get(deletionJobKey(scope, DELETION_CLEANUP_STEP))
    if (!found) return null
    return found as unknown as DeletionJobRecord
  }

  // -------------------------------------------------------------------------
  // Sequence allocation + item helpers (mirrors CollaborationRepository).
  // -------------------------------------------------------------------------

  private async withSequenceRetry<T>(
    scope: SpaceScope,
    attempt: (sequence: ServerSequence, expectedCurrent: number) => Promise<T>
  ): Promise<T> {
    let lastError: unknown
    for (let i = 0; i < this.maxSequenceRetries; i++) {
      const current = await this.readCounter(scope)
      const next = current + 1
      try {
        return await attempt(next, current)
      } catch (error) {
        if (error instanceof TransactionConflictError && error.reason === 'counter') {
          lastError = error
          continue // retry with a re-read counter
        }
        throw error
      }
    }
    throw lastError ?? new TransactionConflictError('counter')
  }

  private async readCounter(scope: SpaceScope): Promise<number> {
    const found = await this.store.get(sequenceCounterKey(scope))
    return found ? Number(found.value) : 0
  }

  private counterOp(scope: SpaceScope, expectedCurrent: number, next: number): TransactionOp {
    return {
      op: 'incrementCounter',
      id: 'sequence',
      key: sequenceCounterKey(scope),
      expectedCurrent,
      next
    }
  }

  /**
   * A content-free `deletion` Change_Feed item. Its safe projection carries only
   * the opaque Investigation id and a lifecycle marker so synchronizing clients
   * invalidate only the matching replicated state — never any content
   * (Requirement 19.13, 20.8, 23.10).
   */
  private deletionFeedOp(scope: InvestigationScope, sequence: ServerSequence): TransactionOp {
    const key = changeFeedKey(scope, sequence)
    return {
      op: 'putIfAbsent',
      id: `feed-${sequence}`,
      item: {
        pk: key.pk,
        sk: key.sk,
        recordType: 'change-feed',
        tenantId: scope.tenantId,
        spaceId: scope.spaceId,
        serverSequence: sequence,
        kind: 'deletion',
        objectId: scope.investigationId,
        // Content-free: lifecycle marker only.
        safeProjection: { investigationId: scope.investigationId, lifecycle: 'tombstoned' }
      }
    }
  }

  private tombstoneItem(scope: InvestigationScope, record: TombstoneRecord): StoredRecord {
    const key = tombstoneKey(scope)
    return { pk: key.pk, sk: key.sk, recordType: 'tombstone', ...record } as StoredRecord
  }

  private jobItem(scope: InvestigationScope, record: DeletionJobRecord): StoredRecord {
    const key = deletionJobKey(scope, record.step)
    return { pk: key.pk, sk: key.sk, recordType: 'deletion-job', ...record } as StoredRecord
  }

  private ackFrom(tombstone: TombstoneRecord): AdminDeletionAck {
    return {
      investigationId: tombstone.investigationId,
      acceptedServerSequence: tombstone.acceptedServerSequence
    }
  }
}
