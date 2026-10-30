/**
 * GET /api/notifications/list
 * Get current user's notifications with optional filtering and pagination
 */

import { getUserNotifications, requireNotificationUserId } from '../../utils/notification-service'
import type { NotificationCategory, NotificationStatus } from '#shared/types/notifications'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const query = getQuery(event)

    // Support comma-separated categories for filter groups (e.g. "BUDGET_THRESHOLD,COST_ANOMALY,COST_SUMMARY")
    let category: NotificationCategory | NotificationCategory[] | undefined
    if (query.category) {
      const raw = query.category as string
      category = raw.includes(',')
        ? raw.split(',') as NotificationCategory[]
        : raw as NotificationCategory
    }

    const result = await getUserNotifications(userId, {
      category,
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
