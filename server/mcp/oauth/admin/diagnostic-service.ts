/**
 * OAuth Administration — durable diagnostic job service (task 11.1).
 *
 * `OAuthDiagnosticService` owns the SAFE, cancellable, bounded diagnostic jobs
 * from Requirement 11 and the design "Diagnostics, maintenance, and alerts". It:
 *   - Accepts ONLY the named approved checks (rejecting unknown/arbitrary
 *     targets — Req 11.1). Each check derives its target from the current
 *     provider/resource configuration; a caller never supplies a URL/target.
 *   - Durably reserves a diagnostic job (`state: 'pending'`) BEFORE running it
 *     (durable intent — Req 13.2) and audits the reservation.
 *   - Bounds a job to at most 2 checks; enforces at most 2 concurrent jobs per
 *     deployment via the OAuth-specific maintenance lock namespace; times out an
 *     individual check at 5s and a whole job at 30s; keeps a RENEWABLE lease;
 *     persists SAFE incremental results between steps; and observes a durable
 *     cancellation flag between steps (Req 11.2, 11.5).
 *   - Resolves a lost lease / interruption / uncompleted check to
 *     `interrupted` / `failed` / `unknown` — NEVER `completed`/success (Req 11.5).
 *
 * The maintenance/scheduler WIRING (the polling loop, routes) is task 11.2. This
 * service exposes a self-contained `runJob()` (and per-step `runStep()`) the
 * route/scheduler drives, plus a synchronous `create()`→`runJob()` path tests
 * exercise directly against the in-memory repository + lock store.
 *
 * SAFETY: results are passed through the redactor (safe summaries only, no raw
 * bodies); the audit uses the same operation/audit patterns as
 * {@link OAuthAdminOperationService}.
 */

import { createHash, randomBytes } from 'node:crypto'
import type {
  IsoDateTime,
  OAuthAuditRecord,
  OAuthDiagnosticCheck,
  OAuthDiagnosticCheckResult,
  OAuthDiagnosticJob,
  OAuthDiagnosticJobState,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRedactor, OAuthAdminRepository } from './types'
import { oauthAdminErrors } from './access-service'
import { oauthAdminRedactor } from './redactor'
import { logicalExpiryFor } from './repository-support'
import {
  DIAGNOSTIC_CHECK_IMPLEMENTATIONS,
  isApprovedCheck,
  type DiagnosticProbeContext
} from './diagnostic-checks'
import {
  DEFAULT_MAINTENANCE_LEASE_MS,
  getOAuthMaintenanceLockStore,
  maintenanceLockKey,
  type OAuthMaintenanceLease,
  type OAuthMaintenanceLockStore
} from './oauth-maintenance-lock'

/** Maximum checks a single diagnostic job may run (design: 2 per job). */
export const MAX_CHECKS_PER_JOB = 2
/** Maximum concurrent diagnostic jobs per deployment (design: 2 per deployment). */
export const MAX_JOBS_PER_DEPLOYMENT = 2
/** Per-check timeout (design: 5 seconds). */
export const CHECK_TIMEOUT_MS = 5 * 1000
/** Per-job timeout / deadline (design: 30 seconds). */
export const JOB_TIMEOUT_MS = 30 * 1000

/** Options bounding a job run; injectable for deterministic tests. */
export interface RunJobOptions {
  /** Injected probe context passed to each check. */
  probe?: DiagnosticProbeContext
  /** Per-check timeout override (ms). */
  checkTimeoutMs?: number
  /** Per-job timeout override (ms). */
  jobTimeoutMs?: number
  /** Lease duration for the per-job lock (ms). */
  leaseMs?: number
}

/**
 * A single named-check step used by the maintenance loop. Runs one check under
 * its timeout, mapping any timeout/failure to a non-success result.
 */
