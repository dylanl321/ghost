/**
 * Delete a dataset report
 * DELETE /api/dataset-reports/:id
 */

import { deleteReport } from '../../utils/scheduled-reports'
import { requireDatasetReportAccess } from '../../utils/dataset-report-access'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Get user from auth context
    const auth = event.context.auth
    if (!auth || !auth.isAuthenticated) {
      throw createError({
        statusCode: 401,
        message: 'Unauthorized'
      })
    }

    const user = auth.user
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'User information not available'
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

    await requireDatasetReportAccess(event, reportId)

    // Delete the report
    await deleteReport(reportId)

    return {
      success: true,
      message: 'Dataset report deleted successfully'
    }
  } catch (error: any) {
    logger.error('[Dataset Reports API] Error deleting report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete dataset report'
    })
  }
})
