/**
 * GET /api/user/preferences
 * Get current user's preferences
 */

import { getUserSession } from '../../utils/entra/session'
import { getUserPreferences } from '../../utils/user-preferences'

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

    // Get or create preferences
    const preferences = await getUserPreferences(userId, event)

    return {
      success: true,
      data: preferences
    }

  } catch (error: any) {
    console.error('Failed to get user preferences:', error)

    if (error.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get user preferences'
    })
  }
})
