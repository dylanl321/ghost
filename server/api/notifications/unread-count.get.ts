/**
 * GET /api/notifications/unread-count
 * Lightweight endpoint for polling unread notification count
 */

import { getUserSession } from '../../utils/entra/session'
import { getUnreadCount } from '../../utils/notification-service'
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

    const result = await getUnreadCount(userId)

    return { success: true, data: result }
  } catch (error: any) {
    logger.error('Error getting unread count:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to get unread count' })
  }
})
