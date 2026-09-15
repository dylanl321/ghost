import assert from 'node:assert/strict'
import test from 'node:test'
import { levelName } from '../../server/utils/logger'

// Consola 3 numeric levels collapse several methods onto the same value:
//   0 -> fatal AND error   1 -> warn   2 -> log   3 -> info AND success
// The production JSON reporter previously misreported these (warn -> error,
// error -> fatal), inflating CloudWatch alarms/queries.
test('level 0 (fatal/error) is reported as error, not fatal', () => {
  assert.equal(levelName(0), 'error')
})

test('level 1 (warn) is reported as warn', () => {
  assert.equal(levelName(1), 'warn')
})

test('levels 2 and 3 (log/info/success) are reported as info', () => {
  assert.equal(levelName(2), 'info')
  assert.equal(levelName(3), 'info')
})

test('debug and trace map to their names', () => {
  assert.equal(levelName(4), 'debug')
  assert.equal(levelName(5), 'trace')
})

test('unknown levels fall back to info', () => {
  assert.equal(levelName(99), 'info')
  assert.equal(levelName(-1), 'info')
})
