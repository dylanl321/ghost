/**
 * GET /api/admin/dashboard-layout/get-default
 *
 * Returns the admin-configured org-wide default dashboard layout.
 * Public endpoint — all authenticated users need to read this.
 */

import { defineEventHandler, getQuery } from 'h3'
import { getSiteConfig } from '../../../utils/site-config'
import type { DashboardLayoutConfig } from '../../../../shared/types/dashboard-layout'

export default defineEventHandler(async (event) => {
  const nocache = getQuery(event).nocache !== undefined
  const config = await getSiteConfig('ui.dashboardLayout.default', !nocache)
  const layout = config?.value as DashboardLayoutConfig | null | undefined

  return {
    success: true,
    layout: layout ?? null,
    updatedAt: config?.updatedAt ?? null,
    updatedBy: config?.updatedBy ?? null,
  }
})
