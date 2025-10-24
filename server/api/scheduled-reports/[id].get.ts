/**
 * Get a single scheduled report
 * GET /api/scheduled-reports/:id
 */

import { getReport } from '../../utils/scheduled-reports'
import { isUserAdmin } from '../../utils/user-roles'
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

    const userEmail = user.claims?.email || user.claims?.preferred_username

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

    // Allow all authenticated users to view any report

    return {
      success: true,
      data: report
    }
  } catch (error: any) {
    logger.error('Error getting scheduled report:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get scheduled report'
    })
  }
})
