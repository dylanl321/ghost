/**
 * OAuth Diagnostics Maintenance Loop (task 11.2)
 *
 * Polls pending OAuth diagnostic work every FIVE seconds and drives each pending
 * job to a terminal state under the OAuth-specific maintenance lock (design
 * "Diagnostics, maintenance, and alerts"; Requirements 11.1, 11.5). It reuses
 * the existing scheduler/croner conventions but is INDEPENDENT of the report
 * scheduler:
 *   - A separate croner job, guarded by its own env flag (default-on) so it can
 *     be disabled without touching report scheduling.
 *   - A deployment-scoped `worker` lock in the OAuth maintenance lock NAMESPACE
 *     (never the report execution-lock namespace) so a diagnostics tick can
 *     never collide with report scheduling.
 *   - The bounded concurrency, per-check/per-job timeouts, renewable leases,
 *     cancellation observation, and non-success resolution all live in
 *     {@link OAuthDiagnosticService.runJob}; this loop only discovers pending
 *     jobs and calls it.
 *
 * SAFETY / no-op behavior:
 *   - When there is NO durable administration store, pending diagnostic jobs
 *     cannot be shared across containers, so the loop is a safe no-op (a
 *     memory-only deployment runs its jobs inline via the create route path in
 *     tests, not through this cross-container loop). This keeps the plugin safe
 *     to load everywhere without disturbing local/dev startup.
 *   - Any error is logged and swallowed; a diagnostics failure never affects
 *     OAuth traffic or report scheduling.
 */

import { Cron } from 'croner'
import { logger } from '../utils/logger'
import {
  getOAuthAdminRepository,
  getOAuthMaintenanceLockStore,
  hasDurableOAuthAdminStore,
  maintenanceLockKey,
  resolveOAuthAdminDeploymentContext,
  OAuthDiagnosticService
} from '../mcp/oauth/admin/index'
import type { OAuthAdminAccessContext } from '../mcp/oauth/admin/types'

/** Default-on; set to 'false' to disable the diagnostics loop independently. */
const DIAGNOSTICS_LOOP_ENABLED = process.env.OAUTH_DIAGNOSTICS_LOOP_ENABLED !== 'false'

/** The 5-second poll cadence (design). Croner supports a 6-field (seconds) spec. */
const DIAGNOSTICS_POLL_CRON = '*/5 * * * * *'

/** A short lease for the loop lock so a crashed worker frees it quickly. */
const WORKER_LOCK_LEASE_MS = 15 * 1000

/** Max pending jobs to consider per tick (the service caps actual concurrency). */
const MAX_JOBS_PER_TICK = 4

let diagnosticsJob: Cron | null = null

/**
 * Build the server-actor access context for the maintenance worker. The
 * deployment is server-derived (never caller input); the actor is a stable
 * system label used only for the audit-outcome fallback in `runJob`.
 */
function workerAccess(): OAuthAdminAccessContext {
  return {
    deployment: resolveOAuthAdminDeploymentContext(),
    actor: 'system:oauth-diagnostics-maintenance',
    capabilities: ['oauth.operations.manage']
  }
}

/**
 * Run one maintenance tick: acquire the deployment-scoped worker lock, list
 * pending jobs, and drive each one via `runJob`. The per-job lock + bounded
 * concurrency inside the service prevent double-running and cap parallelism.
 */
async function runDiagnosticsTick(): Promise<void> {
  // No durable store → no cross-container pending work to poll. Safe no-op.
  if (!hasDurableOAuthAdminStore()) return

  const access = workerAccess()
  const lockStore = getOAuthMaintenanceLockStore()
  const workerLockKey = maintenanceLockKey(access.deployment, 'worker')

  // Only one worker per deployment discovers jobs per tick; the per-job locks
  // still guard the actual runs, but this avoids redundant list scans.
  const lease = await lockStore.claim(workerLockKey, WORKER_LOCK_LEASE_MS)
  if (!lease) return

  try {
    const repository = getOAuthAdminRepository()
    const pending = await repository.listPendingDiagnosticJobs(access.deployment, MAX_JOBS_PER_TICK)
    if (pending.length === 0) return

    const service = new OAuthDiagnosticService(repository, lockStore)
    for (const job of pending) {
      try {
        // `runJob` claims the per-job lock and a concurrency slot; a job already
        // being worked on elsewhere, or with no free slot, is left pending.
        await service.runJob(access, job.jobId)
      } catch (error) {
        logger.error(`[OAuthDiagnostics] Job ${job.jobId} run failed:`, error)
      }
    }
  } finally {
    await lockStore.release(lease)
  }
}

export default defineNitroPlugin(async () => {
  if (!DIAGNOSTICS_LOOP_ENABLED) {
    logger.info('🔒 OAuth diagnostics maintenance loop is disabled')
    return
  }

  // Stop an existing job on hot reload.
  if (diagnosticsJob) {
    diagnosticsJob.stop()
    diagnosticsJob = null
  }

  diagnosticsJob = new Cron(DIAGNOSTICS_POLL_CRON, async () => {
    try {
      await runDiagnosticsTick()
    } catch (error) {
      logger.error('[OAuthDiagnostics] Maintenance tick failed:', error)
    }
  })

  const cleanup = () => {
    if (diagnosticsJob) {
      diagnosticsJob.stop()
      diagnosticsJob = null
    }
  }
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
  process.on('exit', cleanup)

  logger.info('🔒 OAuth diagnostics maintenance loop initialized (every 5 seconds)')
})
