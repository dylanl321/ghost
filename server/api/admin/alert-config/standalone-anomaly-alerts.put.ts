/**
 * PUT /api/admin/alert-config/standalone-anomaly-alerts
 *
 * Update the standalone anomaly alerts configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { StandaloneAnomalyAlertsConfig } from '#shared/types/budget-alert-config'

interface StandaloneAnomalyAlertsUpdateRequest {
  enabled?: boolean
  min_impact_dollars?: number
  min_anomaly_score?: number
  max_per_month?: number
  intervals?: number[]
  recipients?: {
    to?: string[]
    cc?: string[]
  }
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<StandaloneAnomalyAlertsUpdateRequest>(event)

    // Validate min_impact_dollars
    if (body.min_impact_dollars !== undefined && body.min_impact_dollars < 0) {
      throw createError({
        statusCode: 400,
        message: 'Minimum impact dollars must be non-negative'
      })
    }

    // Validate min_anomaly_score (0-100)
    if (body.min_anomaly_score !== undefined) {
      if (body.min_anomaly_score < 0 || body.min_anomaly_score > 100) {
        throw createError({
          statusCode: 400,
          message: 'Minimum anomaly score must be between 0 and 100'
        })
      }
    }

    // Validate max_per_month
    if (body.max_per_month !== undefined && body.max_per_month < 1) {
      throw createError({
        statusCode: 400,
        message: 'Maximum per month must be at least 1'
      })
    }

    // Validate intervals
    if (body.intervals !== undefined) {
      for (const interval of body.intervals) {
        if (interval < 0) {
          throw createError({
            statusCode: 400,
            message: 'Intervals must be non-negative'
          })
        }
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'standalone_anomaly_alerts#main') as StandaloneAnomalyAlertsConfig | null

    // Merge with existing
    const updated: StandaloneAnomalyAlertsConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'standalone_anomaly_alerts#main',
      section_type: 'standalone_anomaly_alerts'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Standalone anomaly alerts configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating standalone anomaly alerts config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update standalone anomaly alerts configuration'
    })
  }
})
