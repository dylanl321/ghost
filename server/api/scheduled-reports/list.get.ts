/**
 * List user's scheduled reports
 * GET /api/scheduled-reports/list
 */

import { listUserReports } from '../../utils/scheduled-reports'
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

    const userEmail = user.email || user.claims?.email || user.claims?.preferred_username

    if (!userEmail) {
      throw createError({
        statusCode: 400,
        message: 'User email not available'
      })
    }

    // Get query parameters
    const query = getQuery(event)
    const status = query.status as string | undefined
    const limit = parseInt(query.limit as string) || 50

    // List reports for this user
    const result = await listUserReports(userEmail, status, limit)

    return {
      success: true,
      data: {
        reports: result.reports,
        total: result.total
      }
    }
  } catch (error: any) {
    logger.error('Error listing scheduled reports:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to list scheduled reports'
    })
  }
})