export async function runCheckStep(
  check: OAuthDiagnosticCheck,
  probe: DiagnosticProbeContext | undefined,
  timeoutMs: number,
  now: () => number
): Promise<OAuthDiagnosticCheckResult> {
  const implementation = DIAGNOSTIC_CHECK_IMPLEMENTATIONS[check]
  const observedAt = new Date(now()).toISOString()
  if (!implementation) {
    // Defence in depth: a job should never carry a non-approved check, but a
    // corrupted record resolves to a safe failure, never success.
    return { check, outcome: 'failure', summary: 'Unknown diagnostic check.', observedAt }
  }
  try {
    return await withTimeout(implementation(probe), timeoutMs, () => ({
      check,
      outcome: 'unknown' as const,
      summary: 'Diagnostic check exceeded its time budget before completing.',
      observedAt
    }))
  } catch {
    // A check that throws cannot complete — non-success (Req 11.5).
    return { check, outcome: 'failure', summary: 'Diagnostic check failed to complete.', observedAt }
  }
}

/**
 * Race a promise against a timeout. On timeout, resolves with `onTimeout()`
 * rather than rejecting, so a slow check produces a safe non-success result
 * without unhandled rejection.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => T): Promise<T> {
  return new Promise<T>(resolve => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(onTimeout())
    }, timeoutMs)
    promise.then(
      value => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(onTimeout())
      }
    )
  })
}

/**
 * The durable diagnostic service. Constructed with an injected repository, lock
 * store, redactor, and clock so tests exercise the full lifecycle against the
 * in-memory fixtures.
 */
export class OAuthDiagnosticService {
  constructor(
    private readonly repository: OAuthAdminRepository,
    private readonly lockStore: OAuthMaintenanceLockStore = getOAuthMaintenanceLockStore(),
    private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor,
    private readonly now: () => number = Date.now
  ) {}

  private isoNow(): IsoDateTime {
    return new Date(this.now()).toISOString()
  }

  /** Derive a stable, deployment/actor-scoped job id from the idempotency key. */
  private jobIdFor(access: OAuthAdminAccessContext, idempotencyKey: string): OpaqueReference {
    const hash = createHash('sha256')
    hash.update(access.deployment.deploymentId)
    hash.update('\u0000')
    hash.update(access.actor)
    hash.update('\u0000')
    hash.update('diagnostic.run')
    hash.update('\u0000')
    hash.update(idempotencyKey)
    return `job_${hash.digest('base64url').slice(0, 24)}`
  }

  private auditIdFor(jobId: OpaqueReference, phase: 'intent' | 'outcome'): OpaqueReference {
    const hash = createHash('sha256')
    hash.update(jobId)
    hash.update('\u0000')
    hash.update(phase)
    return `aud_${hash.digest('base64url').slice(0, 24)}`
  }

  /**
   * Durably reserve a diagnostic job (`state: 'pending'`) BEFORE it runs.
   *
   * Validation (Req 11.1):
   *   - At least one check and at most {@link MAX_CHECKS_PER_JOB}.
   *   - EVERY check must be one of the named approved checks; any unknown or
   *     arbitrary target is rejected before reservation.
   *
   * Idempotency: a retry with the same scoped idempotency key returns the
   * existing job rather than reserving another (Req 13.2 durable intent).
   */
  async create(
    access: OAuthAdminAccessContext,
    checks: OAuthDiagnosticCheck[],
    reason: string,
    idempotencyKey: string
  ): Promise<OAuthDiagnosticJob> {
    if (!Array.isArray(checks) || checks.length === 0) {
      throw oauthAdminErrors.badRequest({ message: 'At least one named diagnostic check is required.' })
    }
    if (checks.length > MAX_CHECKS_PER_JOB) {
      throw oauthAdminErrors.badRequest({
        message: `A diagnostic job accepts at most ${MAX_CHECKS_PER_JOB} checks.`
      })
    }
    // Reject unknown/arbitrary targets — only the named checks are accepted.
    for (const check of checks) {
      if (!isApprovedCheck(check)) {
        throw oauthAdminErrors.badRequest({
          message: 'Unknown diagnostic check requested.',
          data: { reason: 'UNKNOWN_CHECK' }
        })
      }
    }

    const jobId = this.jobIdFor(access, idempotencyKey)
    const existing = await this.repository.getDiagnosticJob(access.deployment, jobId)
    if (existing) return existing

    const job: OAuthDiagnosticJob = {
      jobId,
      checks: [...checks],
      actor: access.actor,
      deployment: access.deployment.environment,
      state: 'pending',
      cancellationRequested: false,
      deadlineAt: new Date(this.now() + JOB_TIMEOUT_MS).toISOString(),
      results: [],
      observedAt: this.isoNow()
    }

    try {
      // Durable intent before running (Req 13.2). Require-absent so a concurrent
      // duplicate submission reconciles to the winner.
      await this.repository.putDiagnosticJob(access.deployment, job, { requireAbsent: true })
    } catch (error: any) {
      if (error?.statusCode === 409 || error?.code === 'OPERATION_IN_PROGRESS') {
        const winner = await this.repository.getDiagnosticJob(access.deployment, jobId)
        if (winner) return winner
      }
      throw oauthAdminErrors.conflict({
        message: 'Could not reserve durable diagnostic intent; the job was not started.',
        data: { reason: 'INTENT_RESERVATION_FAILED' }
      })
    }

    await this.writeAudit(access, job, 'unknown')
    return job
  }

