import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { formatLogEntry, resolveLogSeverity } from '../logger'

// The production JSON reporter previously derived severity from Consola's
// numeric level alone. Because fatal and error share level 0 and warn is level
// 1, logger.warn surfaced as "error" and logger.error surfaced as "fatal". The
// call type is authoritative and must drive the canonical severity.

test('severity resolves from the log type, not the ambiguous numeric level', () => {
  assert.equal(resolveLogSeverity({ type: 'fatal', level: 0 } as any), 'fatal')
  assert.equal(resolveLogSeverity({ type: 'error', level: 0 } as any), 'error')
  assert.equal(resolveLogSeverity({ type: 'warn', level: 1 } as any), 'warn')
  assert.equal(resolveLogSeverity({ type: 'info', level: 3 } as any), 'info')
  assert.equal(resolveLogSeverity({ type: 'success', level: 3 } as any), 'info')
  assert.equal(resolveLogSeverity({ type: 'debug', level: 4 } as any), 'debug')
  assert.equal(resolveLogSeverity({ type: 'trace', level: 5 } as any), 'trace')
})

test('severity falls back to the numeric level for unknown types', () => {
  assert.equal(resolveLogSeverity({ type: 'unknown-type', level: 3 } as any), 'info')
  assert.equal(resolveLogSeverity({ type: '', level: 2 } as any), 'warn')
  assert.equal(resolveLogSeverity({ type: undefined, level: 999 } as any), 'info')
})

test('formatLogEntry emits the resolved severity and joined message', () => {
  const entry = formatLogEntry({ type: 'warn', level: 1, args: ['stale config', 'detected'], tag: 'cfg' } as any)
  assert.equal(entry.level, 'warn')
  assert.equal(entry.message, 'stale config detected')
  assert.equal(entry.tag, 'cfg')
  assert.equal(typeof entry.timestamp, 'string')
})

test('formatLogEntry safely serializes Error arguments without leaking undefined', () => {
  const err = new Error('boom')
  ;(err as any).code = 'E_BOOM'
  const entry = formatLogEntry({ type: 'error', level: 0, args: ['failed:', err] } as any)
  assert.equal(entry.level, 'error')
  const parsed = JSON.parse((entry.message as string).replace('failed: ', ''))
  assert.equal(parsed.message, 'boom')
  assert.equal(parsed.name, 'Error')
  assert.equal(parsed.code, 'E_BOOM')
  assert.equal(typeof parsed.stack, 'string')
})

test('formatLogEntry preserves object arguments as queryable structured context', () => {
  const entry = formatLogEntry({
    type: 'warn',
    level: 1,
    args: ['stale config', { component: 'dynamodb-config', operation: 'load' }],
  } as any)

  assert.deepEqual(entry.context, {
    component: 'dynamodb-config',
    operation: 'load',
  })
})
