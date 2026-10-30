import assert from 'node:assert/strict'
import { randomBytes, scryptSync } from 'node:crypto'
import test from 'node:test'
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  ScanCommand,
  UpdateItemCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { STSClient } from '@aws-sdk/client-sts'
import {
  createApiKey,
  deactivateApiKey,
  parseApiKey,
  resetApiKeyCachesForTests,
  updateApiKeyMetadata,
  validateApiKey
} from '../../server/utils/api-keys'
import { clearClientCache } from '../../server/lib/aws-client-factory'
import { getClientAddress } from '../../server/utils/client-address'

interface FakeTable {
  rows: Map<string, Record<string, any>>
  calls: string[]
}

function useFakeApiKeyTable(t: test.TestContext): FakeTable {
  const overrides = {
    AWS_GOVCLOUD_ACCESS_KEY_ID: 'test-base-key',
    AWS_GOVCLOUD_SECRET_ACCESS_KEY: 'test-base-secret',
    AWS_GOVCLOUD_REGION: 'us-gov-west-1',
    DYNAMODB_API_KEYS_TABLE: 'ghost-api-keys-test',
    DYNAMODB_CONFIG: JSON.stringify({ apiKeys: {
      tableName: 'ghost-api-keys', environment: 'govcloud',
      region: 'us-gov-west-1', accountId: '123456789012'
    } })
  }
  const previous = Object.keys(overrides).map(key => [key, process.env[key]] as const)
  Object.assign(process.env, overrides)
  clearClientCache()
  t.after(async () => {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    clearClientCache()
    await resetApiKeyCachesForTests()
  })

  t.mock.method(STSClient.prototype, 'send', async () => ({ Credentials: {
    AccessKeyId: 'test-assumed-key', SecretAccessKey: 'test-assumed-secret',
    SessionToken: 'test-session', Expiration: new Date(Date.now() + 3_600_000)
  } }))

  const table: FakeTable = { rows: new Map(), calls: [] }
  t.mock.method(DynamoDBClient.prototype, 'send', async (command: any) => {
    if (command instanceof GetItemCommand) {
      table.calls.push('GetItem')
      const { id } = unmarshall(command.input.Key!)
      const row = table.rows.get(id)
      return { Item: row ? marshall(row, { removeUndefinedValues: true }) : undefined }
    }
    if (command instanceof PutItemCommand) {
      table.calls.push('PutItem')
      const row = unmarshall(command.input.Item!)
      table.rows.set(row.id, row)
      return {}
    }
    if (command instanceof ScanCommand) {
      table.calls.push('Scan')
      return { Items: [...table.rows.values()].map(row => marshall(row, { removeUndefinedValues: true })) }
    }
    if (command instanceof UpdateItemCommand) {
      table.calls.push('UpdateItem')
      const { id } = unmarshall(command.input.Key!)
      const values = unmarshall(command.input.ExpressionAttributeValues!)
      const names = command.input.ExpressionAttributeNames!
      const row = { ...table.rows.get(id) }
      for (const part of command.input.UpdateExpression!.replace(/^SET /, '').split(', ')) {
        const [name, value] = part.split(' = ')
        row[names[name!]!] = values[value!]
      }
      table.rows.set(id, row)
      return { Attributes: marshall(row, { removeUndefinedValues: true }) }
    }
    throw new Error(`Unexpected DynamoDB command ${command.constructor.name}`)
  })
  return table
}

function legacyRow(id: string, key: string, overrides: Record<string, any> = {}) {
  const salt = randomBytes(16).toString('hex')
  return {
    id,
    name: `legacy ${id}`,
    keyHash: scryptSync(key, salt, 64).toString('hex'),
    salt,
    scopes: ['accounts:read'],
    isActive: 'true',
    createdBy: 'owner@example.com',
    createdAt: new Date().toISOString(),
    ...overrides
  }
}

test('new keys embed their record id and validate with a single lookup', async (t) => {
  const table = useFakeApiKeyTable(t)
  // Plenty of other keys: none of them may be hashed or scanned for a v2 key.
  for (let i = 0; i < 5; i++) {
    const legacyKey = `gdms_test_${randomBytes(16).toString('hex')}`
    table.rows.set(`legacy${i}`, legacyRow(`legacy${i}`, legacyKey))
  }

  const created = await createApiKey({ name: 'Reporting', scopes: ['costs:read'] }, 'owner@example.com')
  assert.deepEqual(parseApiKey(created.key), { format: 'v2', id: created.id })
  assert.equal(table.rows.get(created.id)!.keyFormat, 'v2')

  table.calls.length = 0
  const result = await validateApiKey(created.key)
  assert.deepEqual(result, { valid: true, id: created.id, scopes: ['costs:read'] })
  assert.deepEqual(table.calls.filter(call => call !== 'UpdateItem'), ['GetItem'])
})

test('malformed keys are rejected without touching storage', async (t) => {
  const table = useFakeApiKeyTable(t)
  for (const key of ['', 'not-a-key', 'gdms_test_xyz', `gdms_test_${'a'.repeat(200)}`, 'gdms_test_0123456789abcdef_short']) {
    const result = await validateApiKey(key)
    assert.equal(result.valid, false)
    assert.equal(result.error, 'Invalid API key')
  }
  assert.deepEqual(table.calls, [])
})

