/**
 * Delete a scheduled report
 * DELETE /api/scheduled-reports/:id
 */

import { getReport, deleteReport } from '../../utils/scheduled-reports'
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

    // Get existing report
    const existing = await getReport(reportId)
    if (!existing) {
      throw createError({
        statusCode: 404,
        message: 'Report not found'
      })
    }

    // Check ownership (unless admin)
    if (!isAdmin && existing.createdBy !== userEmail) {
      throw createError({
        statusCode: 403,
        message: 'Access denied'
      })
    }

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
    console.error('Error deleting scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete scheduled report'
    })
  }
})
