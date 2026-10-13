import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearConfigCache,
  getDynamoDBConfig,
  getDynamoDBConfigDiagnostic,
  isProductionDeployment,
  mergeDynamoDBConfig,
  type DynamoDBConfig,
  type DynamoDBTableConfig
} from '../../server/lib/dynamodb-config'

test('config diagnostic is redacted and returned as a defensive copy', async () => {
  const originalNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'development'

  try {
    clearConfigCache()
    await getDynamoDBConfig()

    const diagnostic = getDynamoDBConfigDiagnostic()
    assert.equal(diagnostic.source, 'development-env')
    assert.equal(diagnostic.missingKeyCount, 0)
    assert.deepEqual(diagnostic.missingKeys, [])
    assert.ok(diagnostic.loadedAt)
    assert.deepEqual(Object.keys(diagnostic).sort(), [
      'loadedAt',
      'missingKeyCount',
      'missingKeys',
      'source'
    ])

    const returnedKeys: string[] = diagnostic.missingKeys
    returnedKeys.push('mutation-must-not-leak')
    assert.deepEqual(getDynamoDBConfigDiagnostic().missingKeys, [])
  } finally {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    clearConfigCache()
  }
})

const monitoringLocation = {
  environment: 'commercial',
  region: 'us-east-1',
  accountId: '253821132832'
} as const

function budgetConfig(tableName: string, readOnly: boolean): DynamoDBTableConfig {
  return { tableName, ...monitoringLocation, readOnly }
}

test('deployed API key table names override stale secrets while retaining their location', () => {
  const previousKeys = process.env.DYNAMODB_API_KEYS_TABLE
  const previousUsage = process.env.DYNAMODB_API_KEY_USAGE_TABLE
  try {
    process.env.DYNAMODB_API_KEYS_TABLE = 'ghost-api-keys-prod'
    process.env.DYNAMODB_API_KEY_USAGE_TABLE = 'ghost-api-keys-usage-prod'
    const defaults = {
      budgetAlerts: budgetConfig('alerts', true),
      budgetAlertConfig: budgetConfig('alert-config', false),
      apiKeys: budgetConfig('ghost-api-keys-prod', false),
      apiKeysUsage: budgetConfig('ghost-api-keys-usage-prod', false)
    } as DynamoDBConfig
    const configured = {
      apiKeys: budgetConfig('ghost-api-keys', false),
      apiKeysUsage: budgetConfig('ghost-api-keys-usage', false)
    }
    const merged = mergeDynamoDBConfig(defaults, configured)
    assert.deepEqual(merged.apiKeys, defaults.apiKeys)
    assert.deepEqual(merged.apiKeysUsage, defaults.apiKeysUsage)

    delete process.env.DYNAMODB_API_KEYS_TABLE
    delete process.env.DYNAMODB_API_KEY_USAGE_TABLE
    const withoutOverrides = mergeDynamoDBConfig(defaults, configured)
    assert.deepEqual(withoutOverrides.apiKeys, configured.apiKeys)
    assert.deepEqual(withoutOverrides.apiKeysUsage, configured.apiKeysUsage)
  } finally {
    if (previousKeys === undefined) delete process.env.DYNAMODB_API_KEYS_TABLE
    else process.env.DYNAMODB_API_KEYS_TABLE = previousKeys
    if (previousUsage === undefined) delete process.env.DYNAMODB_API_KEY_USAGE_TABLE
    else process.env.DYNAMODB_API_KEY_USAGE_TABLE = previousUsage
  }
})

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
