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
})
