/**
 * Scheduled Reports Scheduler Plugin
 * Runs periodically to check for and execute due reports
 */

import { Cron } from 'croner'
import { processScheduledReports } from '../utils/report-scheduler'
import { cleanupStaleLocks } from '../utils/execution-locks'
import { logger } from '../utils/logger'

const SCHEDULER_ENABLED = process.env.REPORT_SCHEDULER_ENABLED !== 'false'

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

  // Run every minute to check for due reports
  new Cron('* * * * *', async () => {
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

  logger.info('✅ Scheduled reports scheduler initialized (running every minute)')
})
