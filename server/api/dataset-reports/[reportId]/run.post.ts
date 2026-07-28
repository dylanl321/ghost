/**
 * Re-run a scheduled dataset report immediately
 * POST /api/dataset-reports/:reportId/run
 * Allows users to manually execute their dataset reports
 */

import { requireDatasetReportAccess } from '../../../utils/dataset-report-access'
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

    const report = await requireDatasetReportAccess(event, reportId)

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
