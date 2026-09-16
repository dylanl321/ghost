/**
 * Shared Investigations — abandoned-upload cleanup worker (task 4.3).
 *
 * Owner: Ghostv2 lifecycle workers and scheduling integration. The EventBridge
 * schedule that drives this worker is provisioned disabled-first in
 * `terraform/modules/collaboration/scheduler.tf` (task 3.1); this module is the
 * TypeScript worker logic the schedule invokes.
 *
 * What it does (Requirements 8.11, 20.12):
 *   - Removes ONLY unreferenced Pending_Manifests that have been abandoned for
 *     at least seven days, together with every version of their backing
 *     Object_Store object. A `ready` manifest, a manifest younger than seven
 *     days, or a manifest an Event references is never touched (Requirement
 *     8.11, and Ready durability under Requirement 20.1/20.2 which task 4.2
 *     owns).
 *   - Persists restart-safe progress so a replica that crashes mid-sweep, or a
 *     later scheduled run on a different replica, resumes without redoing or
 *     skipping work (Requirement 20.5-style durable execution claims applied to
 *     abandoned-upload cleanup).
 *   - Runs entirely from a durable claim + cursor: it needs no open dashboard,
 *     no browser, and no report scheduler. A single claim serializes replicas
 *     so two schedulers firing at once cannot double-delete or race
 *     (Requirement 20.12).
 *
 * This module deliberately depends only on narrow ports (claim store, manifest
 * lister, object-version deleter). The production wiring binds those to the
 * CollaborationRepository (DynamoDB) and the ArtifactStore's versioned bucket;
 * the in-memory implementations here back the unit/fault-injection tests
 * without any AWS dependency.
 */

import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { S3Client } from '@aws-sdk/client-s3'
import type { InvestigationScope, SpaceScope } from './keys'
import {
  DynamoAbandonedUploadLister,
  DynamoWorkerClaimStore,
  S3AndRecordAbandonedUploadRemover
} from './lifecycle-worker-adapters'

/** Seven days in milliseconds — the abandonment threshold (Requirement 8.11). */
export const ABANDONED_UPLOAD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * A pending manifest the sweep may consider for removal. This is the minimal
 * projection the worker needs: enough to locate the object and to decide
 * eligibility, and nothing that would require loading full manifests.
 */
export interface AbandonedUploadCandidate {
  scope: InvestigationScope
  artifactId: string
  /** When the Pending_Manifest was reserved (ISO-8601). */
  reservedAt: string
  /**
   * True when the manifest is still `pending` (never finalized). Only a pending
   * manifest is ever a cleanup candidate; the lister SHOULD already exclude
   * `ready`/`validation-failed`, but the worker re-checks defensively.
   */
  pending: boolean
  /**
   * True when NO durable Event references this Artifact. A referenced Artifact
   * — even a still-pending one — is part of an Investigation's history and is
   * never removed by this worker (Requirement 8.11 "unreferenced").
   */
  referenced: boolean
}

/**
 * Lists abandoned-upload candidates without a routine table scan. The concrete
 * CollaborationRepository resolves this from the manifest rows plus a
 * reservation-age index; the worker only sees the safe projection above.
 *
 * `cursor` is the opaque, restart-safe position handed back on the previous
 * page; passing `undefined` starts from the beginning. Implementations MUST
 * return candidates in a stable order so a resumed cursor never skips a
 * candidate.
 */
export interface AbandonedUploadLister {
  listAbandonedPending(input: {
    /** Only manifests reserved at or before this instant are eligible. */
    reservedOnOrBefore: Date
    cursor?: string
    limit: number
  }): Promise<{ candidates: AbandonedUploadCandidate[]; nextCursor?: string }>
}

/**
 * Removes an abandoned reservation and every version of its backing object,
 * all-or-nothing per artifact. The concrete implementation deletes the manifest
 * row and then deletes each S3 object version (including delete markers) under
 * the artifact's opaque key. It MUST be idempotent: re-invoking it for an
 * already-removed artifact is a no-op success, so a retry after a crash never
 * fails on the second pass.
 */
export interface AbandonedUploadRemover {
  removeReservationAndObjectVersions(scope: InvestigationScope, artifactId: string): Promise<void>
}

/**
 * A durable, single-holder claim on the abandoned-upload sweep. Only one holder
 * runs the sweep at a time; the claim carries restart-safe progress so a
 * resumed run continues from the persisted cursor rather than from the start.
 *
 * The claim is a lease with an expiry: if a holder crashes and never releases,
 * the lease expires and another replica may acquire it. This is exactly the
 * conditional-write pattern the record store already uses elsewhere (task 3.3).
 */
