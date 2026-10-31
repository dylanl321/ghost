/**
 * POST /api/notifications/clear-all
 * Delete all notifications for the current user
 */

import { clearAllUserNotifications, requireNotificationUserId } from '../../utils/notification-service'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const deleted = await clearAllUserNotifications(userId)

    return { success: true, data: { deleted } }
  } catch (error: any) {
    logger.error('Error clearing all notifications:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to clear notifications' })
  }
})
