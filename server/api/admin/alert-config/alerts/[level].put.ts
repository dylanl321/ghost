/**
 * PUT /api/admin/alert-config/alerts/:level
 *
 * Update an alert level configuration (admin only).
 * Valid levels: INFO, WARNING, CRITICAL, ESCALATION
 */

import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../utils/user-roles'
import { getConfigItem, updateConfigItem, getAlertLevels } from '../../../../utils/budget-alert-config'
import type { AlertLevelConfig } from '@/shared/types/budget-alert-config'

const VALID_LEVELS = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']

interface AlertLevelUpdateRequest {
  threshold?: number
  color?: string
  min_dollars?: number
  max_per_month?: number
  intervals?: number[]
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Get level from URL params
    const level = getRouterParam(event, 'level')
    if (!level) {
      throw createError({
        statusCode: 400,
        message: 'Alert level is required'
      })
    }

    const levelUpper = level.toUpperCase()
    if (!VALID_LEVELS.includes(levelUpper)) {
      throw createError({
        statusCode: 400,
        message: `Invalid alert level: ${level}. Must be one of: ${VALID_LEVELS.join(', ')}`
      })
    }

    // Parse request body
    const body = await readBody<AlertLevelUpdateRequest>(event)

    // Validate threshold (must be >= 100)
    if (body.threshold !== undefined && body.threshold < 100) {
      throw createError({
        statusCode: 400,
        message: 'Threshold must be at least 100%'
      })
    }

    // Validate color format
    if (body.color !== undefined) {
      const hexColorRegex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/
      if (!hexColorRegex.test(body.color)) {
        throw createError({
          statusCode: 400,
          message: `Invalid hex color format: ${body.color}. Must be #RGB or #RRGGBB`
        })
      }
    }

    // Validate min_dollars
    if (body.min_dollars !== undefined && body.min_dollars < 0) {
      throw createError({
        statusCode: 400,
        message: 'Minimum dollars must be non-negative'
      })
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

    // Validate threshold ordering across all levels
    if (body.threshold !== undefined) {
      const allLevels = await getAlertLevels()
      const otherLevels = allLevels.filter(l => l.level !== levelUpper)
      const newThreshold = body.threshold

      // Get expected ordering
      const levelOrder = { INFO: 0, WARNING: 1, CRITICAL: 2, ESCALATION: 3 }
      const currentLevelOrder = levelOrder[levelUpper as keyof typeof levelOrder]

      for (const otherLevel of otherLevels) {
        const otherOrder = levelOrder[otherLevel.level as keyof typeof levelOrder]
        if (currentLevelOrder < otherOrder && newThreshold >= otherLevel.threshold) {
          throw createError({
            statusCode: 400,
            message: `${levelUpper} threshold (${newThreshold}) must be less than ${otherLevel.level} threshold (${otherLevel.threshold})`
          })
        }
        if (currentLevelOrder > otherOrder && newThreshold <= otherLevel.threshold) {
          throw createError({
            statusCode: 400,
            message: `${levelUpper} threshold (${newThreshold}) must be greater than ${otherLevel.level} threshold (${otherLevel.threshold})`
          })
        }
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const configSection = `alerts#${levelUpper}`
    const existing = await getConfigItem('GLOBAL', configSection) as AlertLevelConfig | null

    if (!existing) {
      throw createError({
        statusCode: 404,
        message: `Alert level ${levelUpper} not found`
      })
    }

    // Merge with existing
    const updated: AlertLevelConfig = {
      ...existing,
      ...body,
      level: levelUpper, // Ensure level can't be changed
      config_scope: 'GLOBAL',
      config_section: configSection,
      section_type: 'alerts'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: `Alert level ${levelUpper} updated successfully`
    }
  } catch (error: any) {
    logger.error('Error updating alert level:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update alert level'
    })
  }
})
