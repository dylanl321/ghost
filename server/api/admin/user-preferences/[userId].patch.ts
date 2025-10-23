/**
 * PATCH /api/admin/user-preferences/:userId
 * Update any user's preferences (admin only)
 */

import { updateUserPreferences } from '../../../utils/user-preferences'
import { isUserAdmin } from '../../../utils/user-roles'
import type { UpdatePreferencesRequest } from '#shared/types/user-preferences'

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

    // Parse request body
    const updates = await readBody<UpdatePreferencesRequest>(event)

    // Validate timezone if provided
    if (updates.timezone) {
      if (typeof updates.timezone !== 'string' || updates.timezone.trim().length === 0) {
        throw createError({
          statusCode: 400,
          message: 'Invalid timezone format'
        })
      }
    }

    // Update preferences
    const updated = await updateUserPreferences(userId, updates)

    return {
      success: true,
      data: updated,
      message: 'User preferences updated successfully'
    }

  } catch (error: any) {
    console.error('Failed to update user preferences:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to update user preferences'
    })
  }
})
