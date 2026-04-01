/**
 * POST /api/admin/dashboard-layout/clear-default
 *
 * Clears the org-wide default dashboard layout, reverting all users to the hardcoded default (admin only).
 */

import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getSiteConfig, updateSiteConfig, saveConfigHistory } from '../../../utils/site-config'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const configKey = 'ui.dashboardLayout.default'
  const auth = event.context.auth
  const username = auth?.user?.email || auth?.user?.preferred_username || 'unknown'

  const oldConfig = await getSiteConfig(configKey, false)
  const oldValue = oldConfig?.value

  await updateSiteConfig(configKey, null, username)

  if (oldValue !== undefined) {
    saveConfigHistory(configKey, oldValue, null, username, 'Admin cleared org default dashboard layout')
      .catch(err => logger.error('Failed to save config history:', err))
  }

  return { success: true, message: 'Default dashboard layout cleared' }
})
