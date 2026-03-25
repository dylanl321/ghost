/**
 * PUT /api/admin/alert-config/pace-alerting
 *
 * Update the pace alerting configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { PaceAlertingConfig } from '@/shared/types/budget-alert-config'

interface PaceAlertingUpdateRequest {
  severity_thresholds?: {
    INFO?: number
    WARNING?: number
    CRITICAL?: number
    ESCALATION?: number
  }
  minimum_overspend?: {
    dollars?: number
    percent_of_budget?: number
  }
  milestones?: Array<{
    threshold: number
    pace_ratio: number
    level: string
  }>
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<PaceAlertingUpdateRequest>(event)

    // Validate severity_thresholds order
    if (body.severity_thresholds) {
      const thresholds = body.severity_thresholds
      const info = thresholds.INFO ?? 0
      const warning = thresholds.WARNING ?? 8
      const critical = thresholds.CRITICAL ?? 20
      const escalation = thresholds.ESCALATION ?? 40

      if (!(info <= warning && warning <= critical && critical <= escalation)) {
        throw createError({
          statusCode: 400,
          message: 'Severity thresholds must be in ascending order: INFO <= WARNING <= CRITICAL <= ESCALATION'
        })
      }
    }

    // Validate minimum_overspend
    if (body.minimum_overspend) {
      if (body.minimum_overspend.dollars !== undefined && body.minimum_overspend.dollars < 0) {
        throw createError({
          statusCode: 400,
          message: 'Minimum overspend dollars must be non-negative'
        })
      }
      if (body.minimum_overspend.percent_of_budget !== undefined && body.minimum_overspend.percent_of_budget < 0) {
        throw createError({
          statusCode: 400,
          message: 'Minimum overspend percent must be non-negative'
        })
      }
    }

    // Validate milestones
    if (body.milestones) {
      const validLevels = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']
      for (const milestone of body.milestones) {
        if (milestone.threshold < 0 || milestone.threshold > 100) {
          throw createError({
            statusCode: 400,
            message: 'Milestone threshold must be between 0 and 100'
          })
        }
        if (milestone.pace_ratio < 1) {
          throw createError({
            statusCode: 400,
            message: 'Milestone pace ratio must be at least 1'
          })
        }
        if (!validLevels.includes(milestone.level)) {
          throw createError({
            statusCode: 400,
            message: `Invalid milestone level: ${milestone.level}. Must be one of: ${validLevels.join(', ')}`
          })
        }
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'pace_alerting#main') as PaceAlertingConfig | null

    // Merge with existing
    const updated: PaceAlertingConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'pace_alerting#main',
      section_type: 'pace_alerting'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Pace alerting configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating pace alerting config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update pace alerting configuration'
    })
  }
})
