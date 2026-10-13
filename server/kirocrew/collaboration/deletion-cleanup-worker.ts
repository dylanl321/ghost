/**
 * Shared Investigations — Object_Store permanent-deletion cleanup worker
 * (task 4.4).
 *
 * Owner: Ghostv2 GHOST_Admin_Service Object_Store cleanup worker. The
 * disabled-first EventBridge schedule that drives it is the `deletion_cleanup`
 * schedule in `terraform/modules/collaboration/scheduler.tf` (task 3.1); this
 * module is the TypeScript worker logic the schedule invokes.
 *
 * What it does (Requirements 20.4, 20.5, 20.9, 20.11, 20.12, 24.18):
 *
 *   - Walks Investigations that have a Tombstone with an unfinished cleanup job
 *     and, for each, removes every content-bearing record (metadata, Runs,
 *     Events, Checkpoints, Artifact manifests, subject pointers), every
 *     content-bearing projection, and EVERY version — including delete markers —
 *     of every backing Object_Store object. The content-free Tombstone and its
 *     deletion feed item are deliberately NOT removed: after cleanup the
 *     Tombstone is the minimal retained receipt and the feed item remains so
 *     late-synchronizing clients still learn the deletion (Requirement 20.5,
 *     20.6, 20.8).
 *
 *   - Persists restart-safe progress. A single durable claim serializes replicas
 *     and each Investigation's cleanup advances a persisted per-job cursor, so a
 *     replica that crashes mid-sweep — or a later scheduled run on another
 *     replica — resumes without redoing completed removals or skipping pending
 *     ones (Requirement 20.5, 20.12).
 *
 *   - Never restores access on failure. A removal error leaves the job in
 *     `failed`/`in-progress` and the Tombstone untouched; the record stays
 *     `Tombstoned` and the next run resumes from the durable cursor
 *     (Requirement 20.9, 20.11). Because the Tombstone already denied access
 *     when it was written (`admin-deletion.ts`), cleanup progress never gates
 *     denial.
 *
 *   - Runs entirely from a durable claim + cursor with no dashboard, browser, or
 *     report scheduler (Requirement 20.12).
 *
 * Like the abandoned-upload worker, this depends only on narrow ports so it is
 * fully testable against in-memory fakes; production wiring binds the ports to
 * the CollaborationRepository (DynamoDB) and the ArtifactStore's versioned
 * bucket. The durable-claim port ({@link WorkerClaimStore}) is shared with the
 * abandoned-upload worker (`lifecycle-worker.ts`).
 */

import type { InvestigationScope } from './keys'
import type { WorkerClaim, WorkerClaimStore } from './lifecycle-worker'

/** The canonical claim name for the permanent-deletion cleanup sweep. */
export const DELETION_CLEANUP_CLAIM = 'tombstone-deletion-cleanup'

/**
 * A tombstoned Investigation whose physical cleanup is not yet complete. This is
 * the minimal projection the worker needs: the scope to remove, the durable
 * per-job cursor to resume from, and running counts for the retained receipt.
 */
export interface TombstonedCleanupCandidate {
  scope: InvestigationScope
  /** Opaque restart-safe cursor persisted by the previous run, if any. */
  progressCursor?: string
  removedObjectVersions: number
  removedRecords: number
}

/**
 * Lists tombstoned Investigations with unfinished cleanup, without a routine
 * table scan. The concrete implementation resolves this from the
 * `DELETE#… / JOB#{step}` rows whose `cleanupState` is not `complete`; the
 * worker only sees the safe projection above. `cursor` is the opaque,
 * restart-safe sweep position; `undefined` starts from the beginning.
 */
export interface TombstonedCleanupLister {
  listPendingDeletions(input: {
    cursor?: string
    limit: number
  }): Promise<{ candidates: TombstonedCleanupCandidate[]; nextCursor?: string }>
}

