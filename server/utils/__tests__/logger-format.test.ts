import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatLogEntry, resolveLevel, serializeLogEntry } from '../logger'

// Consola assigns fatal AND error the same numeric level (0), and warn is 1
// while info/log/success share 3. The old reporter derived severity from the
// number alone, so logger.error surfaced as "fatal" and logger.warn as
// "error". These tests pin the correct behaviour: the call type wins.

test('logger.error maps to level "error" (not "fatal") even though numeric level is 0', () => {
  assert.equal(resolveLevel({ type: 'error', level: 0, args: ['boom'] }), 'error')
  assert.equal(formatLogEntry({ type: 'error', level: 0, args: ['boom'] }).level, 'error')
})

test('logger.warn maps to level "warn" (not "error") even though numeric level is 1', () => {
  assert.equal(resolveLevel({ type: 'warn', level: 1, args: ['careful'] }), 'warn')
  assert.equal(formatLogEntry({ type: 'warn', level: 1, args: ['careful'] }).level, 'warn')
})

test('standard levels are preserved from the call type', () => {
  assert.equal(resolveLevel({ type: 'fatal', level: 0, args: [] }), 'fatal')
  assert.equal(resolveLevel({ type: 'info', level: 3, args: [] }), 'info')
  assert.equal(resolveLevel({ type: 'debug', level: 4, args: [] }), 'debug')
  assert.equal(resolveLevel({ type: 'trace', level: 5, args: [] }), 'trace')
})

test('non-severity consola types map to the closest canonical severity', () => {
  assert.equal(resolveLevel({ type: 'success', level: 3, args: [] }), 'info')
  assert.equal(resolveLevel({ type: 'fail', level: 0, args: [] }), 'error')
  assert.equal(resolveLevel({ type: 'start', level: 3, args: [] }), 'info')
})

test('falls back to the numeric map, then "info", when the type is unusable', () => {
  // Unknown type but a known numeric level -> numeric fallback
  assert.equal(resolveLevel({ type: 'mystery' as any, level: 2, args: [] }), 'warn')
  // No usable type or level at all -> info
  assert.equal(resolveLevel({ args: [] }), 'info')
})

test('serializes to a single JSON line with safe Error serialization', () => {
  const err = new Error('kaboom')
  ;(err as any).code = 'E_TEST'
  const line = serializeLogEntry({ type: 'error', level: 0, args: ['failed:', err] })

  // One line, no embedded newlines
  assert.equal(line.includes('\n'), false)

  const parsed = JSON.parse(line)
  assert.equal(parsed.level, 'error')
  assert.equal(typeof parsed.timestamp, 'string')
  assert.ok(parsed.message.startsWith('failed:'))
  // Error is serialized with its fields rather than dropped to {}
  assert.ok(parsed.message.includes('kaboom'))
  assert.ok(parsed.message.includes('E_TEST'))
})

test('includes tag only when present', () => {
  assert.equal('tag' in formatLogEntry({ type: 'info', level: 3, args: ['hi'] }), false)
  assert.equal(formatLogEntry({ type: 'info', level: 3, args: ['hi'], tag: 'auth' }).tag, 'auth')
})
