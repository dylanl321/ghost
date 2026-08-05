import assert from 'node:assert/strict'
import test from 'node:test'
import { getAccountScopeCacheKey } from '../../server/utils/cache-keys'
import { buildTagCoverageData, extractProformaAccountTotals } from '../../server/utils/cost-tag-analysis'

const resultsByTime = [
  {
    Groups: [
      { Keys: ['111111111111', 'Project$Phoenix'], Metrics: { UnblendedCost: { Amount: '100' } } },
      { Keys: ['111111111111', 'Project$'], Metrics: { UnblendedCost: { Amount: '20' } } },
      { Keys: ['222222222222', 'Project$Phoenix'], Metrics: { UnblendedCost: { Amount: '50' } } },
      { Keys: ['222222222222', 'Project$Apollo'], Metrics: { UnblendedCost: { Amount: '30' } } }
    ]
  }
]

test('aggregates tag values across accounts and weights proforma per account', () => {
  const data = buildTagCoverageData('Project', resultsByTime, {
    includeValues: true,
    accountNames: new Map([
      ['111111111111', 'Production'],
      ['222222222222', 'Development']
    ]),
    proformaRequested: true,
    proformaAccountTotals: new Map([
      ['111111111111', { billable: 120, proforma: 120 }],
      ['222222222222', { billable: 80, proforma: 40 }]
    ])
  })

  assert.equal(data.totalTaggedCost, 180)
  assert.equal(data.totalUntaggedCost, 20)
  assert.equal(data.overallCoverage, 90)
  assert.equal(data.estimatedProformaTaggedCost, 140)
  assert.equal(data.estimatedProformaUntaggedCost, 20)
  assert.equal(data.proformaEstimation?.available, true)

  const phoenix = data.values?.find(value => value.tagValue === 'Phoenix')
  assert.equal(phoenix?.billableCost, 150)
  assert.equal(phoenix?.estimatedProformaCost, 125)
  assert.deepEqual(phoenix?.accounts.map(account => account.accountName), ['Production', 'Development'])
})

test('does not publish partial proforma estimates', () => {
  const data = buildTagCoverageData('Project', resultsByTime, {
    includeValues: true,
    proformaRequested: true,
    proformaAccountTotals: new Map([
      ['111111111111', { billable: 120, proforma: 120 }]
    ])
  })

  assert.equal(data.proformaEstimation?.available, false)
  assert.deepEqual(data.proformaEstimation?.unavailableAccountIds, ['222222222222'])
  assert.equal(data.estimatedProformaTaggedCost, undefined)
  assert.equal(data.values?.some(value => value.estimatedProformaCost !== undefined), false)
})

test('extracts and sums account comparisons from proforma periods', () => {
  const totals = extractProformaAccountTotals({
    comparison: {
      byTime: [
        { accountComparisons: [{ accountId: '111111111111', billable: 10, proforma: 8 }] },
        { accountComparisons: [{ accountId: '111111111111', billable: 20, proforma: 18 }] }
      ]
    }
  })

  assert.deepEqual(totals.get('111111111111'), { billable: 30, proforma: 26 })
})

test('account scope cache keys are order-independent and collision-resistant', () => {
  const first = Array.from({ length: 20 }, (_, index) => String(index).padStart(12, '0'))
  const reordered = [...first].reverse()
  const different = [...first.slice(0, -1), '999999999999']

  assert.equal(getAccountScopeCacheKey(first), getAccountScopeCacheKey(reordered))
  assert.notEqual(getAccountScopeCacheKey(first), getAccountScopeCacheKey(different))
})
