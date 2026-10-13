import assert from 'node:assert/strict'
import test from 'node:test'
import { buildResolvedCostScope, normalizeCostDateRange, normalizeCostForecastRange } from '../../server/mcp/cost-scope'

test('GovCloud cost scope uses partition linked IDs and keeps Commercial metadata IDs', () => {
  const previous = process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID
  process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID = '999999999999'
  try {
    const scope = buildResolvedCostScope({
      environment: 'govcloud',
      organizationWide: false,
      commercialAccountIds: ['111111111111'],
      operationalAccountIds: ['222222222222'],
      accounts: [{ name: 'Example', commercialAccountId: '111111111111', govCloudAccountId: '222222222222', selectedAccountId: '222222222222', environment: 'govcloud' }]
    }, 'govcloud', 'billable')
    assert.deepEqual(scope.linkedAccountIds, ['222222222222'])
    assert.deepEqual(scope.metadataCommercialAccountIds, ['111111111111'])
    assert.equal(scope.payerAccountId, '999999999999')
  } finally {
    if (previous === undefined) delete process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID
    else process.env.AWS_GOVCLOUD_MASTER_ACCOUNT_ID = previous
  }
})

test('forecast ranges reject historical starts', () => {
  assert.throws(() => normalizeCostForecastRange({ start_date: '2026-08-16', end_date: '2026-08-20' }, new Date('2026-08-17T12:00:00Z')), /cannot be before today/)
})

test('resource cost ranges reject more than fourteen exclusive-end days', () => {
  assert.throws(() => normalizeCostDateRange({ start_date: '2026-08-01', end_date: '2026-08-16', maximumDays: 14 }), /at most 14 days/)
  assert.equal(normalizeCostDateRange({ start_date: '2026-08-01', end_date: '2026-08-15', maximumDays: 14 }).endDate, '2026-08-15')
})
