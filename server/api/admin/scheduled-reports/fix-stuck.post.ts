/**
 * Admin endpoint to fix stuck scheduled reports
 * POST /api/admin/scheduled-reports/fix-stuck
 *
 * Fixes reports with incorrect nextRunTime by recalculating them
 * and cleans up stale execution locks
 */

import { listAllReports, updateReport } from '../../../utils/scheduled-reports'
import { calculateNextRunTime } from '../../../../shared/utils/report-schedule'
import { cleanupStaleLocks, STALE_LOCK_MAX_AGE_MINUTES } from '../../../utils/execution-locks'
import { logger } from '../../../utils/logger'
import { requireAdmin } from '../../../utils/user-roles'

// Force reload - no external dependencies needed

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    logger.info('Admin: Fixing stuck scheduled reports...')

    const results = {
      locksDeleted: 0,
      reportsChecked: 0,
      reportsFixed: 0,
      reportsPaused: 0,
      errors: [] as string[]
    }

    // 1. Clean up abandoned execution locks. Only locks older than the
    // longest job, so a report that is mid-run keeps its lock and is not sent twice.
    try {
      results.locksDeleted = await cleanupStaleLocks(STALE_LOCK_MAX_AGE_MINUTES)
      logger.info(`Deleted ${results.locksDeleted} stale lock(s)`)
    } catch (error: any) {
      logger.error('Error cleaning up locks:', error)
      results.errors.push(`Lock cleanup failed: ${error.message}`)
    }

    // 2. Get all reports
    const { reports, total } = await listAllReports(1000)
    results.reportsChecked = total

    if (reports.length === 0) {
      return {
        success: true,
        message: 'No reports found',
        data: results
      }
    }

    const now = new Date()

    // 3. Check and fix each report
    for (const report of reports) {
      try {
        // Skip disabled reports, but check active AND paused
        // (paused reports may have been paused due to incorrect scheduling)
        if (report.status === 'disabled') {
          continue
        }

        // Recalculate what the next run time SHOULD be
        const calculatedNext = calculateNextRunTime(
          report.schedule,
          report.schedule.timezone
        )

        const storedNext = new Date(report.nextRunTime)
        const timeDiffHours = (calculatedNext.getTime() - storedNext.getTime()) / (1000 * 60 * 60)

        // Debug logging
        logger.info(`Checking ${report.reportName}:`)
        logger.info(`  Schedule: ${JSON.stringify(report.schedule)}`)
        logger.info(`  Stored next run: ${report.nextRunTime}`)
        logger.info(`  Calculated next run: ${calculatedNext.toISOString()}`)
        logger.info(`  Time difference: ${timeDiffHours.toFixed(2)} hours`)
        logger.info(`  Is in past? ${storedNext < now}`)
        logger.info(`  Diff > 1 hour? ${Math.abs(timeDiffHours) > 1}`)

        // Check for suspicious patterns that indicate a stuck report
        const isSuspicious =
          storedNext < now || // Next run is in the past
          Math.abs(timeDiffHours) > 1 || // Significant time difference
          (report.runCount > 100 && report.lastRunTime &&
           new Date(report.lastRunTime) > new Date(Date.now() - 24 * 60 * 60 * 1000)) // >100 runs in 24h

        if (isSuspicious) {
          logger.info(`Fixing stuck report: ${report.reportName} (status: ${report.status})`)
          logger.info(`  Old next run: ${report.nextRunTime}`)
          logger.info(`  New next run: ${calculatedNext.toISOString()}`)

          // If the report has been running excessively, pause it for safety
          if (report.runCount > 100 && report.lastRunTime &&
              new Date(report.lastRunTime) > new Date(Date.now() - 24 * 60 * 60 * 1000)) {
            logger.warn(`  ⚠️  Report has ${report.runCount} runs - PAUSING for safety`)

            await updateReport(report.reportId, {
              status: 'paused',
              schedule: report.schedule // Triggers nextRunTime recalculation
            })

            results.reportsPaused++
          } else {
            // Fix the nextRunTime, keep current status
            await updateReport(report.reportId, {
              schedule: report.schedule // Triggers nextRunTime recalculation
              // Status remains unchanged - if it was paused, stays paused
            })
          }

          results.reportsFixed++
        }
      } catch (error: any) {
        logger.error(`Error fixing report ${report.reportId}:`, error)
        results.errors.push(`${report.reportName}: ${error.message}`)
      }
    }

    logger.info('Fix operation completed:', results)

    return {
      success: true,
      message: `Fixed ${results.reportsFixed} report(s), paused ${results.reportsPaused} for safety`,
      data: results
    }
  } catch (error: any) {
    logger.error('Error in fix-stuck endpoint:', error)

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fix stuck reports'
    })
  }
})
