/**
 * PUT /api/admin/alert-config/pace-alerting
 *
 * Update the pace alerting configuration (admin only).
 */

import { defineEventHandler } from 'h3'
import { updateGlobalConfigSection } from '../../../utils/alert-config-sections'

export default defineEventHandler(event => updateGlobalConfigSection(event, {
  section: 'pace_alerting#main',
  section_type: 'pace_alerting',
  label: 'Pace alerting configuration',
  rules: {
    severity_thresholds: {
      kind: 'object',
      fields: {
        INFO: { kind: 'number', min: 0 },
        WARNING: { kind: 'number', min: 0 },
        CRITICAL: { kind: 'number', min: 0 },
        ESCALATION: { kind: 'number', min: 0 }
      }
    },
    minimum_overspend: {
      kind: 'object',
      fields: {
        dollars: { kind: 'number', min: 0 },
        percent_of_budget: { kind: 'number', min: 0 }
      }
    },
    milestones: {
      kind: 'array',
      maxItems: 20,
      item: {
        kind: 'object',
        fields: {
          threshold: { kind: 'number', min: 0, max: 100 },
          pace_ratio: { kind: 'number', min: 1 },
          level: { kind: 'string', pattern: /^(INFO|WARNING|CRITICAL|ESCALATION)$/ }
        }
      }
    }
  },
  // Ordered on the merged thresholds, so a partial update is checked against the stored ones
  validate: merged => {
    const t = merged.severity_thresholds || {}
    const info = t.INFO ?? 0
    const warning = t.WARNING ?? 8
    const critical = t.CRITICAL ?? 20
    const escalation = t.ESCALATION ?? 40
    if (!(info <= warning && warning <= critical && critical <= escalation)) {
      return 'Severity thresholds must be in ascending order: INFO <= WARNING <= CRITICAL <= ESCALATION'
    }
    if ((merged.milestones || []).some((m: any) => m.threshold === undefined || m.pace_ratio === undefined || m.level === undefined)) {
      return 'Each milestone needs threshold, pace_ratio and level'
    }
    return undefined
  }
}))
