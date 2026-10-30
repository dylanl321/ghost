/**
 * Delete a scheduled report
 * DELETE /api/scheduled-reports/:id
 */

import { deleteReport } from '../../utils/scheduled-reports'
import { requireScheduledReportAccess } from '../../utils/dataset-report-access'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get user from session
    const auth = event.context.auth
    const user = auth?.user
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }

    // Get report ID from route params
    const reportId = getRouterParam(event, 'id')
    if (!reportId) {
      throw createError({
        statusCode: 400,
        message: 'Report ID is required'
      })
    }

    await requireScheduledReportAccess(event, reportId)

    // Delete the report
    const success = await deleteReport(reportId)

    if (!success) {
      throw createError({
        statusCode: 500,
        message: 'Failed to delete report'
      })
    }

    return {
      success: true,
      message: 'Report deleted successfully'
    }
  } catch (error: any) {
    logger.error('Error deleting scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete scheduled report'
    })
  }
})
