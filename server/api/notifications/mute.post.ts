/**
 * POST /api/notifications/mute
 * Temporarily mute notifications for the current user
 */

import { setNotificationMute, requireNotificationUserId } from '../../utils/notification-service'
import type { MuteDuration } from '#shared/types/notifications'
import { logger } from '../../utils/logger'

export default defineEventHandler(async (event) => {
  try {
    const userId = await requireNotificationUserId(event)

    const body = await readBody<{ duration?: MuteDuration; unmute?: boolean }>(event)
    if (!body.unmute && body.duration && !['1h', '4h', '24h'].includes(body.duration)) {
      throw createError({ statusCode: 400, message: 'Invalid mute duration. Use 1h, 4h, or 24h' })
    }

    return { success: true, data: await setNotificationMute(userId, body) }
  } catch (error: any) {
    logger.error('Error muting notifications:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to mute notifications' })
  }
})
