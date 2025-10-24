/**
 * GET /api/admin/user-preferences
 * Get all users' preferences (admin only)
 */

import { getAllUserPreferences } from '../../utils/user-preferences'
import { isUserAdmin } from '../../utils/user-roles'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Check if user is admin
    if (!await isUserAdmin(event)) {
      throw createError({
        statusCode: 403,
        message: 'Admin access required'
      })
    }

    // Parse query params
    const query = getQuery(event)
    const limit = query.limit ? parseInt(query.limit as string) : 100

    // Get all preferences
    const result = await getAllUserPreferences(limit)

    return {
      success: true,
      data: {
        preferences: result.preferences,
        total: result.total
      }
    }

  } catch (error: any) {
    logger.error('Failed to get all user preferences:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get user preferences'
    })
  }
})
