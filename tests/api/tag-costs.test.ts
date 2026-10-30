import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'
import { createApp, getQuery, toPlainHandler, type EventHandler } from 'h3'
import { CostExplorerClient, GetCostAndUsageCommand, GetTagsCommand } from '@aws-sdk/client-cost-explorer'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { OrganizationsClient } from '@aws-sdk/client-organizations'
import { STSClient } from '@aws-sdk/client-sts'
import { marshall } from '@aws-sdk/util-dynamodb'
import tagCostsHandler from '../../server/api/v1/costs/tags.get'
import tagKeysHandler from '../../server/api/v1/costs/tag-keys.get'
import { clearClientCache } from '../../server/lib/aws-client-factory'
import { costCache } from '../../server/utils/cache-manager'
import { defineV1Alias } from '../../server/utils/v1-route'

const auth = { isAuthenticated: true, authType: 'apikey', scopes: ['costs:read'] }
const period = 'startDate=2026-08-01&endDate=2026-09-01'
const timePeriod = { Start: '2026-08-01', End: '2026-09-01' }
const accounts = [
  { Id: '111111111111', Name: 'Production', Email: 'owner@example.test', Status: 'ACTIVE' },
  { Id: '222222222222', Name: 'Development', Email: 'other@example.test', Status: 'ACTIVE' }
]

async function request(handler: EventHandler, path: string, authentication: unknown = auth) {
  const response = await toPlainHandler(createApp().use(handler))({
    path,
    method: 'GET',
    context: { auth: authentication }
  })
  return { ...response, data: JSON.parse(String(response.body)) }
}

async function mockProviders(t: TestContext) {
  const overrides: Record<string, string | undefined> = {
    AWS_COMMERCIAL_ACCESS_KEY_ID: 'test-access-key',
    AWS_COMMERCIAL_SECRET_ACCESS_KEY: 'test-secret-key',
    COMMERCIAL_AWS_ACCESS_KEY_ID: undefined,
    COMMERCIAL_AWS_SECRET_ACCESS_KEY: undefined,
    AWS_COMMERCIAL_REGION: 'us-east-1',
    COMMERCIAL_AWS_REGION: 'us-east-1',
    AWS_COMMERCIAL_ORGANIZATIONS_ACCOUNT_ID: undefined,
    COMMERCIAL_AWS_ORGANIZATIONS_ACCOUNT_ID: undefined,
    AWS_GOVCLOUD_ACCESS_KEY_ID: undefined,
    AWS_GOVCLOUD_SECRET_ACCESS_KEY: undefined,
    AWS_GOVCLOUD_REGION: 'us-gov-west-1',
    DYNAMODB_CONFIG: '{}',
    AWS_MASTER_ACCOUNT_ID: '999999999999'
  }
  const saved = Object.keys(overrides).map(name => [name, process.env[name]] as const)
  for (const [name, value] of Object.entries(overrides)) {
    if (value === undefined) Reflect.deleteProperty(process.env, name)
    else process.env[name] = value
  }
  clearClientCache()
  await costCache.clear()
  t.after(async () => {
    for (const [name, value] of saved) {
      if (value === undefined) Reflect.deleteProperty(process.env, name)
      else process.env[name] = value
    }
    clearClientCache()
    await costCache.clear()
  })
  t.mock.method(OrganizationsClient.prototype, 'send', async () => ({ Accounts: accounts }))
  t.mock.method(STSClient.prototype, 'send', async () => ({
    Credentials: {
      AccessKeyId: 'test-assumed-key',
      SecretAccessKey: 'test-assumed-secret',
      SessionToken: 'test-session-token',
      Expiration: new Date(Date.now() + 3_600_000)
    }
  }))
}

test('tag APIs enforce costs:read before calling providers', async () => {
  for (const [handler, path] of [
    [tagCostsHandler, '/api/v1/costs/tags?tagKey=Project'],
    [tagKeysHandler, '/api/v1/costs/tag-keys']
  ] as const) {
    assert.equal((await request(handler, path, null)).status, 401)
    assert.equal((await request(handler, path, { ...auth, scopes: ['accounts:read'] })).status, 403)
  }
})

test('tag costs reject invalid keys, dates, environments, and detail options', async () => {
  for (const query of [
    '',
    'tagKey=',
    'tagKey=Project&tagKey=Owner',
    'tagKey=Project&environment=invalid',
    'tagKey=Project&includeValues=yes',
    'tagKey=Project&includeAccounts=invalid',
    'tagKey=Project&proforma=invalid',
    'tagKey=Project&valueGroupKey=Project%24Phoenix&includeValues=false',
    'tagKey=Project&startDate=2026-08-01',
    'tagKey=Project&startDate=2026-08-01&endDate=2026-09-01&period=lastMonth',
    'tagKey=Project&environment=govcloud&proforma=true'
  ]) {
    const response = await request(tagCostsHandler, `/api/v1/costs/tags?${query}`)
    assert.equal(response.status, 400, query)
  }
  for (const query of ['tagKey=Project&tagKey=Owner', 'environment=invalid']) {
    assert.equal((await request(tagKeysHandler, `/api/v1/costs/tag-keys?${query}`)).status, 400)
  }
})

