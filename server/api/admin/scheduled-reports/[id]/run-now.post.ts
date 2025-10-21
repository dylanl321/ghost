/**
 * Force execute a scheduled report immediately (admin only)
 * POST /api/admin/scheduled-reports/:id/run-now
 */

import { getReport } from '../../../../utils/scheduled-reports'
import { executeScheduledReport } from '../../../../utils/report-scheduler'

export default defineEventHandler(async (event) => {
  try {
    // Allow all authenticated users to execute reports

    // Get report ID from route params
    const reportId = getRouterParam(event, 'id')
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

    // Execute the report immediately
    console.log(`[Admin] Force executing report: ${report.reportName}`)
    const result = await executeScheduledReport(report)

    if (!result.success) {
      throw createError({
        statusCode: 500,
        message: result.error || 'Failed to execute report'
      })
    }

    return {
      success: true,
      message: 'Report executed successfully',
      duration: result.duration
    }
  } catch (error: any) {
    console.error('Error executing report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to execute report'
    })
  }
})
