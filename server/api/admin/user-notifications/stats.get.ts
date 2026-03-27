/**
 * GET /api/admin/user-notifications/stats
 * Get notification volume analytics (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getNotificationStats } from '../../../utils/notification-service'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const days = query.days ? parseInt(query.days as string) : 7

    const stats = await getNotificationStats(days)

    return { success: true, data: stats }
  } catch (error: any) {
    logger.error('Error fetching notification stats:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to fetch stats' })
  }
})