test('tag costs aggregate every AWS page with account selectors and preserve detail filtering', async (t) => {
  await mockProviders(t)
  const calls: GetCostAndUsageCommand[] = []
  t.mock.method(CostExplorerClient.prototype, 'send', async (command: GetCostAndUsageCommand) => {
    assert.ok(command instanceof GetCostAndUsageCommand)
    calls.push(command)
    const input = command.input
    assert.deepEqual(input.Filter?.Dimensions?.Values, ['111111111111', '222222222222'])
    assert.deepEqual(input.TimePeriod, timePeriod)
    assert.ok(input.Metrics?.includes('NetUnblendedCost'))
    if (!input.GroupBy) {
      return { ResultsByTime: [{ TimePeriod: timePeriod, Total: { UnblendedCost: { Amount: '200' }, NetUnblendedCost: { Amount: '200' } } }] }
    }
    assert.deepEqual(input.GroupBy, [{ Type: 'DIMENSION', Key: 'LINKED_ACCOUNT' }, { Type: 'TAG', Key: 'Project' }])
    const groups = input.NextPageToken
      ? [
          { Keys: ['222222222222', 'Project$Phoenix'], Metrics: { NetUnblendedCost: { Amount: '50' } } },
          { Keys: ['222222222222', 'Project$Apollo'], Metrics: { NetUnblendedCost: { Amount: '30' } } }
        ]
      : [
          { Keys: ['111111111111', 'Project$Phoenix'], Metrics: { NetUnblendedCost: { Amount: '100' } } },
          { Keys: ['111111111111', 'Project$'], Metrics: { NetUnblendedCost: { Amount: '20' } } }
        ]
    return {
      ResultsByTime: [{ TimePeriod: timePeriod, Groups: groups }],
      NextPageToken: input.NextPageToken ? undefined : 'second-page'
    }
  })

  const path = `/api/v1/costs/tags?tagKey=Project&${period}&ownedBy=owner%40example.test&ownedBy=other%40example.test`
  const response = await request(tagCostsHandler, path)
  assert.equal(response.status, 200)
  assert.equal(response.data.data.costMetric, 'NetUnblendedCost')
  assert.equal(response.data.data.signedTotalCost, 200)
  assert.equal(response.data.data.totalTaggedCost, 180)
  assert.equal(response.data.data.totalUntaggedCost, 20)
  assert.equal(response.data.data.overallCoverage, 90)
  const phoenix = response.data.data.values.find((value: any) => value.tagValue === 'Phoenix')
  assert.equal(phoenix.billableCost, 150)
  assert.deepEqual(phoenix.accounts.map((account: any) => account.accountName), ['Production', 'Development'])
  assert.equal(calls.length, 3, 'all pages plus authoritative totals must be queried')

  const compact = await request(tagCostsHandler, `${path}&includeAccounts=false`)
  const compactPhoenix = compact.data.data.values.find((value: any) => value.tagValue === 'Phoenix')
  assert.equal(compactPhoenix.accountCount, 2)
  assert.deepEqual(compactPhoenix.accounts, [])
  const detail = await request(tagCostsHandler, `${path}&valueGroupKey=Project%24Phoenix`)
  assert.equal(detail.data.data.values.length, 1)
  assert.equal(detail.data.data.values[0].accounts.length, 2)
  assert.equal(detail.data.data.signedTotalCost, 200)
  assert.equal(calls.length, 3, 'compact and detail requests should reuse the aggregate')
})

test('tag discovery follows AWS pagination and keeps raw tag values intact', async (t) => {
  await mockProviders(t)
  const calls: GetTagsCommand[] = []
  t.mock.method(CostExplorerClient.prototype, 'send', async (command: GetTagsCommand) => {
    assert.ok(command instanceof GetTagsCommand)
    calls.push(command)
    assert.equal(command.input.TagKey, 'Project')
    assert.deepEqual(command.input.TimePeriod, timePeriod)
    return command.input.NextPageToken
      ? { Tags: ['Phoenix, East', 'Apollo'], ReturnSize: 2, TotalSize: 3 }
      : { Tags: ['Phoenix'], ReturnSize: 1, TotalSize: 3, NextPageToken: 'second-page' }
  })
  const response = await request(tagKeysHandler, `/api/v1/costs/tag-keys?tagKey=Project&${period}`)
  assert.equal(response.status, 200)
  assert.deepEqual(response.data.data.tags, ['Apollo', 'Phoenix', 'Phoenix, East'])
  assert.equal(calls.length, 2)
})

