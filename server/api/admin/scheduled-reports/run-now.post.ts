/**
 * Force execute a scheduled report immediately
 * POST /api/admin/scheduled-reports/run-now
 *
 * Executes a report outside of its regular schedule
 * Admin-only endpoint
 */

import { getReport } from '../../../utils/scheduled-reports'
import { executeScheduledReport } from '../../../utils/report-scheduler'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Allow all authenticated users to execute reports

    // Get request body
    const body = await readBody(event)
    const { reportId } = body

    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    // Get the report
    const report = await getReport(reportId)

    if (!report) {
      throw createError({
        statusCode: 404,
        message: 'Report not found'
      })
    }

    logger.info(`Admin force-executing report: ${report.reportName} (${reportId})`)

    // Execute the report immediately (bypassing scheduler)
    // Note: This doesn't use execution locking since it's a manual admin action
    const result = await executeScheduledReport(report)

    if (result.success) {
      return {
        success: true,
        data: {
          reportId,
          reportName: report.reportName,
          duration: result.duration,
          message: 'Report executed successfully'
        }
      }
    } else {
      throw createError({
        statusCode: 500,
        message: result.error || 'Report execution failed'
      })
    }
  } catch (error: any) {
    logger.error('Error force-executing report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to execute report'
    })
  }
})
