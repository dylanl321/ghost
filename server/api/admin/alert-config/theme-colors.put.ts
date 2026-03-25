/**
 * PUT /api/admin/alert-config/theme-colors
 *
 * Update the email theme colors configuration (admin only).
 */

import { defineEventHandler, readBody, createError } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getConfigItem, updateConfigItem } from '../../../utils/budget-alert-config'
import type { ThemeColorsConfig } from '@/shared/types/budget-alert-config'

interface ThemeColorsUpdateRequest {
  colors?: Record<string, string>
}

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    // Parse request body
    const body = await readBody<ThemeColorsUpdateRequest>(event)

    // Validate color format (hex colors)
    if (body.colors) {
      const hexColorRegex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/
      for (const [colorName, colorValue] of Object.entries(body.colors)) {
        if (!hexColorRegex.test(colorValue)) {
          throw createError({
            statusCode: 400,
            message: `Invalid hex color format for ${colorName}: ${colorValue}. Must be #RGB or #RRGGBB`
          })
        }
      }
    }

    // Get username for audit trail
    const auth = event.context.auth
    const user = auth?.user
    const username = user?.email || user?.preferred_username || 'unknown'

    // Get existing config
    const existing = await getConfigItem('GLOBAL', 'theme#colors') as ThemeColorsConfig | null

    // Merge colors with existing
    const existingColors = existing?.colors || {}
    const newColors = body.colors || {}

    const updated: ThemeColorsConfig = {
      ...existing,
      colors: {
        ...existingColors,
        ...newColors
      },
      config_scope: 'GLOBAL',
      config_section: 'theme#colors',
      section_type: 'theme'
    }

    // Save the updated config
    await updateConfigItem(updated, username)

    return {
      success: true,
      data: updated,
      message: 'Theme colors configuration updated successfully'
    }
  } catch (error: any) {
    logger.error('Error updating theme colors config:', error)

    throw createError({
      statusCode: error.statusCode || 500,
      message: error.message || 'Failed to update theme colors configuration'
    })
  }
})
