/**
 * Get a single scheduled report
 * GET /api/scheduled-reports/:id
 */

import { getReport } from '../../utils/scheduled-reports'
import { isUserAdmin } from '../../utils/user-roles'

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

    const userEmail = user.claims?.email || user.claims?.preferred_username
    const isAdmin = await isUserAdmin(event)

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

    // Check ownership (unless admin)
    if (!isAdmin && report.createdBy !== userEmail) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

    return {
      success: true,
      data: report
    }
  } catch (error: any) {
    console.error('Error getting scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get scheduled report'
    })
  }
})
