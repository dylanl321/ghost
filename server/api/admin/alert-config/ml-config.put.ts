/**
 * PUT /api/admin/alert-config/ml-config
 *
 * Update the ML forecasting configuration (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'ml_config#main',
  section_type: 'ml_config',
  label: 'ML configuration',
  rules: {
    enabled: { kind: 'boolean' },
    forecast_days: { kind: 'number', integer: true, min: 1, max: 365 }
  }
}))
