/**
 * GET /api/notifications/list
 * Get current user's notifications with optional filtering and pagination
 */

import { getUserSession } from '../../utils/entra/session'
import { getUserNotifications } from '../../utils/notification-service'
import type { NotificationCategory, NotificationStatus } from '#shared/types/notifications'
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

    const query = getQuery(event)

    const result = await getUserNotifications(userId, {
      category: query.category as NotificationCategory | undefined,
      status: query.status as NotificationStatus | undefined,
      limit: query.limit ? parseInt(query.limit as string) : undefined,
      lastKey: query.lastKey as string | undefined
    })

    return { success: true, data: result }
  } catch (error: any) {
    logger.error('Error listing user notifications:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to list notifications' })
  }
})
