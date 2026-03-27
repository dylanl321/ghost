/**
 * GET /api/admin/user-notifications/list
 * Browse all user notifications across all users (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getAllNotificationsAdmin } from '../../../utils/notification-service'
import type { NotificationCategory, NotificationStatus } from '#shared/types/notifications'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const query = getQuery(event)

    const result = await getAllNotificationsAdmin({
      userId: query.userId as string | undefined,
      category: query.category as NotificationCategory | undefined,
      status: query.status as NotificationStatus | undefined,
      search: query.search as string | undefined,
      dateFrom: query.dateFrom as string | undefined,
      dateTo: query.dateTo as string | undefined,
      limit: query.limit ? parseInt(query.limit as string) : undefined,
      lastKey: query.lastKey as string | undefined
    })

    return { success: true, data: result }
  } catch (error: any) {
    logger.error('Error listing admin notifications:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to list notifications' })
  }
})