/** The progress of removing one Investigation's content + object versions. */
export interface DeletionCleanupProgress {
  /** Opaque cursor to resume this Investigation's cleanup; absent when done. */
  nextCursor?: string
  /** Object versions (including delete markers) removed in this step. */
  removedObjectVersions: number
  /** Content records + projections removed in this step. */
  removedRecords: number
  /** True when this Investigation's content and object versions are fully gone. */
  completed: boolean
}

/**
 * Removes an Investigation's content records/projections and every backing
 * object version, in bounded, restart-safe steps.
 *
 * One call advances the cleanup by one bounded batch and returns a cursor to
 * resume from (or `completed: true` when nothing remains). It MUST be
 * idempotent per position: re-invoking with the same cursor after a crash
 * re-attempts only the not-yet-removed items and never re-counts an
 * already-removed one, so a retry cannot double-count or resurrect data. It MUST
 * remove EVERY object version and delete marker under the Investigation prefix
 * before reporting `completed` (Requirement 20.4, 24.18).
 *
 * The content-free Tombstone and its deletion feed item are out of scope for
 * this remover — they are the retained receipt (Requirement 20.6).
 */
export interface DeletionContentRemover {
  removeNextBatch(
    scope: InvestigationScope,
    cursor: string | undefined,
    limit: number
  ): Promise<DeletionCleanupProgress>
}

/**
 * Records restart-safe progress for one Investigation's cleanup and finalizes
 * the retained receipt. The concrete implementation updates the
 * `DELETE#… / JOB#{step}` row (and, on completion, reduces the Tombstone to the
 * minimal receipt: `cleanupState: 'complete'` plus counts).
 */
export interface DeletionJobProgressStore {
  /** Persist a mid-cleanup cursor + running counts for an Investigation. */
  saveJobProgress(input: {
    scope: InvestigationScope
    cursor: string | undefined
    removedObjectVersions: number
    removedRecords: number
    now: Date
  }): Promise<void>

  /**
   * Mark an Investigation's cleanup complete: flip the job + Tombstone to
   * `complete` and stamp the final content-free receipt counts. After this the
   * Tombstone is the ONLY retained record for the identifier (Requirement 20.5,
   * 20.6).
   */
  completeJob(input: {
    scope: InvestigationScope
    removedObjectVersions: number
    removedRecords: number
    now: Date
  }): Promise<void>

  /**
   * Record that a cleanup step failed. Leaves the record `Tombstoned` and the
   * job resumable; NEVER restores access (Requirement 20.9, 20.11).
   */
  failJob(input: { scope: InvestigationScope; now: Date }): Promise<void>
}

export interface DeletionCleanupWorkerConfig {
  /** How many tombstoned Investigations to page per sweep round. */
  pageSize?: number
  /** Batch size for object-version / record removal within one Investigation. */
  removalBatchSize?: number
  /** How long each acquired lease lasts before another replica may take over. */
  leaseDurationMs?: number
  /** Injectable clock for deterministic tests. */
  now?: () => Date
  /** Injectable owner-token generator for deterministic tests. */
  newOwnerToken?: () => string
}

/** Outcome of a single scheduled deletion-cleanup sweep. */
export interface DeletionCleanupSweepResult {
  /** False when another live replica held the claim and this run stood down. */
  claimed: boolean
  /** Number of tombstoned Investigations fully cleaned in this sweep. */
  completed: number
  /** Number left in progress (bounded out this round; resume next cadence). */
  inProgress: number
  /** Number that failed a removal step (stay Tombstoned, resume next run). */
  failed: number
  /** Total object versions removed across all Investigations this sweep. */
  removedObjectVersions: number
  /** Total content records/projections removed across all Investigations. */
  removedRecords: number
  /** True when the sweep reached the end of the pending-deletion list. */
  swept: boolean
}

