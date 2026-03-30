/**
 * PUT /api/admin/alert-config/anomaly-detection
 *
 * Update the anomaly detection configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { AnomalyDetectionConfig } from '#shared/types/budget-alert-config'

interface AnomalyDetectionUpdateRequest {
  enabled?: boolean
  min_impact_dollars?: number
  lookback_days?: number
  include_in_monthly_report?: boolean
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<AnomalyDetectionUpdateRequest>(event)

    // Validate min_impact_dollars
    if (body.min_impact_dollars !== undefined && body.min_impact_dollars < 0) {
      throw createError({
        statusCode: 400,
        message: 'Minimum impact dollars must be non-negative'
      })
    }

    // Validate lookback_days (max 90 per AWS limitation)
    if (body.lookback_days !== undefined) {
      if (body.lookback_days < 1 || body.lookback_days > 90) {
        throw createError({
          statusCode: 400,
          message: 'Lookback days must be between 1 and 90'
        })
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'anomaly_detection#main') as AnomalyDetectionConfig | null

    // Merge with existing
    const updated: AnomalyDetectionConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'anomaly_detection#main',
      section_type: 'anomaly_detection'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Anomaly detection configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating anomaly detection config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update anomaly detection configuration'
    })
  }
})
