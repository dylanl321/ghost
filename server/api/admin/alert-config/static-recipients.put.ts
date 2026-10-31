/**
 * PUT /api/admin/alert-config/static-recipients
 *
 * Update the role-to-email static recipient mappings (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'static_recipients#main',
  section_type: 'static_recipients',
  label: 'Static recipients configuration',
  rules: {
    // Merged into the stored mappings: entries not sent are kept
    mappings: { kind: 'map', value: { kind: 'email' } }
  }
}))