test('unmatched selectors return a client error without an organization-wide cost request', async (t) => {
  await mockProviders(t)
  const provider = t.mock.method(CostExplorerClient.prototype, 'send', async () => {
    throw new Error('An unmatched selector must never query billing data')
  })
  for (const [handler, path] of [
    [tagCostsHandler, `/api/v1/costs/tags?tagKey=Project&${period}`],
    [tagKeysHandler, `/api/v1/costs/tag-keys?${period}`]
  ] as const) {
    assert.equal((await request(handler, `${path}&ownedBy=missing%40example.test`)).status, 400)
    assert.equal((await request(handler, `${path}&adminOf=missing%40example.test`)).status, 400)
    assert.equal((await request(handler, `${path}&accountIdentifiers=invalid-identifier`)).status, 400)
  }
  assert.equal(provider.mock.callCount(), 0)
})

test('v1 aliases preserve repeated filters while rewriting account scope in H3', async (t) => {
  await mockProviders(t)
  const alias = defineV1Alias('/api/v1/costs/test', 'costs:read', 'Test', event => getQuery(event), [], true)
  const response = await request(alias, '/api/v1/costs/test?ownedBy=owner%40example.test&tagFilterValues=a&tagFilterValues=b')
  assert.equal(response.status, 200)
  assert.equal(response.data.accountIds, '111111111111')
  assert.equal(response.data.ownedBy, undefined)
  assert.deepEqual(response.data.tagFilterValues, ['a', 'b'])
})

test('GovCloud account selectors retain the paired commercial billing ID after enrichment', async (t) => {
  await mockProviders(t)
  process.env.AWS_GOVCLOUD_ACCESS_KEY_ID = 'test-gov-key'
  process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY = 'test-gov-secret'
  t.mock.method(DynamoDBClient.prototype, 'send', async () => ({
    Items: [marshall({
      requestID: 42,
      awsStandardAccountID: '111111111111',
      awsGovCloudAccountID: '333333333333',
      awsAccountEmail: 'owner@example.test',
      projectName: 'Production'
    })]
  }))
  t.mock.method(OrganizationsClient.prototype, 'send', async () => ({
    Account: { Id: '333333333333', Name: 'GovCloud Production', Email: 'gov-owner@example.test', Status: 'ACTIVE' }
  }))
  const alias = defineV1Alias('/api/v1/costs/test', 'costs:read', 'Test', event => getQuery(event), [], true)
  const response = await request(alias, '/api/v1/costs/test?accountIdentifiers=333333333333')
  assert.equal(response.status, 200)
  assert.equal(response.data.accountIds, '111111111111')
  assert.equal(response.data.accountIdentifiers, undefined)
})

test('tag discovery returns an empty current month on day one without calling AWS', async (t) => {
  await mockProviders(t)
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-10-01T12:00:00Z') })
  const provider = t.mock.method(CostExplorerClient.prototype, 'send', async () => {
    throw new Error('An empty billing period must not reach AWS')
  })
  const response = await request(tagKeysHandler, '/api/v1/costs/tag-keys?period=thisMonth')
  assert.equal(response.status, 200)
  assert.deepEqual(response.data.data.tags, [])
  assert.equal(provider.mock.callCount(), 0)
})

test('GovCloud-only selections are reported instead of silently dropped from cost totals', async (t) => {
  await mockProviders(t)
  process.env.AWS_GOVCLOUD_ACCESS_KEY_ID = 'test-gov-key'
  process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY = 'test-gov-secret'
  t.mock.method(DynamoDBClient.prototype, 'send', async () => ({
    Items: [
      marshall({ requestID: 42, awsStandardAccountID: '111111111111', awsGovCloudAccountID: '333333333333', projectName: 'Production' }),
      marshall({ requestID: 43, awsGovCloudAccountID: '444444444444', projectName: 'GovCloud Only' })
    ]
  }))
  t.mock.method(OrganizationsClient.prototype, 'send', async () => ({}))
  const alias = defineV1Alias('/api/v1/costs/test', 'costs:read', 'Test', () => ({ success: true, data: [] }), [], true)
  const response = await request(alias, '/api/v1/costs/test?accountIdentifiers=333333333333,444444444444')
  assert.equal(response.status, 200)
  assert.deepEqual(response.data.metadata.errors.map((error: any) => [error.code, error.account.govCloudAccountId]), [
    ['MISSING_ENVIRONMENT_ACCOUNT_ID', '444444444444']
  ])
})