/**
 * The permanent-deletion Object_Store cleanup worker. One `sweep()` is what the
 * `deletion_cleanup` EventBridge schedule invokes on its cadence. The worker:
 *
 *   1. Acquires the durable claim (or stands down if a live replica holds it),
 *      resuming the sweep from the persisted cursor.
 *   2. Pages through tombstoned Investigations with unfinished cleanup and, for
 *      each, removes content records/projections and every object version in
 *      bounded, restart-safe batches, persisting the per-job cursor as it goes.
 *   3. On completing an Investigation, reduces its Tombstone to the minimal
 *      retained receipt; on a removal error, records a failure that keeps the
 *      record Tombstoned and resumable.
 *   4. Persists the sweep cursor after each page so a crash resumes mid-sweep,
 *      and releases the claim when the sweep finishes.
 *
 * It never depends on an open dashboard or browser and is independent of report
 * scheduling (Requirement 20.12).
 */
export class DeletionCleanupWorker {
  private readonly pageSize: number
  private readonly removalBatchSize: number
  private readonly leaseDurationMs: number
  private readonly now: () => Date
  private readonly newOwnerToken: () => string

  constructor(
    private readonly lister: TombstonedCleanupLister,
    private readonly remover: DeletionContentRemover,
    private readonly progress: DeletionJobProgressStore,
    private readonly claims: WorkerClaimStore,
    config: DeletionCleanupWorkerConfig = {}
  ) {
    this.pageSize = config.pageSize ?? 50
    this.removalBatchSize = config.removalBatchSize ?? 200
    this.leaseDurationMs = config.leaseDurationMs ?? 5 * 60 * 1000
    this.now = config.now ?? (() => new Date())
    this.newOwnerToken =
      config.newOwnerToken ?? (() => `deletion-worker-${Math.random().toString(36).slice(2)}-${Date.now()}`)
  }

  /**
   * Run one sweep. Safe to call from any replica on any cadence: the durable
   * claim serializes concurrent runs, the sweep cursor makes an interrupted
   * sweep resume rather than restart, and each Investigation's per-job cursor
   * makes an interrupted single cleanup resume rather than restart.
   */
  async sweep(): Promise<DeletionCleanupSweepResult> {
    const ownerToken = this.newOwnerToken()
    const startedAt = this.now()

    const claim: WorkerClaim | null = await this.claims.acquire({
      claimName: DELETION_CLEANUP_CLAIM,
      ownerToken,
      leaseExpiresAt: new Date(startedAt.getTime() + this.leaseDurationMs),
      now: startedAt
    })
    if (!claim) {
      // Another live replica holds the sweep; stand down without touching data.
      return this.emptyResult(false)
    }

    let completed = 0
    let inProgress = 0
    let failed = 0
    let removedObjectVersions = 0
    let removedRecords = 0
    let cursor = claim.cursor
    let swept = false

    try {
      for (;;) {
        const page = await this.lister.listPendingDeletions({ cursor, limit: this.pageSize })

        for (const candidate of page.candidates) {
          const outcome = await this.cleanupOne(candidate)
          removedObjectVersions += outcome.removedObjectVersions
          removedRecords += outcome.removedRecords
          if (outcome.kind === 'completed') completed++
          else if (outcome.kind === 'in-progress') inProgress++
          else failed++
        }

        cursor = page.nextCursor

        // Persist restart-safe sweep progress after every page. If this replica
        // lost its lease, stop rather than fight the new holder (which resumes
        // from the last durable sweep cursor).
        const heldAt = this.now()
        const retained = await this.claims.saveProgress({
          claimName: DELETION_CLEANUP_CLAIM,
          ownerToken,
          cursor,
          leaseExpiresAt: new Date(heldAt.getTime() + this.leaseDurationMs),
          now: heldAt
        })
        if (!retained) {
          return { claimed: true, completed, inProgress, failed, removedObjectVersions, removedRecords, swept: false }
        }

        if (!cursor) {
          swept = true
          break
        }
      }
      return { claimed: true, completed, inProgress, failed, removedObjectVersions, removedRecords, swept }
    } finally {
      if (swept) {
        await this.claims.release({ claimName: DELETION_CLEANUP_CLAIM, ownerToken })
      }
    }
  }

