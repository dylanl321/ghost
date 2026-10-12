import assert from 'node:assert/strict'
import test from 'node:test'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { STSClient } from '@aws-sdk/client-sts'
import { createApiKey } from '../../server/utils/api-keys'
import { clearClientCache } from '../../server/lib/aws-client-factory'

test('API key creation assumes the configured table account before writing', async (t) => {
  const overrides = {
    AWS_GOVCLOUD_ACCESS_KEY_ID: 'test-base-key',
    AWS_GOVCLOUD_SECRET_ACCESS_KEY: 'test-base-secret',
    AWS_GOVCLOUD_REGION: 'us-gov-west-1',
    DYNAMODB_API_KEYS_TABLE: 'ghost-api-keys-prod',
    DYNAMODB_CONFIG: JSON.stringify({ apiKeys: {
      tableName: 'ghost-api-keys', environment: 'govcloud',
      region: 'us-gov-west-1', accountId: '123456789012'
    } })
  }
  const previous = Object.keys(overrides).map(key => [key, process.env[key]] as const)
  Object.assign(process.env, overrides)
  clearClientCache()
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    clearClientCache()
  })
  let assumed = false
  t.mock.method(STSClient.prototype, 'send', async (command: any) => {
    assert.match(command.input.RoleArn, /:123456789012:role\//)
    assumed = true
    return { Credentials: {
      AccessKeyId: 'test-assumed-key', SecretAccessKey: 'test-assumed-secret',
      SessionToken: 'test-session', Expiration: new Date(Date.now() + 3_600_000)
    } }
  })
  const write = t.mock.method(DynamoDBClient.prototype, 'send', async function (command: any) {
    assert.equal(assumed, true)
    assert.ok(command instanceof PutItemCommand)
    assert.equal(command.input.TableName, 'ghost-api-keys-prod')
    assert.equal((await this.config.credentials()).accessKeyId, 'test-assumed-key')
    assert.equal(command.input.Item.createdBy.S, 'owner@example.com')
    return {}
  })
  const result = await createApiKey({ name: 'Reporting', scopes: ['accounts:read'] }, 'owner@example.com')
  assert.ok(result.key)
  assert.equal(write.mock.callCount(), 1)
})