  /**
   * Request cancellation of a job. Sets the durable cancellation flag; the
   * runner observes it BETWEEN steps and resolves the job to `cancelled`
   * without running remaining checks. Terminal jobs are returned unchanged.
   */
  async cancel(access: OAuthAdminAccessContext, jobId: OpaqueReference): Promise<OAuthDiagnosticJob> {
    const job = await this.repository.getDiagnosticJob(access.deployment, jobId)
    if (!job) throw oauthAdminErrors.notFound({ message: 'Diagnostic job not found.' })
    if (isTerminal(job.state)) return job
    const updated: OAuthDiagnosticJob = { ...job, cancellationRequested: true }
    await this.repository.putDiagnosticJob(access.deployment, updated)
    return updated
  }

  /** Poll/get the current state of a diagnostic job for the status route. */
  async get(access: OAuthAdminAccessContext, jobId: OpaqueReference): Promise<OAuthDiagnosticJob | null> {
    return this.repository.getDiagnosticJob(access.deployment, jobId)
  }

  /**
   * Run a reserved diagnostic job to a terminal state.
   *
   * Concurrency: acquires the per-job maintenance lock and enforces at most
   * {@link MAX_JOBS_PER_DEPLOYMENT} concurrent jobs (a job that cannot acquire a
   * concurrency slot stays `pending` and is retried by the loop). Between steps
   * it renews the lease and re-reads the durable job to observe cancellation and
   * detect a lost lease.
   *
   * Resolution rules (Req 11.5):
   *   - Lost lease  → `interrupted`.
   *   - Cancellation → `cancelled`.
   *   - Job deadline exceeded → `interrupted`.
   *   - Any check non-success is preserved; the job is `completed` only when
   *     ALL checks ran and NONE reported failure/unknown. Otherwise `failed`.
   */
  async runJob(
    access: OAuthAdminAccessContext,
    jobId: OpaqueReference,
    options: RunJobOptions = {}
  ): Promise<OAuthDiagnosticJob> {
    const checkTimeoutMs = options.checkTimeoutMs ?? CHECK_TIMEOUT_MS
    const jobTimeoutMs = options.jobTimeoutMs ?? JOB_TIMEOUT_MS
    const leaseMs = options.leaseMs ?? DEFAULT_MAINTENANCE_LEASE_MS

    let job = await this.repository.getDiagnosticJob(access.deployment, jobId)
    if (!job) throw oauthAdminErrors.notFound({ message: 'Diagnostic job not found.' })
    if (isTerminal(job.state)) return job

    // Claim the per-job lock (renewable lease) FIRST. A job already being worked
    // on by another container cannot be double-run.
    const jobLockKey = maintenanceLockKey(access.deployment, `job#${jobId}`)
    const jobLock = await this.lockStore.claim(jobLockKey, leaseMs, this.now())
    if (!jobLock) return job // another worker holds this job.

    // Enforce bounded concurrency per deployment: hold ONE of the fixed slot
    // locks for the whole run. At most MAX_JOBS_PER_DEPLOYMENT slot locks can be
    // held across the deployment, so no more than that many jobs run at once.
    const slotLock = await this.acquireConcurrencySlot(access, leaseMs)
    if (!slotLock) {
      // No concurrency slot free — release the job lock and leave it pending for
      // the loop to retry on a later tick.
      await this.lockStore.release(jobLock)
      return job
    }

    // `lease` renews the job lock; the slot lock is renewed alongside it.
    let lease: OAuthMaintenanceLease | null = jobLock
    const startedMs = this.now()
    const deadlineMs = startedMs + jobTimeoutMs

    try {
      job = await this.transition(access, job, 'running', { leaseExpiresAt: new Date(lease.expiresAt).toISOString() })
      const results: OAuthDiagnosticCheckResult[] = [...(job.results || [])]
      const alreadyRun = new Set(results.map(entry => entry.check))

      for (const check of job.checks) {
        if (alreadyRun.has(check)) continue

        // Between steps: observe cancellation and the job deadline first.
        const latest = await this.repository.getDiagnosticJob(access.deployment, jobId)
        if (latest?.cancellationRequested) {
          return this.resolve(access, jobId, 'cancelled', results)
        }
        if (this.now() >= deadlineMs) {
          return this.resolve(access, jobId, 'interrupted', results)
        }

        // Renew both leases; a failed renew means we LOST the lease → interrupted.
        lease = await this.lockStore.renew(lease as OAuthMaintenanceLease, leaseMs, this.now())
        const renewedSlot = await this.lockStore.renew(slotLock, leaseMs, this.now())
        if (!lease || !renewedSlot) {
          await this.lockStore.release(slotLock)
          return this.resolveWithoutLock(access, jobId, 'interrupted', results)
        }

        // Bound the per-check time so it cannot exceed the remaining job budget.
        const remaining = Math.max(0, deadlineMs - this.now())
        const perCheck = Math.min(checkTimeoutMs, remaining || checkTimeoutMs)
        const result = await runCheckStep(check, options.probe, perCheck, this.now)
        results.push(result)
        alreadyRun.add(check)

        // Persist SAFE incremental results between steps (Req 11.2/11.5).
        job = await this.transition(access, job, 'running', {
          results: this.safeResults(results),
          leaseExpiresAt: new Date(lease.expiresAt).toISOString()
        })
      }

      // All checks ran. Success only if every check succeeded.
      const anyNonSuccess = results.some(entry => entry.outcome !== 'success')
      const finalState: OAuthDiagnosticJobState = anyNonSuccess ? 'failed' : 'completed'
      return this.resolve(access, jobId, finalState, results, lease)
    } catch {
      // An unexpected runner failure resolves to `failed`, never success.
      return this.resolveWithoutLock(access, jobId, 'failed',
        (await this.repository.getDiagnosticJob(access.deployment, jobId))?.results || [])
    } finally {
      if (lease) await this.lockStore.release(lease)
      await this.lockStore.release(slotLock)
    }
  }

