/**
 * List user's scheduled reports
 * GET /api/scheduled-reports/list
 */

import { listUserReports } from '../../utils/scheduled-reports'
import { getUserEmail } from '../../utils/user-roles'
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

    const userEmail = getUserEmail(event)

    if (!userEmail) {
      throw createError({
        statusCode: 400,
        message: 'User email not available'
      })
    }

    // Get query parameters
    const query = getQuery(event)
    const status = query.status as string | undefined
    const limit = Math.min(parseInt(query.limit as string) || 200, 500)
    const cursor = query.cursor as string | undefined

    // List reports for this user
    const result = await listUserReports(userEmail, status, limit, cursor)

    return {
      success: true,
      data: {
        reports: result.reports,
        total: result.total,
        nextCursor: result.nextCursor
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
