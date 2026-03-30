/**
 * GET /api/admin/user-notifications/config
 * Get notification system configuration (admin only)
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getConfigValue } from '../../../utils/site-config'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const notificationsEnabled = await getConfigValue<boolean>('notifications.enabled')
    const digestEnabled = await getConfigValue<boolean>('notifications.digestEnabled')
    const defaultFrequency = await getConfigValue<string>('notifications.defaultDigestFrequency')
    const defaultHour = await getConfigValue<number>('notifications.defaultDigestHour')
    const dryRunEnabled = await getConfigValue<boolean>('notifications.dryRun.enabled')
    const dryRunRedirectTo = await getConfigValue<string>('notifications.dryRun.redirectTo')

    return {
      success: true,
      data: {
        notificationsEnabled: notificationsEnabled !== false, // Default to true
        digestEnabled: digestEnabled !== false, // Default to true
        defaultDigestFrequency: defaultFrequency || 'daily',
        defaultDigestHour: defaultHour ?? 8,
        dryRunEnabled: dryRunEnabled === true,
        dryRunRedirectTo: dryRunRedirectTo || ''
      }
    }
  } catch (error: any) {
    logger.error('Error fetching notification config:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to fetch config' })
  }
})
