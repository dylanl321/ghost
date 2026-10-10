import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearConfigCache,
  getDynamoDBConfig,
  getDynamoDBConfigDiagnostic,
  isProductionDeployment,
  mergeDynamoDBConfig,
  shouldLogStaleSecret,
  type DynamoDBConfig,
  type DynamoDBTableConfig
} from '../../server/lib/dynamodb-config'

const monitoringLocation = {
  environment: 'commercial',
  region: 'us-east-1',
  accountId: '253821132832'
} as const

function budgetConfig(tableName: string, readOnly: boolean): DynamoDBTableConfig {
  return { tableName, ...monitoringLocation, readOnly }
}

test('stale secrets cannot relocate budget alert tables from the monitoring account', () => {
  const defaults = {
    budgetAlerts: budgetConfig('budget-alert-system-alert-history-prod', true),
    budgetAlertConfig: budgetConfig('budget-alert-system-config-prod', false)
  } as DynamoDBConfig
  const configured = {
    budgetAlerts: {
      tableName: 'custom-alert-history',
      environment: 'commercial',
      region: 'us-east-1',
      accountId: '205950196477',
      readOnly: true
    },
    budgetAlertConfig: {
      tableName: 'custom-alert-config',
      environment: 'commercial',
      region: 'us-west-2',
      accountId: '205950196477',
      readOnly: false
    }
  } satisfies Partial<DynamoDBConfig>

  const merged = mergeDynamoDBConfig(defaults, configured)

  assert.deepEqual(merged.budgetAlerts, budgetConfig('custom-alert-history', true))
  assert.deepEqual(merged.budgetAlertConfig, budgetConfig('custom-alert-config', false))
})

test('dev deployment remains non-production when Nitro build mode is production', () => {
  assert.equal(isProductionDeployment({
    NODE_ENV: 'production',
    GHOST_ENV: 'dev',
    DYNAMODB_CONFIG_SECRET_NAME: 'ghost-dynamodb-config-dev'
  }), false)
})

test('legacy dev deployment is inferred from its DynamoDB secret name', () => {
  assert.equal(isProductionDeployment({
    NODE_ENV: 'production',
    DYNAMODB_CONFIG_SECRET_NAME: 'ghost-dynamodb-config-dev'
  }), false)
})

test('prod deployment remains production', () => {
  assert.equal(isProductionDeployment({
    NODE_ENV: 'production',
    GHOST_ENV: 'prod',
    DYNAMODB_CONFIG_SECRET_NAME: 'ghost-dynamodb-config-prod'
  }), true)
})

test('stale-secret warning is rate-limited per unchanged signature, immediate on change', () => {
  clearConfigCache()
  const hour = 60 * 60 * 1000
  const t0 = 1_000_000

  // First observation of a signature logs immediately.
  assert.equal(shouldLogStaleSecret('a,b,c', t0), true)
  // Same signature on the next five-minute refresh is suppressed.
  assert.equal(shouldLogStaleSecret('a,b,c', t0 + 5 * 60 * 1000), false)
  assert.equal(shouldLogStaleSecret('a,b,c', t0 + hour - 1), false)
  // After an hour the unchanged signature logs again.
  assert.equal(shouldLogStaleSecret('a,b,c', t0 + hour), true)
  // A changed signature logs immediately regardless of the interval.
  assert.equal(shouldLogStaleSecret('a,b,c,d', t0 + hour + 1), true)
  clearConfigCache()
})

test('diagnostic reports a stale secret with redacted key names only', async () => {
  const prevConfig = process.env.DYNAMODB_CONFIG
  const prevNodeEnv = process.env.NODE_ENV
  // A partial secret providing only one key; everything else falls back to env.
  process.env.DYNAMODB_CONFIG = JSON.stringify({
    scheduledReports: {
      tableName: 'secret-scheduled-reports',
      environment: 'govcloud',
      region: 'us-gov-west-1',
      accountId: '111111111111'
    }
  })
  process.env.NODE_ENV = 'production'
  clearConfigCache()

  try {
    await getDynamoDBConfig()
    const diag = getDynamoDBConfigDiagnostic()

    assert.equal(diag.source, 'secret')
    assert.ok(diag.missingKeyCount > 0)
    assert.equal(diag.missingKeyCount, diag.missingKeys.length)
    assert.ok(!diag.missingKeys.includes('scheduledReports'))
    assert.ok(diag.missingKeys.includes('userNotifications'))
    assert.equal(typeof diag.loadedAt, 'string')
    assert.equal(typeof diag.lastObservedAt, 'string')

    // The diagnostic must never expose secret values or table contents.
    assert.deepEqual(
      Object.keys(diag).sort(),
      ['lastObservedAt', 'loadedAt', 'missingKeyCount', 'missingKeys', 'source']
    )
    const serialized = JSON.stringify(diag)
    assert.ok(!serialized.includes('secret-scheduled-reports'))
    assert.ok(!serialized.includes('111111111111'))
  } finally {
    if (prevConfig === undefined) delete process.env.DYNAMODB_CONFIG
    else process.env.DYNAMODB_CONFIG = prevConfig
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = prevNodeEnv
    clearConfigCache()
  }
})
