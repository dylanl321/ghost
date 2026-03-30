/**
 * POST /api/admin/alert-config/alerts
 *
 * Create a new alert level configuration (admin only).
 * Valid levels: INFO, WARNING, CRITICAL, ESCALATION
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../../utils/user-roles'
import { getConfigItem, updateConfigItem, getAlertLevels } from '../../../../utils/budget-alert-config'
import type { AlertLevelConfig } from '#shared/types/budget-alert-config'

const VALID_LEVELS = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']

interface AlertLevelCreateRequest {
  level: string
  threshold: number
  color: string
  min_dollars?: number
  max_per_month?: number
  intervals?: number[]
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<AlertLevelCreateRequest>(event)

    // Validate required fields
    if (!body.level) {
      throw createError({
        statusCode: 400,
        message: 'Alert level is required'
      })
    }

    const levelUpper = body.level.toUpperCase()
    if (!VALID_LEVELS.includes(levelUpper)) {
      throw createError({
        statusCode: 400,
        message: `Invalid alert level: ${body.level}. Must be one of: ${VALID_LEVELS.join(', ')}`
      })
    }

    if (body.threshold === undefined) {
      throw createError({
        statusCode: 400,
        message: 'Threshold is required'
      })
    }

    if (!body.color) {
      throw createError({
        statusCode: 400,
        message: 'Color is required'
      })
    }

    // Validate threshold (must be >= 100)
    if (body.threshold < 100) {
      throw createError({
        statusCode: 400,
        message: 'Threshold must be at least 100%'
      })
    }

    // Validate color format
    const hexColorRegex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/
    if (!hexColorRegex.test(body.color)) {
      throw createError({
        statusCode: 400,
        message: `Invalid hex color format: ${body.color}. Must be #RGB or #RRGGBB`
      })
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

    // Check if level already exists
    const configSection = `alerts#${levelUpper}`
    const existing = await getConfigItem('GLOBAL', configSection)
    if (existing) {
      throw createError({
        statusCode: 409,
        message: `Alert level ${levelUpper} already exists`
      })
    }

    // Validate threshold ordering across all levels
    const allLevels = await getAlertLevels()
    const levelOrder = { INFO: 0, WARNING: 1, CRITICAL: 2, ESCALATION: 3 }
    const newLevelOrder = levelOrder[levelUpper as keyof typeof levelOrder]

    for (const otherLevel of allLevels) {
      const otherOrder = levelOrder[otherLevel.level as keyof typeof levelOrder]
      if (newLevelOrder < otherOrder && body.threshold >= otherLevel.threshold) {
        throw createError({
          statusCode: 400,
          message: `${levelUpper} threshold (${body.threshold}) must be less than ${otherLevel.level} threshold (${otherLevel.threshold})`
        })
      }
      if (newLevelOrder > otherOrder && body.threshold <= otherLevel.threshold) {
        throw createError({
          statusCode: 400,
          message: `${levelUpper} threshold (${body.threshold}) must be greater than ${otherLevel.level} threshold (${otherLevel.threshold})`
        })
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Create the new alert level
    const newLevel: AlertLevelConfig = {
      config_scope: 'GLOBAL',
      config_section: configSection,
      section_type: 'alerts',
      level: levelUpper,
      threshold: body.threshold,
      color: body.color,
      min_dollars: body.min_dollars ?? 0,
      max_per_month: body.max_per_month ?? 1,
      intervals: body.intervals ?? [0]
    }

    // Save the new config
    await updateConfigItem(newLevel, username)

    return {
      success: true,
      data: newLevel,
      message: `Alert level ${levelUpper} created successfully`
    }
  } catch (error: any) {
    logger.error('Error creating alert level:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to create alert level'
    })
  }
})