  /**
   * Remove one Investigation's content + object versions in bounded batches,
   * resuming from its durable per-job cursor. Returns whether it finished, ran
   * out of this sweep's budget (still in progress), or failed.
   *
   * A failure keeps the record Tombstoned and resumable — access is never
   * restored (Requirement 20.9, 20.11).
   */
  private async cleanupOne(candidate: TombstonedCleanupCandidate): Promise<{
    kind: 'completed' | 'in-progress' | 'failed'
    removedObjectVersions: number
    removedRecords: number
  }> {
    let cursor = candidate.progressCursor
    let removedObjectVersions = 0
    let removedRecords = 0

    try {
      const step = await this.remover.removeNextBatch(candidate.scope, cursor, this.removalBatchSize)
      removedObjectVersions += step.removedObjectVersions
      removedRecords += step.removedRecords
      cursor = step.nextCursor

      const totalObjectVersions = candidate.removedObjectVersions + removedObjectVersions
      const totalRecords = candidate.removedRecords + removedRecords

      if (step.completed) {
        // Every object version and content record is gone: reduce the Tombstone
        // to the minimal retained receipt (Requirement 20.5, 20.6).
        await this.progress.completeJob({
          scope: candidate.scope,
          removedObjectVersions: totalObjectVersions,
          removedRecords: totalRecords,
          now: this.now()
        })
        return { kind: 'completed', removedObjectVersions, removedRecords }
      }

      // More remains than this batch removed: persist the resume cursor so the
      // next run continues rather than restarts (Requirement 20.5).
      await this.progress.saveJobProgress({
        scope: candidate.scope,
        cursor,
        removedObjectVersions: totalObjectVersions,
        removedRecords: totalRecords,
        now: this.now()
      })
      return { kind: 'in-progress', removedObjectVersions, removedRecords }
    } catch {
      // Never restore access: keep the record Tombstoned and the job resumable.
      await this.progress.failJob({ scope: candidate.scope, now: this.now() })
      return { kind: 'failed', removedObjectVersions, removedRecords }
    }
  }

  private emptyResult(claimed: boolean): DeletionCleanupSweepResult {
    return { claimed, completed: 0, inProgress: 0, failed: 0, removedObjectVersions: 0, removedRecords: 0, swept: false }
  }
}

// ---------------------------------------------------------------------------
// In-memory implementations for tests and local development.
// ---------------------------------------------------------------------------

/** A tombstoned Investigation's removable content, for the in-memory fake. */
interface InMemoryDeletionTarget {
  scope: InvestigationScope
  /** Remaining content records/projections (opaque ids) still to remove. */
  records: string[]
  /** Remaining object versions (including delete markers) still to remove. */
  objectVersions: string[]
  progressCursor?: string
  removedObjectVersions: number
  removedRecords: number
  cleanupState: 'pending' | 'in-progress' | 'failed' | 'complete'
  /** When >0, the next `removeNextBatch` throws to model a cleanup failure. */
  failuresToInject: number
}

/**
 * In-memory tombstoned-deletion lister + remover + progress store backed by one
 * target list. Removal is idempotent per position and records how many object
 * versions/records were removed so tests can assert every version is gone.
 */
