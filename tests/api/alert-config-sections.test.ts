import assert from 'node:assert/strict'
import test from 'node:test'

import { pickFields, checkThresholdOrder, ALERT_LEVEL_RULES } from '../../server/utils/alert-config-sections'

const rules = {
  enabled: { kind: 'boolean' as const },
  forecast_days: { kind: 'number' as const, integer: true, min: 1, max: 365 },
  recipients: {
    kind: 'object' as const,
    fields: { to: { kind: 'array' as const, item: { kind: 'string' as const } } }
  }
}

test('only declared fields are kept', () => {
  assert.deepEqual(
    pickFields({ enabled: true, config_scope: 'ACCOUNT#1', extra: 'x' }, rules),
    { enabled: true }
  )
})

test('a string where a number is expected is rejected instead of stored', () => {
  assert.throws(() => pickFields({ forecast_days: 'abc' }, rules), /forecast_days must be a number/)
  assert.throws(() => pickFields({ forecast_days: '30' }, rules), /must be a number/)
  assert.throws(() => pickFields({ forecast_days: 2.5 }, rules), /whole number/)
  assert.throws(() => pickFields({ forecast_days: 0 }, rules), /at least 1/)
})

test('nested objects are validated field by field', () => {
  assert.deepEqual(pickFields({ recipients: { to: ['ops'], bogus: 1 } }, rules), { recipients: { to: ['ops'] } })
  assert.throws(() => pickFields({ recipients: { to: [5] } }, rules), /recipients\.to\[0\] must be text/)
})

test('alert level fields enforce the 100% floor and hex colors', () => {
  assert.throws(() => pickFields({ threshold: 90 }, ALERT_LEVEL_RULES), /at least 100/)
  assert.throws(() => pickFields({ color: 'red' }, ALERT_LEVEL_RULES), /invalid format/)
  assert.deepEqual(pickFields({ threshold: 120, color: '#ff0000' }, ALERT_LEVEL_RULES), { threshold: 120, color: '#ff0000' })
})

test('thresholds must rise with severity', () => {
  const levels = [{ level: 'INFO', threshold: 100 }, { level: 'CRITICAL', threshold: 150 }]
  assert.doesNotThrow(() => checkThresholdOrder('WARNING', 120, levels))
  assert.throws(() => checkThresholdOrder('WARNING', 160, levels), /must be less than CRITICAL/)
  assert.throws(() => checkThresholdOrder('WARNING', 100, levels), /must be greater than INFO/)
})
