/**
 * DELETE /api/admin/alert-config/alerts/:level
 *
 * Delete an alert level configuration (admin only).
 *
 * Note: Deleting an alert level may cause issues if recipients are configured for that level.
 */

import { defineEventHandler, createError, getRouterParam } from 'h3'
import { requireAdmin } from '../../../../utils/user-roles'
import { deleteConfigItem } from '../../../../utils/budget-alert-config'
import { parseAlertLevel } from '../../../../utils/alert-config-sections'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const level = parseAlertLevel(getRouterParam(event, 'level'))
  const deleted = await deleteConfigItem('GLOBAL', `alerts#${level}`).catch((error: any) => {
    logger.error('Error deleting alert level:', error)
    throw createError({ statusCode: 500, message: error.message || 'Failed to delete alert level' })
  })

  if (!deleted) {
    throw createError({ statusCode: 404, message: `Alert level ${level} not found` })
  }

  return {
    success: true,
    deleted,
    message: `Alert level ${level} deleted successfully`
  }
})
