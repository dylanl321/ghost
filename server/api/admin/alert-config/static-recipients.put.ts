/**
 * PUT /api/admin/alert-config/static-recipients
 *
 * Update the static recipients configuration (admin only).
 * Static recipients are direct email mappings for role names that don't come from account metadata.
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { StaticRecipientsConfig } from '@/shared/types/budget-alert-config'

interface StaticRecipientsUpdateRequest {
  mappings?: Record<string, string>
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<StaticRecipientsUpdateRequest>(event)

    // Validate email format for all mappings
    if (body.mappings) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      for (const [role, email] of Object.entries(body.mappings)) {
        if (!emailRegex.test(email)) {
          throw createError({
            statusCode: 400,
            message: `Invalid email format for role "${role}": ${email}`
          })
        }
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'static_recipients#main') as StaticRecipientsConfig | null

    // Merge mappings with existing (or replace entirely if provided)
    const existingMappings = existing?.mappings || {}
    const newMappings = body.mappings || {}

    const updated: StaticRecipientsConfig = {
      ...existing,
      mappings: {
        ...existingMappings,
        ...newMappings
      },
      config_scope: 'GLOBAL',
      config_section: 'static_recipients#main',
      section_type: 'static_recipients'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Static recipients configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating static recipients config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update static recipients configuration'
    })
  }
})
