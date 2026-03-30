/**
 * GET /api/achievements/progress
 * Load current user's achievement progress
 */

import { getUserSession } from '../../utils/entra/session'
import { getAchievementProgress } from '../../utils/achievement-store'
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

    const progress = await getAchievementProgress(userId)

    return { success: true, data: progress }

  } catch (error: any) {
    logger.error('Failed to get achievement progress:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to get achievement progress'
    })
  }
})
