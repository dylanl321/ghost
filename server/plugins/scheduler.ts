/**
 * Scheduled Reports Scheduler Plugin
 * Runs periodically to check for and execute due reports
 */

import { Cron } from 'croner'
import { processScheduledReports } from '../utils/report-scheduler'
import { cleanupStaleLocks } from '../utils/execution-locks'
import { logger } from '../utils/logger'

const SCHEDULER_ENABLED = process.env.REPORT_SCHEDULER_ENABLED !== 'false'

// Store scheduler job for cleanup
let schedulerJob: Cron | null = null

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

  // Stop existing job if any (handles hot reload)
  if (schedulerJob) {
    logger.info('Stopping existing scheduler job...')
    schedulerJob.stop()
    schedulerJob = null
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
  }

  process.on('SIGTERM', cleanupScheduler)
  process.on('SIGINT', cleanupScheduler)
  process.on('exit', cleanupScheduler)

  logger.info('✅ Scheduled reports scheduler initialized (running every minute)')
})
