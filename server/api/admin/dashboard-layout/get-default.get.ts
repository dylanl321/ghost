/**
 * GET /api/admin/dashboard-layout/get-default
 *
 * Returns the admin-configured org-wide default dashboard layout.
 * Public endpoint — all authenticated users need to read this.
 */

import { defineEventHandler } from 'h3'
import { getConfigValue } from '../../../utils/site-config'
import type { DashboardLayoutConfig } from '../../../../shared/types/dashboard-layout'

export default defineEventHandler(async () => {
  const layout = await getConfigValue<DashboardLayoutConfig>('ui.dashboardLayout.default')

  return {
    success: true,
    layout: layout ?? null,
  }
})
