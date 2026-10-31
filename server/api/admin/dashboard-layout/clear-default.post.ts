/**
 * POST /api/admin/dashboard-layout/clear-default
 *
 * Clears the org-wide default dashboard layout, reverting all users to the hardcoded default (admin only).
 */

import { defineEventHandler } from 'h3'
import { requireAdmin, getUserEmail } from '../../../utils/user-roles'
import { updateSiteConfigWithHistory } from '../../../utils/site-config'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  await updateSiteConfigWithHistory('ui.dashboardLayout.default', null, getUserEmail(event) || 'unknown', 'Admin cleared org default dashboard layout')

  return { success: true, message: 'Default dashboard layout cleared' }
})
