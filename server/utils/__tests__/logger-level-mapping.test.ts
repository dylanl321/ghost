import { strict as assert } from 'node:assert'
import { test } from 'node:test'

// Prevent the module's startup banner log from firing during tests.
process.env.NODE_ENV = 'test'

// Dynamic import so the NODE_ENV guard above is applied before the module
// evaluates its top-level initialization log.
const { resolveLevelName } = await import('../logger')

test('uses the unambiguous log type when present', () => {
  // In Consola v3 both fatal and error share numeric level 0; the type string
  // is the only reliable discriminator.
  assert.equal(resolveLevelName({ level: 0, type: 'error' }), 'error')
  assert.equal(resolveLevelName({ level: 0, type: 'fatal' }), 'fatal')
  assert.equal(resolveLevelName({ level: 1, type: 'warn' }), 'warn')
  assert.equal(resolveLevelName({ level: 3, type: 'info' }), 'info')
  assert.equal(resolveLevelName({ level: 4, type: 'debug' }), 'debug')
})

test('does not mislabel error level 0 as fatal (regression)', () => {
  // Regression for the off-by-one numeric map that turned logger.error() into
  // "fatal" entries in production JSON.
  assert.notEqual(resolveLevelName({ level: 0, type: 'error' }), 'fatal')
})

test('falls back to corrected numeric map when type is missing', () => {
  assert.equal(resolveLevelName({ level: 0, type: '' as any }), 'error')
  assert.equal(resolveLevelName({ level: 1, type: undefined as any }), 'warn')
  assert.equal(resolveLevelName({ level: 3, type: undefined as any }), 'info')
  assert.equal(resolveLevelName({ level: 5, type: undefined as any }), 'trace')
})

test('defaults to info for unknown numeric level without a type', () => {
  assert.equal(resolveLevelName({ level: 99 as any, type: undefined as any }), 'info')
})
