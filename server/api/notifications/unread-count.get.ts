/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint for polling unread notification count
 */

import { getUnreadCount, requireNotificationUserId } from '../../utils/notification-service'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const result = await getUnreadCount(userId)

    return { success: true, data: result }
  } catch (error: any) {
    logger.error('Error getting unread count:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to get unread count' })
  }
})