export class InMemoryDeletionCleanup
  implements TombstonedCleanupLister, DeletionContentRemover, DeletionJobProgressStore
{
  private readonly targets = new Map<string, InMemoryDeletionTarget>()

  private key(scope: InvestigationScope): string {
    return `${scope.tenantId}\u0000${scope.spaceId}\u0000${scope.investigationId}`
  }

  /** Seed a tombstoned Investigation with content records + object versions. */
  addTombstoned(
    scope: InvestigationScope,
    input: { records?: string[]; objectVersions?: string[]; failuresToInject?: number } = {}
  ): void {
    this.targets.set(this.key(scope), {
      scope,
      records: [...(input.records ?? ['meta', 'run-1', 'event-1'])],
      objectVersions: [...(input.objectVersions ?? ['v1', 'v2'])],
      removedObjectVersions: 0,
      removedRecords: 0,
      cleanupState: 'pending',
      failuresToInject: input.failuresToInject ?? 0
    })
  }

  async listPendingDeletions(input: {
    cursor?: string
    limit: number
  }): Promise<{ candidates: TombstonedCleanupCandidate[]; nextCursor?: string }> {
    // Only jobs not yet complete are candidates; ordered by stable key.
    const keys = [...this.targets.keys()]
      .filter((k) => this.targets.get(k)!.cleanupState !== 'complete')
      .sort()
    const start = input.cursor ? keys.indexOf(input.cursor) + 1 : 0
    const slice = keys.slice(start, start + input.limit)
    const candidates = slice.map((k) => {
      const t = this.targets.get(k)!
      return {
        scope: t.scope,
        progressCursor: t.progressCursor,
        removedObjectVersions: t.removedObjectVersions,
        removedRecords: t.removedRecords
      }
    })
    const lastKey = slice.length > 0 ? slice[slice.length - 1] : undefined
    const hasMore = lastKey ? keys.indexOf(lastKey) < keys.length - 1 : false
    return { candidates, nextCursor: hasMore ? lastKey : undefined }
  }

  async removeNextBatch(
    scope: InvestigationScope,
    _cursor: string | undefined,
    limit: number
  ): Promise<DeletionCleanupProgress> {
    const t = this.targets.get(this.key(scope))
    if (!t) return { removedObjectVersions: 0, removedRecords: 0, completed: true }
    if (t.failuresToInject > 0) {
      t.failuresToInject--
      throw new Error('injected cleanup failure')
    }
    // Remove object versions first, then content records, up to `limit` each.
    const versions = t.objectVersions.splice(0, limit)
    const records = t.records.splice(0, limit)
    const completed = t.objectVersions.length === 0 && t.records.length === 0
    return {
      removedObjectVersions: versions.length,
      removedRecords: records.length,
      completed,
      nextCursor: completed ? undefined : `pos-${t.removedObjectVersions + versions.length}`
    }
  }

  async saveJobProgress(input: {
    scope: InvestigationScope
    cursor: string | undefined
    removedObjectVersions: number
    removedRecords: number
    now: Date
  }): Promise<void> {
    const t = this.targets.get(this.key(input.scope))
    if (!t) return
    t.progressCursor = input.cursor
    t.removedObjectVersions = input.removedObjectVersions
    t.removedRecords = input.removedRecords
    t.cleanupState = 'in-progress'
  }

  async completeJob(input: {
    scope: InvestigationScope
    removedObjectVersions: number
    removedRecords: number
    now: Date
  }): Promise<void> {
    const t = this.targets.get(this.key(input.scope))
    if (!t) return
    t.progressCursor = undefined
    t.removedObjectVersions = input.removedObjectVersions
    t.removedRecords = input.removedRecords
    t.cleanupState = 'complete'
  }

  async failJob(input: { scope: InvestigationScope; now: Date }): Promise<void> {
    const t = this.targets.get(this.key(input.scope))
    if (!t) return
    t.cleanupState = 'failed'
  }

  // --- Test helpers ---------------------------------------------------------

  /** Object versions still present for an Investigation (empty when cleaned). */
  versionsFor(scope: InvestigationScope): string[] {
    return this.targets.get(this.key(scope))?.objectVersions ?? []
  }

  /** Content records still present for an Investigation (empty when cleaned). */
  recordsFor(scope: InvestigationScope): string[] {
    return this.targets.get(this.key(scope))?.records ?? []
  }

  /** Current cleanup state for an Investigation. */
  stateFor(scope: InvestigationScope): string | undefined {
    return this.targets.get(this.key(scope))?.cleanupState
  }
}
