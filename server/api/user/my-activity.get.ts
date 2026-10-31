/**
 * GET /api/user/my-activity
 * Returns the current user's recent action events from CloudWatch logs.
 * Used by the My Activity dashboard card for cross-device persistence.
 */

import { getUserSession } from '../../utils/entra/session'
import { getLogs } from '../../utils/log-manager'
import { logger } from '../../utils/logger'

const ACTION_REGEX = /Action - USER:([\w.@-]+),?\s*TYPE:([\w.]+)(?:,?\s*DETAIL:(.+))?/

interface ActivityItem {
  type: string
  detail?: string
  timestamp: number
}

export default defineEventHandler(async (event) => {
  try {
    const session = await getUserSession(event)
    if (!session?.user) {
      throw createError({ statusCode: 401, message: 'Authentication required' })
    }

    const email = session.user.email || session.user.id || session.user.sub
    if (!email) {
      throw createError({ statusCode: 401, message: 'User identification failed' })
    }
    const username = (email as string).split('@')[0] || ''
    if (!/^[\w.@-]+$/.test(username)) {
      return { success: true, data: [] }
    }

    // Fetch last 7 days of this user's action logs (filtered by CloudWatch, not here)
    const logs = await getLogs(7 * 86400, `"Action - USER:${username},"`)

    const items: ActivityItem[] = []
    for (const log of logs) {
      if (!log.message || !log.message.startsWith('Action - USER:')) continue

      const match = log.message.match(ACTION_REGEX)
      if (!match || match[1] !== username) continue

      items.push({
        type: match[2]!,
        detail: match[3]?.trim(),
        timestamp: log.timestamp ?? 0,
      })

      if (items.length >= 20) break
    }

    return { success: true, data: items }
  } catch (error: any) {
    logger.error('Failed to fetch user activity:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: 'Failed to fetch user activity' })
  }
})
