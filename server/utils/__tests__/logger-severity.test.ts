import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { deriveSeverity } from '../log-severity'

// Consola shares numeric level 0 for both fatal and error, uses 1 for warn and
// 2 for log, so the type must be preferred to avoid false fatal/error telemetry.

test('prefers the log type for recognized severities', () => {
  // fatal and error share level 0 — the type disambiguates them
  assert.equal(deriveSeverity({ type: 'fatal', level: 0 }), 'fatal')
  assert.equal(deriveSeverity({ type: 'error', level: 0 }), 'error')
  // warn is level 1 in Consola (previously mis-mapped to "error")
  assert.equal(deriveSeverity({ type: 'warn', level: 1 }), 'warn')
  assert.equal(deriveSeverity({ type: 'debug', level: 4 }), 'debug')
  assert.equal(deriveSeverity({ type: 'trace', level: 5 }), 'trace')
})

test('maps info-like types to info', () => {
  assert.equal(deriveSeverity({ type: 'info', level: 3 }), 'info')
  assert.equal(deriveSeverity({ type: 'success', level: 3 }), 'info')
  assert.equal(deriveSeverity({ type: 'log', level: 2 }), 'info')
})

test('falls back to numeric level, treating level 0 as error not fatal', () => {
  // Unrecognized type -> numeric fallback; level 0 defaults to error
  assert.equal(deriveSeverity({ type: 'box', level: 0 }), 'error')
  assert.equal(deriveSeverity({ type: 'unknown', level: 1 }), 'warn')
  assert.equal(deriveSeverity({ type: 'unknown', level: 2 }), 'info')
  assert.equal(deriveSeverity({ type: 'unknown', level: 3 }), 'info')
  assert.equal(deriveSeverity({ type: 'unknown', level: 4 }), 'debug')
  assert.equal(deriveSeverity({ type: 'unknown', level: 5 }), 'trace')
})

test('defaults to info for out-of-range numeric levels with unknown type', () => {
  assert.equal(deriveSeverity({ type: 'ready', level: 99 }), 'info')
})
