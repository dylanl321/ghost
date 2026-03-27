/**
 * Scheduled Reports Scheduler Plugin
 * Runs periodically to check for and execute due reports
 */

import { Cron } from 'croner'
import { processScheduledReports } from '../utils/report-scheduler'
import { cleanupStaleLocks, claimExecutionLock, releaseExecutionLock } from '../utils/execution-locks'
import { logger } from '../utils/logger'

const SCHEDULER_ENABLED = process.env.REPORT_SCHEDULER_ENABLED !== 'false'

// Store scheduler jobs for cleanup
let schedulerJob: Cron | null = null
let securitySummaryJob: Cron | null = null
let digestJob: Cron | null = null
let budgetAlertJob: Cron | null = null

export default defineNitroPlugin(async () => {
  if (!SCHEDULER_ENABLED) {
    logger.info('📅 Scheduled reports scheduler is disabled')
    return
  }

  logger.info('📅 Starting scheduled reports scheduler...')

  // Clean up stale locks on startup (handles container restarts)
  try {
    await cleanupStaleLocks(5) // Remove locks older than 5 minutes
  } catch (error) {
    logger.error('Error cleaning up stale locks on startup:', error)
    // Continue anyway - don't block scheduler startup
  }

  // Stop existing jobs if any (handles hot reload)
  if (schedulerJob) {
    schedulerJob.stop()
    schedulerJob = null
  }
  if (securitySummaryJob) {
    securitySummaryJob.stop()
    securitySummaryJob = null
  }
  if (digestJob) {
    digestJob.stop()
    digestJob = null
  }
  if (budgetAlertJob) {
    budgetAlertJob.stop()
    budgetAlertJob = null
  }

  // Run every minute to check for due reports
  schedulerJob = new Cron('* * * * *', async () => {
    try {
      const result = await processScheduledReports()

      if (result.processed > 0) {
        logger.info(
          `📊 Processed ${result.processed} report(s): ` +
          `${result.successful} successful, ${result.failed} failed`
        )
      }
    } catch (error) {
      logger.error('Error in scheduler cron job:', error)
    }
  })

  // Clean up on process shutdown
  const cleanupScheduler = () => {
    if (schedulerJob) {
      logger.info('Stopping scheduler on shutdown...')
      schedulerJob.stop()
      schedulerJob = null
    }
    if (securitySummaryJob) {
      logger.info('Stopping security summary scheduler on shutdown...')
      securitySummaryJob.stop()
      securitySummaryJob = null
    }
    if (digestJob) {
      logger.info('Stopping digest scheduler on shutdown...')
      digestJob.stop()
      digestJob = null
    }
    if (budgetAlertJob) {
      logger.info('Stopping budget alert notifier on shutdown...')
      budgetAlertJob.stop()
      budgetAlertJob = null
    }
  }

  process.on('SIGTERM', cleanupScheduler)
  process.on('SIGINT', cleanupScheduler)
  process.on('exit', cleanupScheduler)

  logger.info('Scheduled reports scheduler initialized (running every minute)')

  // Nightly security summary pre-computation via Athena (3 AM UTC)
  securitySummaryJob = new Cron('0 3 * * *', async () => {
    const today = new Date().toISOString().split('T')[0]
    try {
      const locked = await claimExecutionLock('security-summary-nightly', today)
      if (!locked) return // Another container is handling it

      // Check if already computed recently (< 20 hours)
      const { getSecuritySummaryMetadata } = await import('../utils/security-summary-store')
      const meta = await getSecuritySummaryMetadata()
      if (meta && meta.ageMinutes < 20 * 60) {
        logger.info('[SecurityScheduler] Summary already fresh, skipping')
        await releaseExecutionLock('security-summary-nightly', today)
        return
      }

      logger.info('[SecurityScheduler] Starting nightly security summary computation...')
      const start = Date.now()
      const { buildSecuritySummaryViaAthena } = await import('../utils/security-hub-athena')
      const { saveSecuritySummary } = await import('../utils/security-summary-store')
      const result = await buildSecuritySummaryViaAthena()
      await saveSecuritySummary(result, { durationMs: Date.now() - start })
      logger.info(`[SecurityScheduler] Nightly summary complete in ${Date.now() - start}ms`)
      await releaseExecutionLock('security-summary-nightly', today)
    } catch (error) {
      logger.error('[SecurityScheduler] Nightly security summary failed:', error)
      await releaseExecutionLock('security-summary-nightly', today).catch(() => {})
    }
  })

  logger.info('Nightly security summary scheduler initialized (3 AM UTC)')

  // Email digest delivery — every hour at :15
  digestJob = new Cron('15 * * * *', async () => {
    const hourKey = new Date().toISOString().substring(0, 13) // YYYY-MM-DDTHH
    try {
      const locked = await claimExecutionLock('email-digest', hourKey)
      if (!locked) return // Another container is handling it

      const { getConfigValue } = await import('../utils/site-config')
      const digestEnabled = await getConfigValue<boolean>('notifications.digestEnabled')
      if (digestEnabled === false) {
        await releaseExecutionLock('email-digest', hourKey)
        return
      }

      logger.info('[Digest] Starting hourly digest processing...')
      const { processDigestDeliveries } = await import('../utils/digest-service')
      const result = await processDigestDeliveries()

      if (result.processed > 0) {
        logger.info(`[Digest] Processed ${result.processed} user(s): ${result.successful} sent, ${result.failed} failed, ${result.skipped} skipped`)
      }

      await releaseExecutionLock('email-digest', hourKey)
    } catch (error) {
      logger.error('[Digest] Hourly digest processing failed:', error)
      await releaseExecutionLock('email-digest', hourKey).catch(() => {})
    }
  })

  logger.info('Email digest scheduler initialized (every hour at :15)')

  // Budget alert notifier — every 15 minutes at :05, :20, :35, :50
  budgetAlertJob = new Cron('5,20,35,50 * * * *', async () => {
    const windowKey = new Date().toISOString().substring(0, 16) // YYYY-MM-DDTHH:MM
    try {
      const locked = await claimExecutionLock('budget-alert-notifier', windowKey)
      if (!locked) return // Another container is handling it

      logger.info('[BudgetAlertNotifier] Starting budget alert processing...')
      const { processRecentBudgetAlerts } = await import('../utils/budget-alert-notifier')
      const result = await processRecentBudgetAlerts()

      if (result.processed > 0) {
        logger.info(`[BudgetAlertNotifier] Processed ${result.processed} alert(s): ${result.notified} notified, ${result.skipped} skipped`)
      }

      await releaseExecutionLock('budget-alert-notifier', windowKey)
    } catch (error) {
      logger.error('[BudgetAlertNotifier] Budget alert processing failed:', error)
      await releaseExecutionLock('budget-alert-notifier', windowKey).catch(() => {})
    }
  })

  logger.info('Budget alert notifier initialized (every 15 minutes)')
})
