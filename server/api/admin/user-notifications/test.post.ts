/**
 * POST /api/admin/user-notifications/test
 * Send a test notification to the requesting admin (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { sendUserNotification } from '../../../utils/notification-service'
import { getUserSession } from '../../../utils/entra/session'
import type { NotificationSeverity } from '#shared/types/notifications'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const session = await getUserSession(event)
    const userId = session?.user?.email || session?.user?.id || session?.user?.sub
    if (!userId) {
      throw createError({ statusCode: 401, message: 'User identification failed' })
    }

    const body = await readBody<{
      title?: string
      body?: string
      severity?: NotificationSeverity
    }>(event)

    const result = await sendUserNotification({
      userId,
      category: 'SYSTEM',
      title: body.title || 'Test Notification',
      body: body.body || 'This is a test notification sent from the admin panel.',
      severity: body.severity || 'info',
      metadata: { isTest: true }
    })

    return {
      success: true,
      data: { notificationId: result.notificationId }
    }
  } catch (error: any) {
    logger.error('Error sending test notification:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to send test notification' })
  }
})
