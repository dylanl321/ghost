/**
 * PUT /api/admin/alert-config/settings
 *
 * Update the global alert settings (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'settings#main',
  section_type: 'settings',
  label: 'Settings',
  rules: {
    email_domain: { kind: 'string', maxLength: 253, pattern: /^[a-z0-9.-]+\.[a-z]{2,}$/i },
    from_email: { kind: 'email' },
    from_name: { kind: 'string', maxLength: 200 },
    timezone: { kind: 'string', maxLength: 64, pattern: /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/ },
    cooldown_hours: { kind: 'number', min: 0 },
    min_budget: { kind: 'number', min: 0 },
    business_hours_start: { kind: 'number', integer: true, min: 0, max: 23 },
    business_hours_end: { kind: 'number', integer: true, min: 0, max: 23 },
    ghost_url_template: { kind: 'string', maxLength: 500, pattern: /^https?:\/\// },
    accounts_table: { kind: 'string', maxLength: 255, pattern: /^[A-Za-z0-9_.-]{3,255}$/ }
  },
  // Checked against the stored value too, so changing only one end cannot invert the window
  validate: merged =>
    merged.business_hours_start !== undefined && merged.business_hours_end !== undefined &&
    merged.business_hours_start >= merged.business_hours_end
      ? 'Business hours start must be before end'
      : undefined
}))
