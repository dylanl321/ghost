/**
 * DELETE /api/admin/alert-config/alerts/:level
 *
 * Delete an alert level configuration (admin only).
 * Valid levels: INFO, WARNING, CRITICAL, ESCALATION
 *
 * Note: Deleting an alert level may cause issues if recipients are configured for that level.
 */

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../utils/user-roles'
import { deleteConfigItem } from '../../../../utils/budget-alert-config'

const VALID_LEVELS = ['INFO', 'WARNING', 'CRITICAL', 'ESCALATION']

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

    // Delete the alert level
    const configSection = `alerts#${levelUpper}`
    const deleted = await deleteConfigItem('GLOBAL', configSection)

    if (!deleted) {
      throw createError({
        statusCode: 404,
        message: `Alert level ${levelUpper} not found`
      })
    }

    return {
      success: true,
      deleted,
      message: `Alert level ${levelUpper} deleted successfully`
    }
  } catch (error: any) {
    logger.error('Error deleting alert level:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to delete alert level'
    })
  }
})
