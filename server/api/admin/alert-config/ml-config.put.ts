/**
 * PUT /api/admin/alert-config/ml-config
 *
 * Update the ML forecast configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { MlConfig } from '#shared/types/budget-alert-config'

interface MlConfigUpdateRequest {
  enabled?: boolean
  forecast_days?: number
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<MlConfigUpdateRequest>(event)

    // Validate forecast_days
    if (body.forecast_days !== undefined) {
      if (body.forecast_days < 1 || body.forecast_days > 365) {
        throw createError({
          statusCode: 400,
          message: 'Forecast days must be between 1 and 365'
        })
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'ml_config#main') as MlConfig | null

    // Merge with existing
    const updated: MlConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'ml_config#main',
      section_type: 'ml_config'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'ML configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating ML config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update ML configuration'
    })
  }
})