export interface WorkerClaim {
  /** Opaque token identifying the current holder (for release/heartbeat). */
  readonly ownerToken: string
  /** Restart-safe cursor persisted by the previous run, if any. */
  readonly cursor?: string
}

export interface WorkerClaimStore {
  /**
   * Try to acquire the named claim for `ownerToken` until `leaseExpiresAt`.
   * Succeeds when the claim is unheld or its lease has expired; returns `null`
   * when another live holder owns it (so this replica stands down). The
   * returned claim carries the last persisted cursor for resume.
   */
  acquire(input: {
    claimName: string
    ownerToken: string
    leaseExpiresAt: Date
    now: Date
  }): Promise<WorkerClaim | null>

  /**
   * Persist restart-safe progress for a held claim and extend the lease. MUST
   * fail (throw or resolve to `false`) if `ownerToken` no longer holds the
   * claim, so a replica that lost its lease cannot overwrite the new holder's
   * progress.
   */
  saveProgress(input: {
    claimName: string
    ownerToken: string
    cursor: string | undefined
    leaseExpiresAt: Date
    now: Date
  }): Promise<boolean>

  /** Release the claim if still held by `ownerToken`; a no-op otherwise. */
  release(input: { claimName: string; ownerToken: string }): Promise<void>
}

/** The canonical claim name for the abandoned-upload sweep. */
export const ABANDONED_UPLOAD_CLAIM = 'abandoned-upload-cleanup'

export interface AbandonedUploadWorkerConfig {
  /** Manifests reserved this many ms ago (or longer) are eligible. */
  maxAgeMs?: number
  /** Page size for the candidate lister. */
  pageSize?: number
  /** How long each acquired lease lasts before another replica may take over. */
  leaseDurationMs?: number
  /** Injectable clock for deterministic tests. */
  now?: () => Date
  /** Injectable owner-token generator for deterministic tests. */
  newOwnerToken?: () => string
}

/** Outcome of a single scheduled sweep. */
export interface AbandonedUploadSweepResult {
  /** False when another live replica held the claim and this run stood down. */
  claimed: boolean
  /** Number of abandoned reservations (and their object versions) removed. */
  removed: number
  /** Number of candidates skipped as ineligible (young/ready/referenced). */
  skipped: number
  /** True when the sweep reached the end of the candidate list. */
  completed: boolean
}

/**
 * The abandoned-upload cleanup worker. One `sweep()` is what the EventBridge
 * schedule invokes on its cadence. The worker:
 *
 *   1. Acquires the durable claim (or stands down if a live replica holds it),
 *      resuming from the persisted cursor.
 *   2. Pages through abandoned-pending candidates, removing only those that are
 *      still pending, unreferenced, and at least `maxAgeMs` old, and deleting
 *      every object version behind each.
 *   3. Persists the cursor after each page so a crash resumes mid-sweep.
 *   4. Releases the claim on completion (and clears the cursor for the next
 *      cadence).
 *
 * It never depends on an open dashboard or browser, and it is independent of
 * report scheduling (Requirement 20.12).
 */
export class AbandonedUploadCleanupWorker {
  private readonly maxAgeMs: number
  private readonly pageSize: number
  private readonly leaseDurationMs: number
  private readonly now: () => Date
  private readonly newOwnerToken: () => string

  constructor(
    private readonly lister: AbandonedUploadLister,
    private readonly remover: AbandonedUploadRemover,
    private readonly claims: WorkerClaimStore,
    config: AbandonedUploadWorkerConfig = {}
  ) {
    this.maxAgeMs = config.maxAgeMs ?? ABANDONED_UPLOAD_MAX_AGE_MS
    this.pageSize = config.pageSize ?? 100
    this.leaseDurationMs = config.leaseDurationMs ?? 5 * 60 * 1000
    this.now = config.now ?? (() => new Date())
    this.newOwnerToken =
      config.newOwnerToken ?? (() => `worker-${Math.random().toString(36).slice(2)}-${Date.now()}`)
  }

