/**
 * Scheduled Reports Scheduler Plugin
 * Runs periodically to check for and execute due reports
 */

import { Cron } from 'croner'
import { processScheduledReports } from '../utils/report-scheduler'

const SCHEDULER_ENABLED = process.env.REPORT_SCHEDULER_ENABLED !== 'false'

export default defineNitroPlugin(() => {
  if (!SCHEDULER_ENABLED) {
    console.log('📅 Scheduled reports scheduler is disabled')
    return
  }

  console.log('📅 Starting scheduled reports scheduler...')

  // Run every minute to check for due reports
  new Cron('* * * * *', async () => {
    try {
      const result = await processScheduledReports()

      if (result.processed > 0) {
        console.log(
          `📊 Processed ${result.processed} report(s): ` +
          `${result.successful} successful, ${result.failed} failed`
        )
      }
    } catch (error) {
      console.error('Error in scheduler cron job:', error)
    }
  })

  console.log('✅ Scheduled reports scheduler initialized (running every minute)')
})
