/**
 * GET /api/admin/user-notifications/broadcasts
 * List past broadcast notifications (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getBroadcasts } from '../../../utils/broadcast-service'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const limit = query.limit ? parseInt(query.limit as string) : 20
    const lastKey = query.lastKey as string | undefined

    const result = await getBroadcasts(limit, lastKey)

    return { success: true, data: result }
  } catch (error: any) {
    logger.error('Error listing broadcasts:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to list broadcasts' })
  }
})
