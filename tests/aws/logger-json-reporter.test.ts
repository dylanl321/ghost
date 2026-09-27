import assert from 'node:assert/strict'
import test from 'node:test'
import type { LogObject, LogType } from 'consola'
import { buildLogEntry, severityForLog } from '../../server/utils/logger'

// Minimal LogObject factory. Consola populates `type`, `level`, `args`, `tag`
// and `date` on every real log; tests only vary the fields under test.
function makeLog(partial: Partial<LogObject>): LogObject {
  return {
    type: 'info',
    level: 3,
    tag: '',
    args: [],
    date: new Date(),
    ...partial,
  } as LogObject
}

// --- severityForLog: semantic type is the source of truth ---
// Consola 3.4.2 numeric levels are ambiguous (fatal===error===0, and
// info/success/fail/ready/start/box all ===3), so severity must come from type.
test('severityForLog maps each Consola log type to an accurate severity', () => {
  const expected: Record<LogType, string> = {
    silent: 'silent',
    fatal: 'fatal',
    error: 'error',
    fail: 'error',
    warn: 'warn',
    log: 'info',
    info: 'info',
    success: 'info',
    ready: 'info',
    start: 'info',
    box: 'info',
    debug: 'debug',
    trace: 'trace',
    verbose: 'trace',
  }
  for (const [type, severity] of Object.entries(expected)) {
    // Use the real numeric level for that type to prove type wins regardless.
    assert.equal(severityForLog({ type: type as LogType, level: 3 }), severity, type)
  }
})

test('warn is not mislabeled as error and error is not mislabeled as fatal', () => {
  // Regression: logger.warn (level 1) previously rendered as "error" (264x/day)
  // and logger.error (level 0) previously rendered as "fatal" (71x/day).
  assert.equal(severityForLog({ type: 'warn', level: 1 }), 'warn')
  assert.equal(severityForLog({ type: 'error', level: 0 }), 'error')
})

test('severityForLog falls back to numeric level when type is unknown', () => {
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: 0 }), 'error')
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: 1 }), 'warn')
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: 3 }), 'info')
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: 4 }), 'debug')
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: 5 }), 'trace')
  // silent (-Infinity) and verbose (+Infinity) are non-finite.
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: Number.NEGATIVE_INFINITY }), 'silent')
  assert.equal(severityForLog({ type: undefined as unknown as LogType, level: Number.POSITIVE_INFINITY }), 'trace')
})

// --- buildLogEntry: message join + structured field promotion ---
test('buildLogEntry joins string args into message with accurate level', () => {
  const entry = buildLogEntry(makeLog({ type: 'warn', level: 1, args: ['config missing', 'using defaults'] }))
  assert.equal(entry.level, 'warn')
  assert.equal(entry.message, 'config missing using defaults')
  assert.equal(typeof entry.timestamp, 'string')
})

test('buildLogEntry promotes plain-object arg fields to queryable top-level fields', () => {
  // Mirrors the batchPutItems success log shape.
  const entry = buildLogEntry(makeLog({
    type: 'info',
    level: 3,
    args: ['Batch put completed', { type: 'dynamodb', operation: 'batchPut', tableName: 't', processedCount: 5, failedCount: 0 }],
  }))
  assert.equal(entry.level, 'info')
  assert.equal(entry.message, 'Batch put completed')
  assert.equal(entry.type, 'dynamodb')
  assert.equal(entry.operation, 'batchPut')
  assert.equal(entry.tableName, 't')
  assert.equal(entry.processedCount, 5)
  assert.equal(entry.failedCount, 0)
})

test('buildLogEntry never lets a structured object overwrite reserved fields', () => {
  const entry = buildLogEntry(makeLog({
    type: 'error',
    level: 0,
    args: ['real message', { level: 'HACKED', message: 'HACKED', timestamp: 'HACKED', keep: 1 }],
  }))
  assert.equal(entry.level, 'error') // reporter severity wins, not the object's
  assert.equal(entry.message, 'real message')
  assert.notEqual(entry.timestamp, 'HACKED')
  assert.equal(entry.keep, 1)
})

test('buildLogEntry serializes Error args into the message rather than throwing', () => {
  const entry = buildLogEntry(makeLog({ type: 'error', level: 0, args: ['boom:', new Error('kaboom')] }))
  assert.equal(entry.level, 'error')
  assert.match(String(entry.message), /kaboom/)
})
