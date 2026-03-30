/**
 * POST /api/notifications/mute
 * Temporarily mute notifications for the current user
 */

import { getUserSession } from '../../utils/entra/session'
import { getUserPreferences, updateUserPreferences } from '../../utils/user-preferences'
import type { MuteDuration } from '#shared/types/notifications'
import { logger } from '../../utils/logger'

const MUTE_DURATIONS: Record<MuteDuration, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000
}

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

    const body = await readBody<{ duration?: MuteDuration; unmute?: boolean }>(event)

    const prefs = await getUserPreferences(userId)
    const notifPrefs = prefs.preferences?.notificationPreferences || {}

    if (body.unmute) {
      // Remove mute
      delete notifPrefs.mutedUntil
    } else {
      const duration = body.duration || '1h'
      const ms = MUTE_DURATIONS[duration]
      if (!ms) {
        throw createError({ statusCode: 400, message: 'Invalid mute duration. Use 1h, 4h, or 24h' })
      }
      notifPrefs.mutedUntil = new Date(Date.now() + ms).toISOString()
    }

    await updateUserPreferences(userId, {
      notificationPreferences: notifPrefs
    })

    return {
      success: true,
      data: {
        mutedUntil: notifPrefs.mutedUntil || null
      }
    }
  } catch (error: any) {
    logger.error('Error muting notifications:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to mute notifications' })
  }
})
