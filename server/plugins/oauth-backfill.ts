/**
 * OAuth Backfill Maintenance Loop (task 1.2)
 *
 * Wires the already-implemented, never-invoked `backfill()` to a bounded,
 * resumable maintenance loop so a freshly deployed environment seeds its
 * Client/Grant projections from the authoritative provider artifacts (design
 * "A. Seeded inventory via wired backfill + reconciliation"; Requirements 1.1
 * through 1.8, 7.6). It reuses the existing scheduler/croner conventions but is
 * INDEPENDENT of report scheduling, the diagnostics loop, and the alerts loop:
 *   - A separate croner job, guarded by its own default-on env flag so it can
 *     be disabled without touching diagnostics or alerts.
 *   - A deployment-scoped `backfill` lock in the OAuth maintenance lock
 *     NAMESPACE (never the report execution-lock namespace) so only one worker
 *     per deployment runs a tick and a lost lease yields to the current holder.
 *   - Each tick reads the durable checkpoint (the same one `backfill()`
 *     persists) and, while coverage is not `complete`, calls
 *     `getOAuthProjectionService().backfill(ctx, { pageSize, maxPages })` for a
 *     bounded page budget then yields. Because `backfill()` resumes from its
 *     stored `position`, successive ticks advance to `complete` without ever
 *     holding a long scan. Once `complete`, ticks are cheap no-op re-verifies.
 *
 * SAFETY / no-op behavior:
 *   - When there is NO durable administration store, projections cannot be
 *     shared across containers, so the loop is a safe no-op (a memory-only
 *     deployment has no cross-container inventory to seed; tests exercise
 *     backfill inline). This keeps the plugin safe to load everywhere without
 *     disturbing local/dev startup.
 *   - It only READS provider artifacts and writes the administration
 *     projection/checkpoint; it never mutates provider client policy.
 *   - Any error is logged and swallowed; a backfill failure never touches OAuth
 *     discovery, authorization, consent, token issuance, refresh, or resource
 *     verification, nor report scheduling, diagnostics, or alerts.
 */

import { Cron } from 'croner'
import { logger } from '../utils/logger'
import {
  getOAuthAdminRepository,
  getOAuthMaintenanceLockStore,
  getOAuthProjectionService,
  hasDurableOAuthAdminStore,
  maintenanceLockKey,
  resolveOAuthAdminDeploymentContext
} from '../mcp/oauth/admin/index'
import type { OAuthAdminAccessContext } from '../mcp/oauth/admin/types'

/** Default-on; set to 'false' to disable the backfill loop independently. */
const BACKFILL_LOOP_ENABLED = process.env.OAUTH_BACKFILL_LOOP_ENABLED !== 'false'

/**
 * Infrequent catch-up cadence (design): seeding is a bounded catch-up task, not
 * a hot loop like diagnostics (5s). Standard 5-field cron, every 5 minutes.
 */
const BACKFILL_POLL_CRON = '*/5 * * * *'

/** A short lease for the loop lock so a crashed worker frees it quickly. */
const WORKER_LOCK_LEASE_MS = 60 * 1000

/** The checkpoint kind `backfill()` persists (combined Client/Grant backfill). */
const BACKFILL_CHECKPOINT_KIND = 'checkpoints' as const

/** Bounded per-tick page budget so a tick never holds a long provider scan. */
const BACKFILL_PAGE_SIZE = 100
const BACKFILL_MAX_PAGES = 10

let backfillJob: Cron | null = null

/**
 * Build the server-actor access context for the maintenance worker. The
 * deployment is server-derived (never caller input); the actor is a stable
 * system label used only for audit fallbacks.
 */
function workerAccess(): OAuthAdminAccessContext {
  return {
    deployment: resolveOAuthAdminDeploymentContext(),
    actor: 'system:oauth-backfill-maintenance',
    capabilities: ['oauth.operations.manage']
  }
}

/**
 * Run one maintenance tick: acquire the deployment-scoped backfill lock, read
 * the durable checkpoint, and — while coverage is not `complete` — advance the
 * resumable backfill by a bounded page budget then yield. Once `complete`, the
 * tick is a cheap no-op re-verify (read the checkpoint, see `complete`, return).
 */
async function runBackfillTick(): Promise<void> {
  // No durable store → no cross-container inventory to seed. Safe no-op.
  if (!hasDurableOAuthAdminStore()) return

  const access = workerAccess()
  const lockStore = getOAuthMaintenanceLockStore()
  const backfillLockKey = maintenanceLockKey(access.deployment, 'backfill')

  // Only one worker per deployment runs a tick; a lost lease yields to the
  // current holder. A failed claim (held elsewhere) is a safe no-op this tick.
  const lease = await lockStore.claim(backfillLockKey, WORKER_LOCK_LEASE_MS)
  if (!lease) return

  try {
    const repository = getOAuthAdminRepository()
    const checkpoint = await repository.getCheckpoint(access.deployment, BACKFILL_CHECKPOINT_KIND)

    // Already fully seeded → cheap no-op re-verify. The next tick re-reads the
    // checkpoint at the low re-verify cadence.
    if (checkpoint?.coverage === 'complete') return

    // Coverage is not `complete` (absent, partial, rebuilding, or unavailable):
    // advance the resumable backfill by a bounded page budget, then yield. The
    // service resumes from its stored `position` and persists the new checkpoint.
    const projectionService = getOAuthProjectionService()
    await projectionService.backfill(access.deployment, {
      pageSize: BACKFILL_PAGE_SIZE,
      maxPages: BACKFILL_MAX_PAGES
    })
  } finally {
    await lockStore.release(lease)
  }
}

export default defineNitroPlugin(async () => {
  if (!BACKFILL_LOOP_ENABLED) {
    logger.info('🌱 OAuth backfill maintenance loop is disabled')
    return
  }

  // Stop an existing job on hot reload.
  if (backfillJob) {
    backfillJob.stop()
    backfillJob = null
  }

  backfillJob = new Cron(BACKFILL_POLL_CRON, async () => {
    try {
      await runBackfillTick()
    } catch (error) {
      logger.error('[OAuthBackfill] Maintenance tick failed:', error)
    }
  })

  const cleanup = () => {
    if (backfillJob) {
      backfillJob.stop()
      backfillJob = null
    }
  }
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
  process.on('exit', cleanup)

  logger.info('🌱 OAuth backfill maintenance loop initialized (every 5 minutes)')
})
