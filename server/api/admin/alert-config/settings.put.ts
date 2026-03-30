/**
 * PUT /api/admin/alert-config/settings
 *
 * Update the main settings configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { SettingsConfig } from '#shared/types/budget-alert-config'

interface SettingsUpdateRequest {
  email_domain?: string
  from_email?: string
  from_name?: string
  timezone?: string
  cooldown_hours?: number
  min_budget?: number
  business_hours_start?: number
  business_hours_end?: number
  ghost_url_template?: string
  accounts_table?: string
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<SettingsUpdateRequest>(event)

    // Validate business hours if both provided
    if (body.business_hours_start !== undefined && body.business_hours_end !== undefined) {
      if (body.business_hours_start >= body.business_hours_end) {
        throw createError({
          statusCode: 400,
          message: 'Business hours start must be before end'
        })
      }
    }

    // Validate hours range
    if (body.business_hours_start !== undefined) {
      if (body.business_hours_start < 0 || body.business_hours_start > 23) {
        throw createError({
          statusCode: 400,
          message: 'Business hours start must be between 0 and 23'
        })
      }
    }
    if (body.business_hours_end !== undefined) {
      if (body.business_hours_end < 0 || body.business_hours_end > 23) {
        throw createError({
          statusCode: 400,
          message: 'Business hours end must be between 0 and 23'
        })
      }
    }

    // Validate min_budget
    if (body.min_budget !== undefined && body.min_budget < 0) {
      throw createError({
        statusCode: 400,
        message: 'Minimum budget must be non-negative'
      })
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing settings
    const existing = await getConfigItem('GLOBAL', 'settings#main') as SettingsConfig | null

    // Merge with existing settings
    const updated: SettingsConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'settings#main',
      section_type: 'settings'
    }

    // Save the updated settings
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Settings updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating alert settings:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update settings'
    })
  }
})