  /**
   * Acquire ONE of the fixed per-deployment concurrency slots, held for the
   * whole job run. There are exactly {@link MAX_JOBS_PER_DEPLOYMENT} slot keys,
   * so at most that many jobs can hold a slot at once — the hard per-deployment
   * concurrency cap. Returns the held lease, or `null` when all slots are busy.
   */
  private async acquireConcurrencySlot(
    access: OAuthAdminAccessContext,
    leaseMs: number
  ): Promise<OAuthMaintenanceLease | null> {
    for (let slot = 0; slot < MAX_JOBS_PER_DEPLOYMENT; slot++) {
      const slotKey = maintenanceLockKey(access.deployment, `slot#${slot}`)
      const claimed = await this.lockStore.claim(slotKey, leaseMs, this.now())
      if (claimed) return claimed
    }
    return null
  }

  /** Persist a non-terminal transition, merging safe fields. */
  private async transition(
    access: OAuthAdminAccessContext,
    job: OAuthDiagnosticJob,
    state: OAuthDiagnosticJobState,
    patch: Partial<OAuthDiagnosticJob> = {}
  ): Promise<OAuthDiagnosticJob> {
    const updated: OAuthDiagnosticJob = { ...job, ...patch, state, observedAt: this.isoNow() }
    await this.repository.putDiagnosticJob(access.deployment, updated)
    return updated
  }

