/**
 * DELETE /api/notifications/:id
 * Delete a notification
 */

import { getUserSession } from '../../utils/entra/session'
import { deleteNotification } from '../../utils/notification-service'
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
