/**
 * POST /api/notifications/mark-all-read
 * Mark all unread notifications as read for the current user
 */

import { getUserSession } from '../../utils/entra/session'
import { markAllNotificationsAsRead } from '../../utils/notification-service'
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

    const updated = await markAllNotificationsAsRead(userId)

    return { success: true, data: { updated } }
  } catch (error: any) {
    logger.error('Error marking all notifications as read:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to mark all as read' })
  }
})