  /** Redact results defensively before persistence (no raw bodies). */
  private safeResults(results: OAuthDiagnosticCheckResult[]): OAuthDiagnosticCheckResult[] {
    return results.map(entry => this.redactor.redact(entry))
  }

  /** Resolve a job to a terminal state, release the lock, and audit. */
  private async resolve(
    access: OAuthAdminAccessContext,
    jobId: OpaqueReference,
    state: OAuthDiagnosticJobState,
    results: OAuthDiagnosticCheckResult[],
    lease?: OAuthMaintenanceLease | null
  ): Promise<OAuthDiagnosticJob> {
    if (lease) await this.lockStore.release(lease)
    return this.finalize(access, jobId, state, results)
  }

  /** Resolve to terminal state when the lock is already lost/released. */
  private async resolveWithoutLock(
    access: OAuthAdminAccessContext,
    jobId: OpaqueReference,
    state: OAuthDiagnosticJobState,
    results: OAuthDiagnosticCheckResult[]
  ): Promise<OAuthDiagnosticJob> {
    return this.finalize(access, jobId, state, results)
  }

  private async finalize(
    access: OAuthAdminAccessContext,
    jobId: OpaqueReference,
    state: OAuthDiagnosticJobState,
    results: OAuthDiagnosticCheckResult[]
  ): Promise<OAuthDiagnosticJob> {
    const current = await this.repository.getDiagnosticJob(access.deployment, jobId)
    const base: OAuthDiagnosticJob = current || {
      jobId,
      checks: [],
      actor: access.actor,
      deployment: access.deployment.environment,
      state: 'unknown',
      cancellationRequested: false,
      results: []
    }
    const finalized: OAuthDiagnosticJob = {
      ...base,
      state,
      results: this.safeResults(results),
      leaseExpiresAt: undefined,
      observedAt: this.isoNow(),
      verifiedAt: state === 'completed' ? this.isoNow() : base.verifiedAt
    }
    await this.repository.putDiagnosticJob(access.deployment, finalized)
    await this.writeAudit(access, finalized, state === 'completed' ? 'success' : 'failure')
    return finalized
  }

  /** Write a safe diagnostic audit record (intent on create, outcome on finalize). */
  private async writeAudit(
    access: OAuthAdminAccessContext,
    job: OAuthDiagnosticJob,
    outcome: 'success' | 'failure' | 'unknown'
  ): Promise<void> {
    const timestamp = this.isoNow()
    const phase = outcome === 'unknown' ? 'intent' : 'outcome'
    const record: OAuthAuditRecord = {
      auditId: this.auditIdFor(job.jobId, phase),
      timestamp,
      deployment: job.deployment,
      actor: job.actor,
      capability: 'oauth.operations.manage',
      referenceKind: 'diagnostic',
      referenceId: job.jobId,
      changedFields: ['state'],
      after: this.redactor.redact({ state: job.state, checks: job.checks }),
      outcome,
      ...logicalExpiryFor(timestamp, this.now())
    }
    await this.repository.putAuditRecord(access.deployment, record)
  }
}

/** True for a terminal diagnostic job state (no further work). */
export function isTerminal(state: OAuthDiagnosticJobState): boolean {
  return state === 'completed'
    || state === 'failed'
    || state === 'cancelled'
    || state === 'interrupted'
    || state === 'unknown'
}

/** Generate a fresh opaque idempotency key for a diagnostic job. */
export function generateDiagnosticIdempotencyKey(): string {
  return randomBytes(18).toString('base64url')
}
