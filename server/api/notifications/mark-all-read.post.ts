/**
 * POST /api/notifications/mark-all-read
 * Mark all unread notifications as read for the current user
 */

import { markAllNotificationsAsRead, requireNotificationUserId } from '../../utils/notification-service'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const updated = await markAllNotificationsAsRead(userId)

    return { success: true, data: { updated } }
  } catch (error: any) {
    logger.error('Error marking all notifications as read:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to mark all as read' })
  }
})
