import assert from 'node:assert/strict'
import test from 'node:test'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { STSClient } from '@aws-sdk/client-sts'
import { updateItem } from '../../server/utils/dynamodb'
import { logger } from '../../server/utils/logger'
import { clearClientCache } from '../../server/lib/aws-client-factory'

/**
 * Contract: updateItem must never log key values, update values, attribute
 * names, or marshalled payloads. Those INFO-level dumps previously surfaced
 * high-cardinality application data (e.g. a nested `metricsErrors` field) in
 * CloudWatch, producing false-positive error matches and data-exposure risk.
 *
 * This asserts behaviour (what the logger receives), not source text, so it
 * stays robust to refactors. We capture every logger call, drive a real
 * updateItem with a mocked SDK send, and check that the sensitive payload
 * never appears in any log arg and that the only diagnostic is debug-level.
 */
test('updateItem emits no payload, keys, or attribute names in logs', async (t) => {
  const overrides = {
    AWS_GOVCLOUD_ACCESS_KEY_ID: 'test-base-key',
    AWS_GOVCLOUD_SECRET_ACCESS_KEY: 'test-base-secret',
    AWS_GOVCLOUD_REGION: 'us-gov-west-1'
  }
  const previous = Object.keys(overrides).map(key => [key, process.env[key]] as const)
  Object.assign(process.env, overrides)
  clearClientCache()

  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    clearClientCache()
  })

  t.mock.method(STSClient.prototype, 'send', async () => ({
    Credentials: {
      AccessKeyId: 'test-assumed-key',
      SecretAccessKey: 'test-assumed-secret',
      SessionToken: 'test-session',
      Expiration: new Date(Date.now() + 3_600_000)
    }
  }))
  t.mock.method(DynamoDBClient.prototype, 'send', async () => ({ Attributes: {} }))

  // Capture every logger invocation with its level.
  const calls: Array<{ level: string, args: unknown[] }> = []
  for (const level of ['debug', 'info', 'warn', 'error', 'trace'] as const) {
    t.mock.method(logger, level, (...args: unknown[]) => {
      calls.push({ level, args })
    })
  }

  // Sensitive markers that must never reach the logs.
  const SECRET_VALUE = 'SENSITIVE-PAYLOAD-TOKEN-should-never-be-logged'
  const SECRET_KEY = 'pk-SENSITIVE-key-value'
  const ATTR_NAME = 'metricsErrors'

  await updateItem(
    'ghost-findings',
    { pk: SECRET_KEY, sk: 'finding#1' },
    { [ATTR_NAME]: SECRET_VALUE, status: 'open' },
    'govcloud',
    '123456789012'
  )

  const serialized = calls.map(c => JSON.stringify(c.args)).join('\n')

  // The payload value, the key value, and the attribute name must be absent.
  assert.ok(!serialized.includes(SECRET_VALUE), 'update value leaked into logs')
  assert.ok(!serialized.includes(SECRET_KEY), 'key value leaked into logs')
  assert.ok(!serialized.includes(ATTR_NAME), 'attribute name leaked into logs')

  // No info/warn/error diagnostics on the happy path — only debug metadata.
  const infoCalls = calls.filter(c => c.level === 'info')
  assert.equal(infoCalls.length, 0, 'updateItem must not log at info on success')

  const debugCalls = calls.filter(c => c.level === 'debug')
  assert.ok(debugCalls.length >= 1, 'expected a debug metadata summary')

  // The debug summary may carry only safe metadata keys.
  const summary = debugCalls.find(c =>
    c.args[0] === '[DynamoDB updateItem] prepared command'
    && c.args.some(a => typeof a === 'object' && a !== null)
  )
  assert.ok(summary, 'debug summary should include a metadata object')
  const meta = summary!.args.find(a => typeof a === 'object' && a !== null) as Record<string, unknown>
  const allowedKeys = new Set([
    'tableName',
    'environment',
    'updateFieldCount',
    'attributeNameCount',
    'attributeValueCount',
    'keySize',
    'valuesSize'
  ])
  for (const key of Object.keys(meta)) {
    assert.ok(allowedKeys.has(key), `unexpected metadata key logged: ${key}`)
  }
})
