/**
 * POST /api/achievements/award
 * Record a badge award and send an in-browser notification.
 *
 * Called by the client-side achievement engine when a badge is earned.
 * Persists the award to DynamoDB and pushes a notification via SSE.
 */

import { getUserSession } from '../../utils/entra/session'
import { recordBadgeAward, findBadgeDefinition } from '../../utils/achievement-store'
import { sendUserNotification } from '../../utils/notification-service'
import type { AwardBadgeRequest } from '../../../shared/types/achievements'
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

    const body = await readBody<AwardBadgeRequest>(event)
    if (!body?.badgeId || !body?.badgeName) {
      throw createError({ statusCode: 400, message: 'badgeId and badgeName are required' })
    }

    // Only catalog badges can be recorded, and the notification text comes
    // from the catalog rather than the request body.
    const badge = findBadgeDefinition(body.badgeId)
    if (!badge) {
      throw createError({ statusCode: 400, message: 'Unknown badgeId' })
    }

    // Record the badge in the progress table
    await recordBadgeAward(userId, badge.id)

    // Send in-browser notification via the existing notification system
    const notifResult = await sendUserNotification({
      userId,
      category: 'ACHIEVEMENT',
      title: `Badge Earned: ${badge.name}`,
      body: badge.description || 'You earned a new achievement badge!',
      severity: 'info',
      actionUrl: '/profile?tab=achievements',
      actionLabel: 'View Badges',
      metadata: {
        badgeId: badge.id,
        icon: badge.icon,
        color: badge.color
      },
      dedupeKey: `achievement-${badge.id}`,
      skipEmail: true // In-browser only — no email for achievements
    })

    if (!notifResult.success || notifResult.skipped) {
      logger.warn('Badge awarded but notification not delivered:', {
        badgeId: body.badgeId,
        success: notifResult.success,
        skipped: notifResult.skipped,
        reason: notifResult.reason || notifResult.error
      })
    }

    return {
      success: true,
      message: `Badge "${badge.name}" awarded`,
      notificationCreated: notifResult.success && !notifResult.skipped
    }

  } catch (error: any) {
    logger.error('Failed to award badge:', error)
    if (error.statusCode) throw error
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to award badge'
    })
  }
})
