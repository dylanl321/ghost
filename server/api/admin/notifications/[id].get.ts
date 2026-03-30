/**
 * GET /api/admin/notifications/:id
 * Get detailed information about a specific notification
 */

import { getNotificationById } from '../../../utils/admin-notifications'

export default defineEventHandler(async (event) => {
  try {
    const notificationId = getRouterParam(event, 'id')

    if (!notificationId) {
      throw new Error('Notification ID is required')
    }

    const notification = await getNotificationById(notificationId)

    if (!notification) {
      return {
        success: false,
        error: 'Notification not found'
      }
    }

    return {
      success: true,
      data: notification
    }
  } catch (error: any) {
    logger.error('Error getting notification:', error)
    return {
      success: false,
      error: error.message
    }
  }
})
