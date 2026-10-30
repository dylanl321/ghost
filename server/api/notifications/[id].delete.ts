/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */

import { deleteNotification, requireNotificationUserId } from '../../utils/notification-service'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const notificationId = getRouterParam(event, 'id')
    if (!notificationId) {
      throw createError({ statusCode: 400, message: 'Notification ID required' })
    }

    await deleteNotification(userId, notificationId)

    return { success: true }
  } catch (error: any) {
    logger.error('Error deleting notification:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to delete notification' })
  }
})