  /**
   * Run one sweep. Safe to call from any replica on any cadence: the durable
   * claim serializes concurrent runs, and the persisted cursor makes an
   * interrupted sweep resume rather than restart.
   */
  async sweep(): Promise<AbandonedUploadSweepResult> {
    const ownerToken = this.newOwnerToken()
    const startedAt = this.now()

    const claim = await this.claims.acquire({
      claimName: ABANDONED_UPLOAD_CLAIM,
      ownerToken,
      leaseExpiresAt: new Date(startedAt.getTime() + this.leaseDurationMs),
      now: startedAt
    })

    if (!claim) {
      // Another live replica holds the sweep; stand down without touching data.
      return { claimed: false, removed: 0, skipped: 0, completed: false }
    }

    let removed = 0
    let skipped = 0
    let cursor = claim.cursor
    let completed = false

    try {
      // The eligibility threshold is fixed at the start of the sweep so a
      // manifest reserved during the run is never eligible for this pass.
      const reservedOnOrBefore = new Date(startedAt.getTime() - this.maxAgeMs)

      for (;;) {
        const page = await this.lister.listAbandonedPending({
          reservedOnOrBefore,
          cursor,
          limit: this.pageSize
        })

        for (const candidate of page.candidates) {
          if (this.isEligible(candidate, reservedOnOrBefore)) {
            // Idempotent removal: a crash between here and the cursor save
            // simply re-removes on resume, which the remover treats as a no-op.
            await this.remover.removeReservationAndObjectVersions(candidate.scope, candidate.artifactId)
            removed++
          } else {
            skipped++
          }
        }

        cursor = page.nextCursor

        // Persist restart-safe progress after every page. If this replica lost
        // its lease, the save fails and we stop rather than fight the new
        // holder (which resumes from the last durable cursor).
        const heldAt = this.now()
        const retained = await this.claims.saveProgress({
          claimName: ABANDONED_UPLOAD_CLAIM,
          ownerToken,
          cursor,
          leaseExpiresAt: new Date(heldAt.getTime() + this.leaseDurationMs),
          now: heldAt
        })
        if (!retained) {
          return { claimed: true, removed, skipped, completed: false }
        }

        if (!cursor) {
          completed = true
          break
        }
      }
      return { claimed: true, removed, skipped, completed }
    } finally {
      if (completed) {
        await this.claims.release({ claimName: ABANDONED_UPLOAD_CLAIM, ownerToken })
      }
    }
  }

  /**
   * A candidate is eligible only when it is still pending, unreferenced by any
   * Event, and was reserved at or before the abandonment threshold. The lister
   * already filters by age, but the worker re-checks every predicate so a stale
   * or over-broad page can never cause it to remove a live or referenced
   * Artifact (Requirement 8.11).
   */
  private isEligible(candidate: AbandonedUploadCandidate, reservedOnOrBefore: Date): boolean {
    if (!candidate.pending) return false
    if (candidate.referenced) return false
    const reservedAt = Date.parse(candidate.reservedAt)
    if (!Number.isFinite(reservedAt)) return false
    return reservedAt <= reservedOnOrBefore.getTime()
  }
}

// ---------------------------------------------------------------------------
// In-memory implementations for tests and local development.
// ---------------------------------------------------------------------------

/**
 * Deterministic in-memory {@link WorkerClaimStore}. Models a single-holder
 * lease with expiry and a persisted cursor, exactly like the conditional
 * DynamoDB claim row the production store uses. `acquire` succeeds when the
 * claim is unheld or its lease has expired at `now`.
 */
export class InMemoryWorkerClaimStore implements WorkerClaimStore {
  private readonly claims = new Map<string, { owner: string; leaseExpiresAt: number; cursor?: string }>()

  async acquire(input: {
    claimName: string
    ownerToken: string
    leaseExpiresAt: Date
    now: Date
  }): Promise<WorkerClaim | null> {
    const held = this.claims.get(input.claimName)
    const nowMs = input.now.getTime()
    if (held && held.owner !== input.ownerToken && held.leaseExpiresAt > nowMs) {
      // A different, still-live holder owns the claim.
      return null
    }
    const cursor = held?.cursor
    this.claims.set(input.claimName, {
      owner: input.ownerToken,
      leaseExpiresAt: input.leaseExpiresAt.getTime(),
      cursor
    })
    return { ownerToken: input.ownerToken, cursor }
  }

  async saveProgress(input: {
    claimName: string
    ownerToken: string
    cursor: string | undefined
    leaseExpiresAt: Date
    now: Date
  }): Promise<boolean> {
    const held = this.claims.get(input.claimName)
    if (!held || held.owner !== input.ownerToken) {
      // Lost the lease; refuse to overwrite the new holder's progress.
      return false
    }
    this.claims.set(input.claimName, {
      owner: input.ownerToken,
      leaseExpiresAt: input.leaseExpiresAt.getTime(),
      cursor: input.cursor
    })
    return true
  }

  async release(input: { claimName: string; ownerToken: string }): Promise<void> {
    const held = this.claims.get(input.claimName)
    if (held && held.owner === input.ownerToken) {
      this.claims.delete(input.claimName)
    }
  }

  /** Test helper: force a held lease to have expired at the given instant. */
  expireLease(claimName: string): void {
    const held = this.claims.get(claimName)
    if (held) held.leaseExpiresAt = 0
  }

