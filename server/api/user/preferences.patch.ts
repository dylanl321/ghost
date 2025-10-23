/**
 * PATCH /api/user/preferences
 * Update current user's preferences
 */

import { getUserSession } from '../../utils/entra/session'
import { updateUserPreferences } from '../../utils/user-preferences'
import type { UpdatePreferencesRequest } from '#shared/types/user-preferences'

export default defineEventHandler(async (event) => {
  try {
    // Get authenticated user
    const session = await getUserSession(event)
    if (!session?.user) {
      throw createError({
        statusCode: 401,
        message: 'Authentication required'
      })
    }

    // Get user email as userId
    const userId = session.user.email || session.user.id || session.user.sub
    if (!userId) {
      throw createError({
        statusCode: 401,
        message: 'User identification failed'
      })
    }

    // Parse request body
    const updates = await readBody<UpdatePreferencesRequest>(event)

    // Validate timezone if provided
    if (updates.timezone) {
      // Basic validation - check it's a non-empty string
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
      message: 'Preferences updated successfully'
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
