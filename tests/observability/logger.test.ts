import assert from 'node:assert/strict'
import test from 'node:test'
import { buildLogEntry } from '../../server/utils/logger'

test('warn events keep warn severity even though Consola reports level 1', () => {
  // Root cause of the 270 spurious level=error events: warn arrives at numeric
  // level 1, which the old map turned into "error". The type must win.
  const entry = buildLogEntry({ type: 'warn', level: 1, args: ['heads up'], tag: '' })
  assert.equal(entry.level, 'warn')
  assert.equal(entry.message, 'heads up')
})

test('error events remain error severity', () => {
  const entry = buildLogEntry({ type: 'error', level: 0, args: ['boom'], tag: '' })
  assert.equal(entry.level, 'error')
})

test('falls back to the numeric level map when type is absent', () => {
  const entry = buildLogEntry({ type: '' as any, level: 3, args: ['hi'], tag: '' })
  assert.equal(entry.level, 'info')
})

test('a trailing plain object becomes top-level structured fields', () => {
  const entry = buildLogEntry({
    type: 'warn',
    level: 1,
    args: ['fallback used', { event: 'dynamodb_config_fallback', missingKeyCount: 22 }],
    tag: ''
  })
  assert.equal(entry.message, 'fallback used')
  assert.equal(entry.event, 'dynamodb_config_fallback')
  assert.equal(entry.missingKeyCount, 22)
})

test('structured context cannot overwrite reserved fields', () => {
  const entry = buildLogEntry({
    type: 'info',
    level: 3,
    args: ['msg', { level: 'error', message: 'spoofed', timestamp: 'nope', tag: 'x', keep: 1 }],
    tag: 'real-tag'
  })
  assert.equal(entry.level, 'info')
  assert.equal(entry.message, 'msg')
  assert.equal(entry.tag, 'real-tag')
  assert.notEqual(entry.timestamp, 'nope')
  assert.equal(entry.keep, 1)
})

test('Error objects are serialized to safe fields, not dropped to {}', () => {
  const err = new Error('kaboom')
  const entry = buildLogEntry({ type: 'error', level: 0, args: ['failed', { error: err }], tag: '' })
  const serialized = entry.error as Record<string, unknown>
  assert.equal(serialized.name, 'Error')
  assert.equal(serialized.message, 'kaboom')
  assert.ok(typeof serialized.stack === 'string')
})

test('arrays are treated as message args, not structured context', () => {
  const entry = buildLogEntry({ type: 'info', level: 3, args: ['items', [1, 2, 3]], tag: '' })
  assert.equal(entry.message, 'items [1,2,3]')
})

test('string-only messages keep their existing joined behavior', () => {
  const entry = buildLogEntry({ type: 'info', level: 3, args: ['a', 'b', 'c'], tag: '' })
  assert.equal(entry.message, 'a b c')
})
