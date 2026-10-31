/**
 * PUT /api/admin/alert-config/threshold-scaling
 *
 * Update budget-size threshold scaling (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'threshold_scaling#main',
  section_type: 'threshold_scaling',
  label: 'Threshold scaling configuration',
  rules: {
    enabled: { kind: 'boolean' },
    reference_budget: { kind: 'number', positive: true },
    scaling_factor: { kind: 'number', min: 0 },
    // Below 100% would alert before the budget is reached
    min_threshold: { kind: 'number', min: 100 }
  }
}))
