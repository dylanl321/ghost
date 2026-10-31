/**
 * PATCH /api/notifications/:id/read
 * Mark a single notification as read
 */

import { markNotificationAsRead, requireNotificationUserId } from '../../../utils/notification-service'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const notificationId = getRouterParam(event, 'id')
    if (!notificationId) {
      throw createError({ statusCode: 400, message: 'Notification ID required' })
    }

    await markNotificationAsRead(userId, notificationId)

    return { success: true }
  } catch (error: any) {
    logger.error('Error marking notification as read:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to mark as read' })
  }
})
