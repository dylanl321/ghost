/**
 * Get execution history for a scheduled report
 * GET /api/scheduled-reports/:id/history
 */

import { getReport, getExecutionHistory } from '../../../utils/scheduled-reports'
import { isUserAdmin } from '../../../utils/user-roles'

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

    // Allow all authenticated users to view execution history

    // Get query parameters
    const query = getQuery(event)
    const limit = parseInt(query.limit as string) || 50

    // Get execution history
    const executions = await getExecutionHistory(reportId, limit)

    return {
      success: true,
      data: {
        executions,
        total: executions.length
      }
    }
  } catch (error: any) {
    console.error('Error getting execution history:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get execution history'
    })
  }
})
