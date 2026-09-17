/**
 * OAuth Alert Evaluation Maintenance Loop (task 13.2)
 *
 * Evaluates evidence-based OAuth alerts every FIVE minutes under the OAuth
 * DEPLOYMENT maintenance lock (design "Diagnostics, maintenance, and alerts":
 * "Alerts evaluate every five minutes under a deployment lock"; Requirements
 * 15.1, 15.2, 15.4, 15.5, 15.6). It reuses the existing scheduler/croner
 * conventions but is INDEPENDENT of report scheduling and of the diagnostics
 * loop:
 *   - A separate croner job, guarded by its own env flag (default-on) so it can
 *     be disabled without touching report scheduling or diagnostics.
 *   - The deployment lock is acquired INSIDE
 *     {@link OAuthAlertEvaluationService.evaluate} using the `alerts` scope in
 *     the OAuth maintenance lock NAMESPACE, so a second worker's tick is a safe
 *     no-op and two workers never double-evaluate.
 *
 * SAFETY / no-op behaviour:
 *   - When there is NO durable administration store, alert state cannot be
 *     shared across containers, so the loop is a safe no-op (a memory-only
 *     deployment has no cross-container evaluation to coordinate). This keeps
 *     the plugin safe to load everywhere without disturbing local/dev startup.
 *   - Any error is logged and swallowed; an alert-evaluation failure never
 *     affects OAuth traffic, report scheduling, or diagnostics.
 */

import { Cron } from 'croner'
import { logger } from '../utils/logger'
import {
  getOAuthAlertEvaluationService,
  hasDurableOAuthAdminStore,
  resolveOAuthAdminDeploymentContext
} from '../mcp/oauth/admin/index'
import type { OAuthAdminAccessContext } from '../mcp/oauth/admin/types'

/** Default-on; set to 'false' to disable the alert loop independently. */
const ALERTS_LOOP_ENABLED = process.env.OAUTH_ALERTS_LOOP_ENABLED !== 'false'

/** The 5-minute evaluation cadence (design). Standard 5-field cron. */
const ALERTS_EVAL_CRON = '*/5 * * * *'

let alertsJob: Cron | null = null

/**
 * Build the server-actor access context for the alert evaluator. The deployment
 * is server-derived (never caller input); the actor is a stable system label.
 */
function workerAccess(): OAuthAdminAccessContext {
  return {
    deployment: resolveOAuthAdminDeploymentContext(),
    actor: 'system:oauth-alert-evaluation',
    capabilities: ['oauth.operations.manage']
  }
}

/**
 * Run one evaluation tick. The deployment lock, disabled-settings no-op, dedup,
 * recovery, and delivery all live in `evaluate`; this loop only invokes it.
 */
async function runAlertsTick(): Promise<void> {
  // No durable store → no cross-container alert state to coordinate. Safe no-op.
  if (!hasDurableOAuthAdminStore()) return

  const service = getOAuthAlertEvaluationService()
  await service.evaluate(workerAccess())
}

export default defineNitroPlugin(async () => {
  if (!ALERTS_LOOP_ENABLED) {
    logger.info('🔔 OAuth alert evaluation loop is disabled')
    return
  }

  // Stop an existing job on hot reload.
  if (alertsJob) {
    alertsJob.stop()
    alertsJob = null
  }

  alertsJob = new Cron(ALERTS_EVAL_CRON, async () => {
    try {
      await runAlertsTick()
    } catch (error) {
      logger.error('[OAuthAlerts] Evaluation tick failed:', error)
    }
  })

  const cleanup = () => {
    if (alertsJob) {
      alertsJob.stop()
      alertsJob = null
    }
  }
  process.on('SIGTERM', cleanup)
  process.on('SIGINT', cleanup)
  process.on('exit', cleanup)

  logger.info('🔔 OAuth alert evaluation loop initialized (every 5 minutes)')
})
