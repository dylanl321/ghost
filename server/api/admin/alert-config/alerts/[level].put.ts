/**
 * PUT /api/admin/alert-config/alerts/:level
 *
 * Update one alert level's threshold, color, limits and intervals (admin only).
 */

import { defineEventHandler, readBody, createError, getRouterParam } from 'h3'
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

  const level = parseAlertLevel(getRouterParam(event, 'level'))
  const body = await readBody(event)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw createError({ statusCode: 400, message: 'Request body must be a JSON object' })
  }
  // Only declared fields, so level and keys cannot be overwritten
  const fields = pickFields(body, ALERT_LEVEL_RULES) as Partial<AlertLevelConfig>

  if (fields.threshold !== undefined) {
    checkThresholdOrder(level, fields.threshold, await getAlertLevels())
  }

  const configSection = `alerts#${level}`
  const existing = await getConfigItem('GLOBAL', configSection) as AlertLevelConfig | null
  if (!existing) {
    throw createError({ statusCode: 404, message: `Alert level ${level} not found` })
  }

  const updated: AlertLevelConfig = {
    ...existing,
    ...fields,
    level,
    config_scope: 'GLOBAL',
    config_section: configSection,
    section_type: 'alerts'
  }

  try {
    await updateConfigItem(updated, auditUser(event))
  } catch (error: any) {
    logger.error('Error updating alert level:', error)
    throw createError({ statusCode: 500, message: error.message || 'Failed to update alert level' })
  }

  return {
    success: true,
    data: updated,
    message: `Alert level ${level} updated successfully`
  }
})
