/**
 * POST /api/admin/dashboard-layout/set-default
 *
 * Saves the current layout as the org-wide default for all users (admin only).
 */

import { defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { updateSiteConfig, getSiteConfig, saveConfigHistory } from '../../../utils/site-config'
import { ALL_SECTION_IDS } from '../../../../shared/types/dashboard-layout'
import type { DashboardLayoutConfig } from '../../../../shared/types/dashboard-layout'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{ layout: DashboardLayoutConfig }>(event)

  if (!body.layout || !Array.isArray(body.layout.sections)) {
    throw createError({ statusCode: 400, message: 'Invalid layout: sections array required' })
  }

  // Validate all section IDs are recognized
  const validIds = new Set(ALL_SECTION_IDS)
  for (const section of body.layout.sections) {
    if (!validIds.has(section.id)) {
      throw createError({ statusCode: 400, message: `Unknown section ID: ${section.id}` })
    }
  }

  const configKey = 'ui.dashboardLayout.default'
  const auth = event.context.auth
  const username = auth?.user?.email || auth?.user?.preferred_username || 'unknown'

  // Get old value for audit history
  const oldConfig = await getSiteConfig(configKey, false)
  const oldValue = oldConfig?.value

  await updateSiteConfig(configKey, body.layout, username)

  // Save change history (non-blocking)
  if (oldValue !== undefined) {
    saveConfigHistory(configKey, oldValue, body.layout, username, 'Admin set org default dashboard layout')
      .catch(err => console.error('Failed to save config history:', err))
  }

  return { success: true, message: 'Default dashboard layout saved' }
})