  /** Test helper: read the currently persisted cursor for a claim. */
  peekCursor(claimName: string): string | undefined {
    return this.claims.get(claimName)?.cursor
  }

  /** Test helper: whether a claim is currently held by anyone. */
  isHeld(claimName: string): boolean {
    return this.claims.has(claimName)
  }
}

/**
 * In-memory abandoned-upload lister + remover backed by one candidate list.
 * Removal is idempotent and records how many object versions were deleted per
 * artifact so tests can assert every version is removed.
 */
export class InMemoryAbandonedUploads implements AbandonedUploadLister, AbandonedUploadRemover {
  /** Candidate manifests, keyed by a stable artifact key for ordered paging. */
  private readonly candidates = new Map<string, AbandonedUploadCandidate>()
  /** Object versions per artifact key; deleting removes every entry. */
  private readonly objectVersions = new Map<string, string[]>()
  /** Removed artifact keys, for idempotency + assertions. */
  readonly removed = new Set<string>()

  private key(scope: InvestigationScope, artifactId: string): string {
    return `${scope.tenantId}\u0000${scope.spaceId}\u0000${scope.investigationId}\u0000${artifactId}`
  }

  /** Seed a pending reservation with the given backing object versions. */
  addPending(
    candidate: AbandonedUploadCandidate,
    versionIds: string[] = ['v1']
  ): void {
    const k = this.key(candidate.scope, candidate.artifactId)
    this.candidates.set(k, candidate)
    this.objectVersions.set(k, [...versionIds])
  }

  async listAbandonedPending(input: {
    reservedOnOrBefore: Date
    cursor?: string
    limit: number
  }): Promise<{ candidates: AbandonedUploadCandidate[]; nextCursor?: string }> {
    // Stable ordering by insertion key; the cursor is the last key returned.
    const keys = [...this.candidates.keys()].sort()
    const start = input.cursor ? keys.indexOf(input.cursor) + 1 : 0
    const slice = keys.slice(start, start + input.limit)
    const candidates = slice.map((k) => this.candidates.get(k)!)
    const lastKey = slice.length > 0 ? slice[slice.length - 1] : undefined
    const hasMore = lastKey ? keys.indexOf(lastKey) < keys.length - 1 : false
    return { candidates, nextCursor: hasMore ? lastKey : undefined }
  }

  async removeReservationAndObjectVersions(scope: InvestigationScope, artifactId: string): Promise<void> {
    const k = this.key(scope, artifactId)
    // Idempotent: a repeated removal after a crash is a no-op success.
    this.candidates.delete(k)
    this.objectVersions.delete(k)
    this.removed.add(k)
  }

  /** Test helper: object versions still present for an artifact (empty when removed). */
  versionsFor(scope: InvestigationScope, artifactId: string): string[] {
    return this.objectVersions.get(this.key(scope, artifactId)) ?? []
  }

  /** Test helper: whether a candidate manifest still exists. */
  hasCandidate(scope: InvestigationScope, artifactId: string): boolean {
    return this.candidates.has(this.key(scope, artifactId))
  }
}

// ---------------------------------------------------------------------------
// Production wiring factory.
// ---------------------------------------------------------------------------

/** Everything the production worker needs to reach DynamoDB and S3. */
export interface AbandonedUploadWorkerDeps {
  dynamo: DynamoDBClient
  s3: S3Client
  /** The dedicated Cloud_Record_Store table (task 3.1). */
  tableName: string
  /** The dedicated versioned Object_Store bucket (task 3.1). */
  bucket: string
  /** The enabled Team_Spaces to sweep (from the published Organization_Profile). */
  spaces: readonly SpaceScope[]
}

/**
 * Assemble the production {@link AbandonedUploadCleanupWorker} bound to the
 * DynamoDB `PendingManifestLifecycle` GSI (lister + durable claim) and the
 * versioned S3 Object_Store (version deletion). This is what the process the
 * EventBridge schedule invokes constructs and calls `sweep()` on; it has no
 * dashboard, browser, or report-scheduler dependency (Requirement 20.12).
 */
export function createAbandonedUploadCleanupWorker(
  deps: AbandonedUploadWorkerDeps,
  config: AbandonedUploadWorkerConfig = {}
): AbandonedUploadCleanupWorker {
  const lister = new DynamoAbandonedUploadLister(deps.dynamo, deps.tableName, deps.spaces)
  const remover = new S3AndRecordAbandonedUploadRemover(deps.dynamo, deps.s3, {
    tableName: deps.tableName,
    bucket: deps.bucket
  })
  const claims = new DynamoWorkerClaimStore(deps.dynamo, { tableName: deps.tableName })
  return new AbandonedUploadCleanupWorker(lister, remover, claims, config)
}
