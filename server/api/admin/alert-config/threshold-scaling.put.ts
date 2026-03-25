/**
 * PUT /api/admin/alert-config/threshold-scaling
 *
 * Update the threshold scaling configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { ThresholdScalingConfig } from '@/shared/types/budget-alert-config'

interface ThresholdScalingUpdateRequest {
  enabled?: boolean
  reference_budget?: number
  scaling_factor?: number
  min_threshold?: number
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<ThresholdScalingUpdateRequest>(event)

    // Validate reference_budget
    if (body.reference_budget !== undefined && body.reference_budget <= 0) {
      throw createError({
        statusCode: 400,
        message: 'Reference budget must be positive'
      })
    }

    // Validate scaling_factor
    if (body.scaling_factor !== undefined && body.scaling_factor < 0) {
      throw createError({
        statusCode: 400,
        message: 'Scaling factor must be non-negative'
      })
    }

    // Validate min_threshold (must be > 100 to be meaningful)
    if (body.min_threshold !== undefined && body.min_threshold < 100) {
      throw createError({
        statusCode: 400,
        message: 'Minimum threshold must be at least 100%'
      })
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'threshold_scaling#main') as ThresholdScalingConfig | null

    // Merge with existing
    const updated: ThresholdScalingConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'threshold_scaling#main',
      section_type: 'threshold_scaling'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Threshold scaling configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating threshold scaling config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update threshold scaling configuration'
    })
  }
})
