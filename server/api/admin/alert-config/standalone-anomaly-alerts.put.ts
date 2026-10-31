/**
 * PUT /api/admin/alert-config/standalone-anomaly-alerts
 *
 * Update the standalone anomaly alerts configuration (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'standalone_anomaly_alerts#main',
  section_type: 'standalone_anomaly_alerts',
  label: 'Standalone anomaly alerts configuration',
  rules: {
    enabled: { kind: 'boolean' },
    min_impact_dollars: { kind: 'number', min: 0 },
    min_anomaly_score: { kind: 'number', min: 0, max: 100 },
    max_per_month: { kind: 'number', integer: true, min: 1 },
    intervals: { kind: 'numberList', min: 0 },
    recipients: {
      kind: 'object',
      fields: {
        // Role names or email addresses
        to: { kind: 'array', item: { kind: 'string', maxLength: 254 } },
        cc: { kind: 'array', item: { kind: 'string', maxLength: 254 } }
      }
    }
  }
}))
