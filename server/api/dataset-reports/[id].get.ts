/**
 * Get a single dataset report by ID
 * GET /api/dataset-reports/:id
 */

import { getReport } from '../../utils/scheduled-reports'
import { getUserEmail } from '../../utils/user-roles'
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

    // Get user email
    const userEmail = getUserEmail(event)
    if (!userEmail) {
      throw createError({
        statusCode: 400,
        message: 'User email not available'
      })
    }

    // Get the report
    const report = await getReport(reportId)

    // Verify ownership (unless admin)
    if (report.createdBy !== userEmail && !report.isAdmin) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

    // Verify it's a dataset report
    if (report.reportType !== 'dataset') {
      throw createError({
        statusCode: 404,
        message: 'Dataset report not found'
      })
    }

    return {
      success: true,
      data: report
    }
  } catch (error: any) {
    logger.error('[Dataset Reports API] Error getting report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get dataset report'
    })
  }
})
