/**
 * PUT /api/admin/user-notifications/config
 * Update notification system configuration (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { updateSiteConfig } from '../../../utils/site-config'
import { getUserSession } from '../../../utils/entra/session'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const session = await getUserSession(event)
    const adminId = session?.user?.email || session?.user?.id || 'admin'

    const body = await readBody<{
      notificationsEnabled?: boolean
      digestEnabled?: boolean
      defaultDigestFrequency?: string
      defaultDigestHour?: number
    }>(event)

    const updates: string[] = []

    if (body.notificationsEnabled !== undefined) {
      await updateSiteConfig('notifications.enabled', body.notificationsEnabled, adminId)
      updates.push('notifications.enabled')
    }

    if (body.digestEnabled !== undefined) {
      await updateSiteConfig('notifications.digestEnabled', body.digestEnabled, adminId)
      updates.push('notifications.digestEnabled')
    }

    if (body.defaultDigestFrequency !== undefined) {
      await updateSiteConfig('notifications.defaultDigestFrequency', body.defaultDigestFrequency, adminId)
      updates.push('notifications.defaultDigestFrequency')
    }

    if (body.defaultDigestHour !== undefined) {
      await updateSiteConfig('notifications.defaultDigestHour', body.defaultDigestHour, adminId)
      updates.push('notifications.defaultDigestHour')
    }

    return {
      success: true,
      data: { updated: updates }
    }
  } catch (error: any) {
    logger.error('Error updating notification config:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to update config' })
  }
})
