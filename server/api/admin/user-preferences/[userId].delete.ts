/**
 * DELETE /api/admin/user-preferences/:userId
 * Delete user's preferences (admin only)
 */

import { deleteUserPreferences } from '../../../utils/user-preferences'
import { isUserAdmin } from '../../../utils/user-roles'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    // Check if user is admin
    if (!await isUserAdmin(event)) {
      throw createError({
        statusCode: 403,
        message: 'Admin access required'
      })
    }

    // Get userId from route params
    const userId = getRouterParam(event, 'userId')
    if (!userId) {
      throw createError({
        statusCode: 400,
        message: 'User ID is required'
      })
    }

    // Delete preferences
    const success = await deleteUserPreferences(userId)

    if (!success) {
      throw createError({
        statusCode: 500,
        message: 'Failed to delete user preferences'
      })
    }

    return {
      success: true,
      data: { success: true },
      message: 'User preferences deleted successfully'
    }

  } catch (error: any) {
    logger.error('Failed to delete user preferences:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to delete user preferences'
    })
  }
})
