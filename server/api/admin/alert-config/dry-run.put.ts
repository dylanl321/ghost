/**
 * PUT /api/admin/alert-config/dry-run
 *
 * Update dry-run (test email redirect) mode (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'dry_run#main',
  section_type: 'dry_run',
  label: 'Dry run configuration',
  rules: {
    enabled: { kind: 'boolean' },
    email: { kind: 'emailList', maxItems: 20 },
    include_debug_info: { kind: 'boolean' },
    include_recipient_debug: { kind: 'boolean' },
    include_evaluation_debug: { kind: 'boolean' },
    include_config_debug: { kind: 'boolean' }
  },
  // Also blocks removing the last address while dry run is on
  validate: merged =>
    merged.enabled === true && !(merged.email?.length > 0)
      ? 'At least one test email is required when dry run mode is enabled'
      : undefined
}))
