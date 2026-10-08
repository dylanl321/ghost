import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import type { LogObject } from 'consola'
import { LEVEL_NAMES, formatLogEntry, serializeError } from '../log-format'

const TS = '2026-10-08T00:00:00.000Z'

function makeLog(level: number, args: unknown[], tag = ''): LogObject {
  return { level, args, type: 'log', tag, date: new Date(TS) } as unknown as LogObject
}

test('maps Consola numeric levels to correct severity names', () => {
  assert.equal(LEVEL_NAMES[0], 'error')
  assert.equal(LEVEL_NAMES[1], 'warn')
  assert.equal(LEVEL_NAMES[2], 'info')
  assert.equal(LEVEL_NAMES[3], 'info')
  assert.equal(LEVEL_NAMES[4], 'debug')
  assert.equal(LEVEL_NAMES[5], 'trace')
})

test('reports fatal/error (level 0) as error, never fatal', () => {
  const entry = formatLogEntry(makeLog(0, ['boom']), TS)
  assert.equal(entry.level, 'error')
})

test('reports warn (level 1) as warn, not error', () => {
  const entry = formatLogEntry(makeLog(1, ['DynamoDB config secret exists but has no value']), TS)
  assert.equal(entry.level, 'warn')
  assert.equal(entry.message, 'DynamoDB config secret exists but has no value')
})

test('falls back to info for unknown levels', () => {
  const entry = formatLogEntry(makeLog(999, ['mystery']), TS)
  assert.equal(entry.level, 'info')
})

test('preserves the human-readable message substring for structured calls', () => {
  const entry = formatLogEntry(
    makeLog(3, ['Batch put completed: 50 processed, 0 failed', { component: 'dynamodb' }]),
    TS
  )
  assert.equal(entry.level, 'info')
  assert.ok(String(entry.message).includes('Batch put completed: 50 processed, 0 failed'))
})

test('retains a plain object argument under context without touching the root', () => {
  const entry = formatLogEntry(
    makeLog(3, ['queryItems completed', { tableName: 'costs', count: 3 }]),
    TS
  )
  assert.deepEqual(entry.context, { tableName: 'costs', count: 3 })
  // context keys must not leak into the root entry
  assert.equal((entry as Record<string, unknown>).tableName, undefined)
  assert.equal((entry as Record<string, unknown>).count, undefined)
})

test('merges multiple plain object arguments into a single context', () => {
  const entry = formatLogEntry(makeLog(3, ['msg', { a: 1 }, { b: 2 }]), TS)
  assert.deepEqual(entry.context, { a: 1, b: 2 })
})

test('retains safe error fields under error', () => {
  const err = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
  const entry = formatLogEntry(makeLog(0, ['Receive loop failed', err]), TS)
  const error = entry.error as Record<string, unknown>
  assert.equal(error.name, 'Error')
  assert.equal(error.message, 'socket hang up')
  assert.equal(error.code, 'ECONNRESET')
  // error fields must not leak into the root entry
  assert.equal((entry as Record<string, unknown>).code, undefined)
})

test('serializeError keeps only safe, serializable fields', () => {
  const err = Object.assign(new TypeError('bad'), { code: 42 })
  const serialized = serializeError(err)
  assert.equal(serialized.name, 'TypeError')
  assert.equal(serialized.message, 'bad')
  assert.equal(serialized.code, 42)
  assert.ok(typeof serialized.stack === 'string')
})

test('includes a tag when present', () => {
  const entry = formatLogEntry(makeLog(3, ['tagged'], 'worker'), TS)
  assert.equal(entry.tag, 'worker')
})

test('handles circular context without throwing and stays JSON-serializable', () => {
  const circular: Record<string, unknown> = { name: 'node' }
  circular.self = circular
  const entry = formatLogEntry(makeLog(3, ['cycle detected', circular]), TS)

  // The final reporter calls JSON.stringify(entry); it must not throw.
  const serialized = JSON.stringify(entry)
  assert.ok(serialized.includes('[Circular]'))

  const context = entry.context as Record<string, unknown>
  assert.equal(context.name, 'node')
  assert.equal(context.self, '[Circular]')
})

test('redacts secret-named keys in context and message, including nested objects/arrays', () => {
  const SECRET = 'super-secret-value-should-never-appear'
  const context = {
    tableName: 'costs',
    apiKey: SECRET,
    api_key: SECRET,
    'access-key': SECRET,
    nested: {
      Authorization: `Bearer ${SECRET}`,
      password: SECRET,
      safe: 'keep-me',
    },
    headers: [{ Cookie: SECRET }, { credential: SECRET }],
  }
  const entry = formatLogEntry(makeLog(3, ['auth attempt', context], 'worker'), TS)

  const serialized = JSON.stringify(entry)
  // No sample secret may appear anywhere in the formatted output.
  assert.ok(!serialized.includes(SECRET), 'secret value leaked into formatted entry')
  // Non-sensitive values remain useful.
  const ctx = entry.context as Record<string, unknown>
  assert.equal(ctx.tableName, 'costs')
  assert.equal(ctx.apiKey, '[REDACTED]')
  assert.equal(ctx.api_key, '[REDACTED]')
  assert.equal(ctx['access-key'], '[REDACTED]')
  const nested = ctx.nested as Record<string, unknown>
  assert.equal(nested.Authorization, '[REDACTED]')
  assert.equal(nested.password, '[REDACTED]')
  assert.equal(nested.safe, 'keep-me')
  const headers = ctx.headers as Record<string, unknown>[]
  assert.equal(headers[0].Cookie, '[REDACTED]')
  assert.equal(headers[1].credential, '[REDACTED]')
})

test('bounds pathological nesting depth without throwing', () => {
  let deep: Record<string, unknown> = { value: 'bottom' }
  for (let i = 0; i < 50; i++) deep = { child: deep }
  const entry = formatLogEntry(makeLog(3, ['deep', deep]), TS)
  // Must remain serializable.
  assert.doesNotThrow(() => JSON.stringify(entry))
  assert.ok(JSON.stringify(entry).includes('[MaxDepth]'))
})

test('preserves ordinary message substrings alongside sanitized context', () => {
  const entry = formatLogEntry(
    makeLog(3, ['Batch put completed', { token: 'abc123', count: 5 }]),
    TS
  )
  assert.ok(String(entry.message).includes('Batch put completed'))
  assert.ok(!String(entry.message).includes('abc123'))
  assert.equal((entry.context as Record<string, unknown>).token, '[REDACTED]')
  assert.equal((entry.context as Record<string, unknown>).count, 5)
})
