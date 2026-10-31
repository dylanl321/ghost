/**
 * PUT /api/admin/alert-config/theme-colors
 *
 * Update the alert email color scheme (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'theme#colors',
  section_type: 'theme',
  label: 'Theme colors configuration',
  rules: {
    colors: { kind: 'map', value: { kind: 'string', maxLength: 7, pattern: /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/ } }
  }
}))
