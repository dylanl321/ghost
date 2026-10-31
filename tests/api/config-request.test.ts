import assert from 'node:assert/strict'
import test from 'node:test'
import {
  configAggregatorRegion,
  hasAccountCriteria,
  parseConfigEnvironment,
  partitionAccountId
} from '../../server/utils/config-request'
import { configTagsToRecord } from '../../server/utils/config-service'

test('Config routes accept only the two partitions', () => {
  assert.equal(parseConfigEnvironment(undefined), 'commercial')
  assert.equal(parseConfigEnvironment('govcloud'), 'govcloud')
  assert.equal(parseConfigEnvironment('us-gov'), null)
})

test('The aggregator is always called in its home region', () => {
  assert.equal(configAggregatorRegion('govcloud'), process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1')
  assert.equal(configAggregatorRegion('commercial'), process.env.AWS_COMMERCIAL_REGION || 'us-east-1')
})

test('Account IDs come from the requested partition', () => {
  const account = { accountId: '111111111111', govCloudAccountId: '222222222222' }
  assert.equal(partitionAccountId(account, 'commercial'), '111111111111')
  assert.equal(partitionAccountId(account, 'govcloud'), '222222222222')
})

test('A LOB filter counts as account criteria even when it matches nothing', () => {
  assert.equal(hasAccountCriteria({ linesOfBusiness: ['Nonexistent'] }), true)
  assert.equal(hasAccountCriteria({ includeDecommissioned: true }), false)
})

test('Config tags parse from arrays, maps and JSON strings', () => {
  assert.deepEqual(configTagsToRecord([{ key: 'Env', value: 'prod' }]), { Env: 'prod' })
  assert.deepEqual(configTagsToRecord('[{"key":"Env","value":"dev"}]'), { Env: 'dev' })
  assert.deepEqual(configTagsToRecord('not json'), {})
})
