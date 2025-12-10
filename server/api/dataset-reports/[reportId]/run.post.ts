/**
 * Re-run a scheduled dataset report immediately
 * POST /api/dataset-reports/:reportId/run
 * Allows users to manually execute their dataset reports
 */

import { getReport } from '../../../utils/scheduled-reports'
import { executeScheduledReport } from '../../../utils/report-scheduler'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get report ID from route params
    const reportId = getRouterParam(event, 'reportId')
    if (!reportId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Report ID is required'
      })
    }

    // Get the report
    const report = await getReport(reportId)
    if (!report) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Report not found'
      })
    }

    // Verify this is a dataset report
    if (report.reportType !== 'dataset') {
      throw createError({
        statusCode: 400,
        statusMessage: 'This endpoint only supports dataset reports'
      })
    }

    // Execute the report immediately
    logger.info(`[User] Re-running dataset report: ${report.reportName} (${reportId})`)
    const result = await executeScheduledReport(report)

    if (!result.success) {
      throw createError({
        statusCode: 500,
        statusMessage: result.error || 'Failed to execute report'
      })
    }

    logger.info(`  → Report executed successfully in ${result.duration}ms`)

    return {
      success: true,
      message: 'Report executed successfully',
      duration: result.duration,
      executionId: result.executionId
    }
  } catch (error: any) {
    logger.error('Error re-running dataset report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to execute report'
    })
  }
})
