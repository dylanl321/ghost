/**
 * PUT /api/admin/alert-config/dry-run
 *
 * Update the dry run configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { DryRunConfig } from '@/shared/types/budget-alert-config'

interface DryRunUpdateRequest {
  enabled?: boolean
  email?: string[]
  include_debug_info?: boolean
  include_recipient_debug?: boolean
  include_evaluation_debug?: boolean
  include_config_debug?: boolean
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<DryRunUpdateRequest>(event)

    // Validate: if enabling dry run, must have at least one email
    if (body.enabled === true) {
      const existing = await getConfigItem('GLOBAL', 'dry_run#main') as DryRunConfig | null
      const existingEmails = existing?.email || []
      const newEmails = body.email !== undefined ? body.email : existingEmails

      if (!newEmails || newEmails.length === 0) {
        throw createError({
          statusCode: 400,
          message: 'At least one test email is required when enabling dry run mode'
        })
      }
    }

    // Validate email format if provided
    if (body.email && body.email.length > 0) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      for (const email of body.email) {
        if (!emailRegex.test(email)) {
          throw createError({
            statusCode: 400,
            message: `Invalid email format: ${email}`
          })
        }
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'dry_run#main') as DryRunConfig | null

    // Merge with existing
    const updated: DryRunConfig = {
      ...existing,
      ...body,
      config_scope: 'GLOBAL',
      config_section: 'dry_run#main',
      section_type: 'dry_run'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Dry run configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating dry run config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update dry run configuration'
    })
  }
})
