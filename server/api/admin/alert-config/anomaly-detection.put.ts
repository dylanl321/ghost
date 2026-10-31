/**
 * PUT /api/admin/alert-config/anomaly-detection
 *
 * Update the Cost Anomaly Detection integration settings (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'anomaly_detection#main',
  section_type: 'anomaly_detection',
  label: 'Anomaly detection configuration',
  rules: {
    enabled: { kind: 'boolean' },
    min_impact_dollars: { kind: 'number', min: 0 },
    // Cost Explorer anomaly history goes back 90 days
    lookback_days: { kind: 'number', integer: true, min: 1, max: 90 },
    include_in_monthly_report: { kind: 'boolean' }
  }
}))