test('a v2 key with the right id but wrong secret is invalid, not revealed as revoked', async (t) => {
  const table = useFakeApiKeyTable(t)
  const created = await createApiKey({ name: 'Reporting', scopes: ['costs:read'] }, 'owner@example.com')
  table.rows.get(created.id)!.isActive = 'false'
  await resetApiKeyCachesForTests()
  const forged = created.key.replace(/[0-9a-f]{32}$/, 'f'.repeat(32))
  assert.deepEqual(await validateApiKey(forged), { valid: false, error: 'Invalid API key' })
  assert.deepEqual(await validateApiKey(created.key), { valid: false, error: 'API key has been revoked' })
})

test('expired keys report expiry', async (t) => {
  const table = useFakeApiKeyTable(t)
  const created = await createApiKey({ name: 'Reporting', scopes: ['costs:read'] }, 'owner@example.com')
  table.rows.get(created.id)!.expiresAt = new Date(Date.now() - 1000).toISOString()
  await resetApiKeyCachesForTests()
  assert.deepEqual(await validateApiKey(created.key), { valid: false, error: 'API key has expired' })
})

test('revoking a key takes effect immediately on the task that revoked it', async (t) => {
  useFakeApiKeyTable(t)
  const created = await createApiKey({ name: 'Reporting', scopes: ['costs:read'] }, 'owner@example.com')
  assert.equal((await validateApiKey(created.key)).valid, true)
  assert.equal(await deactivateApiKey(created.id, 'OWNER@example.com'), true)
  assert.deepEqual(await validateApiKey(created.key), { valid: false, error: 'API key has been revoked' })
})

test('legacy keys still validate and are not rescanned on every request', async (t) => {
  const table = useFakeApiKeyTable(t)
  const legacyKey = `gdms_production_${randomBytes(16).toString('hex')}`
  table.rows.set('aaaaaaaaaaaaaaaa', legacyRow('aaaaaaaaaaaaaaaa', legacyKey))
  table.rows.set('bbbbbbbbbbbbbbbb', legacyRow('bbbbbbbbbbbbbbbb', `gdms_production_${randomBytes(16).toString('hex')}`))

  assert.deepEqual(await validateApiKey(legacyKey), { valid: true, id: 'aaaaaaaaaaaaaaaa', scopes: ['accounts:read'] })
  table.calls.length = 0
  assert.equal((await validateApiKey(legacyKey)).valid, true)
  assert.deepEqual(table.calls.filter(call => call !== 'UpdateItem'), [])

  const unknown = `gdms_production_${randomBytes(16).toString('hex')}`
  assert.equal((await validateApiKey(unknown)).valid, false)
})

test('a revoked legacy key stops matching even if it was matched recently', async (t) => {
  const table = useFakeApiKeyTable(t)
  const legacyKey = `gdms_production_${randomBytes(16).toString('hex')}`
  table.rows.set('aaaaaaaaaaaaaaaa', legacyRow('aaaaaaaaaaaaaaaa', legacyKey))
  assert.equal((await validateApiKey(legacyKey)).valid, true)
  assert.equal(await deactivateApiKey('aaaaaaaaaaaaaaaa', 'owner@example.com'), true)
  assert.equal((await validateApiKey(legacyKey)).valid, false)
})

test('metadata updates target the configured table account and keep reserved fields', async (t) => {
  const table = useFakeApiKeyTable(t)
  const created = await createApiKey({
    name: 'Reporting',
    scopes: ['costs:read'],
    metadata: { integrationContract: 'v1', purpose: 'billing' }
  }, 'owner@example.com')

  assert.equal(await updateApiKeyMetadata(created.id, 'someone@example.com', { purpose: 'x' }), false)
  assert.equal(await updateApiKeyMetadata('missing', 'owner@example.com', { purpose: 'x' }), false)
  assert.equal(await updateApiKeyMetadata(created.id, 'owner@example.com', {
    purpose: 'finance', integrationContract: 'legacy'
  }), true)
  assert.deepEqual(table.rows.get(created.id)!.metadata, { integrationContract: 'v1', purpose: 'finance' })

  await assert.rejects(
    updateApiKeyMetadata(created.id, 'owner@example.com', { blob: 'x'.repeat(5000) }),
    (error: any) => error.statusCode === 400
  )
})

test('client address comes from the load balancer hop, not client-supplied entries', () => {
  const req = (forwarded?: string) => ({ headers: { 'x-forwarded-for': forwarded }, socket: { remoteAddress: '10.0.0.5' } })
  assert.equal(getClientAddress(req('1.2.3.4, 203.0.113.9'), 1), '203.0.113.9')
  assert.equal(getClientAddress(req('203.0.113.9'), 1), '203.0.113.9')
  assert.equal(getClientAddress(req(undefined), 1), '10.0.0.5')
  assert.equal(getClientAddress(req('1.2.3.4, 198.51.100.1, 203.0.113.9'), 2), '198.51.100.1')
  assert.equal(getClientAddress(req('1.2.3.4'), 0), '10.0.0.5')
})
