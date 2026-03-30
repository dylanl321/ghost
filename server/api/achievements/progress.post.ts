/**
 * POST /api/achievements/progress
 * Sync user's achievement progress from client engine
 */

import { getUserSession } from '../../utils/entra/session'
import { saveAchievementProgress } from '../../utils/achievement-store'
import type { SyncProgressRequest } from '../../../shared/types/achievements'
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

    const body = await readBody<SyncProgressRequest>(event)
    if (!body || !Array.isArray(body.awarded)) {
      throw createError({ statusCode: 400, message: 'Invalid progress data' })
    }

    const updated = await saveAchievementProgress(userId, body)

    return { success: true, data: updated }

  } catch (error: any) {
    logger.error('Failed to sync achievement progress:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to sync achievement progress'
    })
  }
})
