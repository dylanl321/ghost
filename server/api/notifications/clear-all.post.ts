/**
 * POST /api/notifications/clear-all
 * Delete all notifications for the current user
 */

import { getUserSession } from '../../utils/entra/session'
import { clearAllUserNotifications } from '../../utils/notification-service'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event)
    if (!session?.user) {
      throw createError({ statusCode: 401, message: 'Authentication required' })
    }

    const userId = session.user.email || session.user.id || session.user.sub
    if (!userId) {
      throw createError({ statusCode: 401, message: 'User identification failed' })
    }

    const deleted = await clearAllUserNotifications(userId)

    return { success: true, data: { deleted } }
  } catch (error: any) {
    logger.error('Error clearing all notifications:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to clear notifications' })
  }
})
