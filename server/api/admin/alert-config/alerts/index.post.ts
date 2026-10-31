/**
 * POST /api/admin/alert-config/alerts
 *
 * Create a new alert level (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../../utils/user-roles'
import { getConfigItem, updateConfigItem, getAlertLevels } from '../../../../utils/budget-alert-config'
import {
  ALERT_LEVEL_RULES,
  auditUser,
  checkThresholdOrder,
  parseAlertLevel,
  pickFields
} from '../../../../utils/alert-config-sections'
import type { AlertLevelConfig } from '#shared/types/budget-alert-config'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Request body must be a JSON object' })
  }
  if (!body.level) {
    throw createError({ statusCode: 400, message: 'Alert level is required' })
  }
  const level = parseAlertLevel(body.level)
  if (body.threshold === undefined) {
    throw createError({ statusCode: 400, message: 'Threshold is required' })
  }
  if (!body.color) {
    throw createError({ statusCode: 400, message: 'Color is required' })
  }
  const fields = pickFields(body, ALERT_LEVEL_RULES) as Partial<AlertLevelConfig>

  const configSection = `alerts#${level}`
  if (await getConfigItem('GLOBAL', configSection)) {
    throw createError({ statusCode: 409, message: `Alert level ${level} already exists` })
  }

  checkThresholdOrder(level, fields.threshold!, await getAlertLevels())

  const newLevel: AlertLevelConfig = {
    config_scope: 'GLOBAL',
    config_section: configSection,
    section_type: 'alerts',
    level,
    threshold: fields.threshold!,
    color: fields.color!,
    min_dollars: fields.min_dollars ?? 0,
    max_per_month: fields.max_per_month ?? 1,
    intervals: fields.intervals ?? [0]
  }

  try {
    await updateConfigItem(newLevel, auditUser(event))
  } catch (error: any) {
    logger.error('Error creating alert level:', error)
    throw createError({ statusCode: 500, message: error.message || 'Failed to create alert level' })
  }

  return {
    success: true,
    data: newLevel,
    message: `Alert level ${level} created successfully`
  }
})
