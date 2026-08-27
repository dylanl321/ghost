import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isProductionDeployment,
  mergeDynamoDBConfig,
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
