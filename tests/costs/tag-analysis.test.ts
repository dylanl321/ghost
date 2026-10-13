import assert from 'node:assert/strict'
import test from 'node:test'
import { getAccountScopeCacheKey } from '../../server/utils/cache-keys'
import { buildCostExplorerTagFilter, getCostTagFilterCacheKey, parseCostTagFilter } from '../../server/utils/cost-tag-filters'
import { buildTagCoverageData, extractProformaAccountPeriodTotals, extractProformaAccountTotals, shapeTagCoverageData } from '../../server/utils/cost-tag-analysis'
import { normalizeCostTagIdentity } from '../../shared/utils/cost-tag-identities'
import {
  getCostTagWorkspaceQuery,
  normalizeCostTagCreatorView,
  resolveCostTagSelection
} from '../../app/utils/cost-tag-workspace'

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

test('omits account contributions from the initial tag-value payload and returns one value on demand', () => {
  const full = buildTagCoverageData('Project', resultsByTime, { includeValues: true })
  const compact = shapeTagCoverageData(full, { includeAccounts: false })
  const phoenix = compact.values?.find(value => value.groupKey === 'Project$Phoenix')

  assert.equal(phoenix?.accountCount, 2)
  assert.deepEqual(phoenix?.accounts, [])

  const detail = shapeTagCoverageData(full, { valueGroupKey: 'Project$Phoenix' })
  assert.equal(detail.values?.length, 1)
  assert.equal(detail.values?.[0]?.accounts.length, 2)
})

test('uses NetUnblendedCost for tag distribution when requested', () => {
  const data = buildTagCoverageData('Project', [{
    TimePeriod: { Start: '2026-07-01', End: '2026-08-01' },
    Groups: [
      {
        Keys: ['tagged-account', 'Project$Phoenix'],
        Metrics: {
          UnblendedCost: { Amount: '250' },
          NetUnblendedCost: { Amount: '100' }
        }
      },
      {
        Keys: ['tagged-account', 'Project$'],
        Metrics: {
          UnblendedCost: { Amount: '-150' },
          NetUnblendedCost: { Amount: '100' }
        }
      },
      {
        Keys: ['untagged-account', 'Project$'],
        Metrics: {
          UnblendedCost: { Amount: '300' },
          NetUnblendedCost: { Amount: '300' }
        }
      }
    ]
  }], {
    includeValues: true,
    costMetric: 'NetUnblendedCost',
    proformaRequested: true,
    proformaAccountTotals: new Map([
      ['tagged-account', { billable: 200, proforma: 400 }],
      ['untagged-account', { billable: 300, proforma: 300 }]
    ]),
    proformaAccountPeriodTotals: new Map([
      ['2026-07-01|tagged-account', { billable: 200, proforma: 400 }],
      ['2026-07-01|untagged-account', { billable: 300, proforma: 300 }]
    ])
  })

  assert.equal(data.costMetric, 'NetUnblendedCost')
  assert.equal(data.totalTaggedCost, 100)
  assert.equal(data.totalUntaggedCost, 400)
  assert.equal(data.estimatedProformaTaggedCost, 200)
  assert.equal(data.estimatedProformaUntaggedCost, 500)
  assert.equal(data.overallCoverage, 20)
})

test('does not inflate Joe July Project tags with signed unblended adjustments', () => {
  const data = buildTagCoverageData('Project', [{
    TimePeriod: { Start: '2026-07-01', End: '2026-08-01' },
    Groups: [
      { Keys: ['143468284131', 'Project$'], Metrics: { UnblendedCost: { Amount: '-1618.0356264646' }, NetUnblendedCost: { Amount: '1437.6599580215' } } },
      { Keys: ['143468284131', 'Project$DE Demo'], Metrics: { UnblendedCost: { Amount: '2507.6222225408' }, NetUnblendedCost: { Amount: '441.6479977488' } } },
      { Keys: ['143468284131', 'Project$Other'], Metrics: { UnblendedCost: { Amount: '2520.3053190478' }, NetUnblendedCost: { Amount: '1530.5839593537' } } },
      { Keys: ['244184125976', 'Project$'], Metrics: { UnblendedCost: { Amount: '4418.8733143301' }, NetUnblendedCost: { Amount: '4418.8733143301' } } },
      { Keys: ['583621598929', 'Project$'], Metrics: { UnblendedCost: { Amount: '89.0831576859' }, NetUnblendedCost: { Amount: '89.0831576859' } } },
      { Keys: ['967802823695', 'Project$'], Metrics: { UnblendedCost: { Amount: '1948.2620051986' }, NetUnblendedCost: { Amount: '1948.2620051986' } } }
    ]
  }], {
    includeValues: true,
    costMetric: 'NetUnblendedCost',
    proformaRequested: true,
    proformaAccountTotals: new Map([
      ['143468284131', { billable: 3409.891915124, proforma: 5557.7598320818 }],
      ['244184125976', { billable: 4418.8733143301, proforma: 4674.2214389856 }],
      ['583621598929', { billable: 89.0831576859, proforma: 114.7241924947 }],
      ['967802823695', { billable: 1948.2620051986, proforma: 1932.650458419 }]
    ]),
    proformaAccountPeriodTotals: new Map([
      ['2026-07-01|143468284131', { billable: 3409.891915124, proforma: 5557.7598320818 }],
      ['2026-07-01|244184125976', { billable: 4418.8733143301, proforma: 4674.2214389856 }],
      ['2026-07-01|583621598929', { billable: 89.0831576859, proforma: 114.7241924947 }],
      ['2026-07-01|967802823695', { billable: 1948.2620051986, proforma: 1932.650458419 }]
    ])
  })

  assert.ok(Math.abs((data.estimatedProformaTaggedCost || 0) - 3214.5275637963) < 0.01)
  assert.ok(Math.abs((data.estimatedProformaUntaggedCost || 0) - 9064.8283581848) < 0.01)
  assert.ok((data.estimatedProformaTaggedCost || 0) < 4000)
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

test('calculates coverage from positive charges while retaining signed credits', () => {
  const data = buildTagCoverageData('Project', [{
    Groups: [
      { Keys: ['111111111111', 'Project$Phoenix'], Metrics: { UnblendedCost: { Amount: '100' } } },
      { Keys: ['111111111111', 'Project$'], Metrics: { UnblendedCost: { Amount: '50' } } },
      { Keys: ['111111111111', 'Project$Phoenix'], Metrics: { UnblendedCost: { Amount: '-30' } } }
    ]
  }])

  assert.equal(data.totalTaggedCost, 70)
  assert.equal(data.totalUntaggedCost, 50)
  assert.equal(data.signedTotalCost, 120)
  assert.equal(data.positiveTaggedCost, 100)
  assert.equal(data.positiveUntaggedCost, 50)
  assert.equal(data.overallCoverage, 100 / 150 * 100)
})

test('weights proforma estimates by account and time bucket', () => {
  const data = buildTagCoverageData('Project', [
    {
      TimePeriod: { Start: '2026-01-01', End: '2026-02-01' },
      Groups: [{ Keys: ['111111111111', 'Project$Phoenix'], Metrics: { UnblendedCost: { Amount: '100' } } }]
    },
    {
      TimePeriod: { Start: '2026-02-01', End: '2026-03-01' },
      Groups: [{ Keys: ['111111111111', 'Project$Apollo'], Metrics: { UnblendedCost: { Amount: '100' } } }]
    }
  ], {
    includeValues: true,
    proformaRequested: true,
    proformaAccountTotals: new Map([['111111111111', { billable: 200, proforma: 200 }]]),
    proformaAccountPeriodTotals: new Map([
      ['2026-01-01|111111111111', { billable: 100, proforma: 50 }],
      ['2026-02-01|111111111111', { billable: 100, proforma: 150 }]
    ])
  })

  assert.equal(data.values?.find(value => value.tagValue === 'Phoenix')?.estimatedProformaCost, 50)
  assert.equal(data.values?.find(value => value.tagValue === 'Apollo')?.estimatedProformaCost, 150)
})

test('extracts account totals by comparison time bucket', () => {
  const totals = extractProformaAccountPeriodTotals({
    comparison: {
      byTime: [{
        timePeriod: { Start: '2026-01-01' },
        accountComparisons: [{ accountId: '111111111111', billable: 10, proforma: 8 }]
      }]
    }
  })
  assert.deepEqual(totals.get('2026-01-01|111111111111'), { billable: 10, proforma: 8 })
})

test('classifies and normalizes createdBy people without merging automation', () => {
  const email = normalizeCostTagIdentity(
    'aws:createdBy$AssumedRole:AROA111:Dylan.Lewis@gd-ms.com',
    'aws:createdBy'
  )
  const sameEmail = normalizeCostTagIdentity(
    'aws:createdBy$AssumedRole:AROA222:dylan.lewis@GD-MS.COM',
    'aws:createdBy'
  )
  const iamUser = normalizeCostTagIdentity(
    'aws:createdBy$arn:aws-us-gov:iam::111111111111:user/platform/DLewis',
    'aws:createdBy'
  )
  const sameIamUser = normalizeCostTagIdentity(
    'aws:createdBy$arn:aws-us-gov:iam::222222222222:user/platform/dlewis',
    'aws:createdBy'
  )
  const automation = normalizeCostTagIdentity(
    'aws:createdBy$AssumedRole:AROA333:aws-go-sdk-1782841299640555064',
    'aws:createdBy'
  )

  assert.equal(email.groupKey, sameEmail.groupKey)
  assert.equal(email.isPerson, true)
  assert.equal(email.creatorType, 'email')
  assert.equal(iamUser.groupKey, sameIamUser.groupKey)
  assert.equal(iamUser.creatorType, 'iam-user')
  assert.equal(automation.isPerson, false)
  assert.equal(automation.creatorType, 'automation')
})

test('combines createdBy people across role IDs and accounts while preserving raw values', () => {
  const data = buildTagCoverageData('aws:createdBy', [{
    Groups: [
      { Keys: ['111111111111', 'aws:createdBy$AssumedRole:AROA111:Dylan.Lewis@gd-ms.com'], Metrics: { UnblendedCost: { Amount: '10' } } },
      { Keys: ['111111111111', 'aws:createdBy$AssumedRole:AROA222:dylan.lewis@GD-MS.COM'], Metrics: { UnblendedCost: { Amount: '5' } } },
      { Keys: ['222222222222', 'aws:createdBy$AssumedRole:AROA333:Dylan.Lewis@gd-ms.com'], Metrics: { UnblendedCost: { Amount: '20' } } },
      { Keys: ['111111111111', 'aws:createdBy$AssumedRole:AROA444:aws-go-sdk-123'], Metrics: { UnblendedCost: { Amount: '7' } } }
    ]
  }], { includeValues: true })

  const people = data.values?.filter(value => value.isPerson) || []
  const automation = data.values?.find(value => value.creatorType === 'automation')

  assert.equal(people.length, 1)
  assert.equal(people[0]?.billableCost, 35)
  assert.equal(people[0]?.accounts.length, 2)
  assert.equal(people[0]?.accounts.find(account => account.accountId === '111111111111')?.billableCost, 15)
  assert.equal(people[0]?.accounts.find(account => account.accountId === '111111111111')?.rawValues.length, 2)
  assert.equal(people[0]?.rawValues.length, 3)
  assert.equal(automation?.billableCost, 7)
})

test('parses multi-value and legacy cost tag filters with stable cache identity', () => {
  const multi = parseCostTagFilter({
    tagFilterKey: 'aws:createdBy',
    tagFilterValues: ['role-value-2', 'role-value-1', 'role-value-2']
  })
  const reordered = parseCostTagFilter({
    tagFilterKey: 'aws:createdBy',
    tagFilterValues: ['role-value-1', 'role-value-2']
  })
  const legacy = parseCostTagFilter({ tagFilter: 'Project||Phoenix' })

  assert.deepEqual(multi, { key: 'aws:createdBy', values: ['role-value-2', 'role-value-1'] })
  assert.deepEqual(buildCostExplorerTagFilter(multi)?.Tags.Values, ['role-value-2', 'role-value-1'])
  assert.equal(getCostTagFilterCacheKey(multi), getCostTagFilterCacheKey(reordered))
  assert.deepEqual(legacy, { key: 'Project', values: ['Phoenix'] })
})

test('resolves requested tag with account defaults and favorites as fallbacks', () => {
  const availableTags = ['Environment', 'Project', 'Team']

  assert.equal(resolveCostTagSelection({ availableTags, requestedTag: 'Team' }), 'Team')
  assert.equal(resolveCostTagSelection({
    availableTags,
    requestedTag: 'Unavailable',
    defaultTag: 'Project',
    favoriteTags: ['Team']
  }), 'Project')
  assert.equal(resolveCostTagSelection({
    availableTags,
    requestedTag: 'Unavailable',
    defaultTag: 'Unavailable',
    favoriteTags: ['Missing', 'Team']
  }), 'Team')
  assert.equal(resolveCostTagSelection({ availableTags, requestedTag: 'Unavailable' }), 'Environment')
  assert.equal(resolveCostTagSelection({ availableTags: [], requestedTag: 'Team' }), null)
})

test('serializes valid tag workspace URL state only for Tag Analysis', () => {
  assert.equal(normalizeCostTagCreatorView('all'), 'all')
  assert.equal(normalizeCostTagCreatorView('invalid'), 'people')

  assert.deepEqual(getCostTagWorkspaceQuery({
    chartTab: 'tags',
    selectedTag: 'aws:createdBy',
    tagView: 'all'
  }), {
    chartTab: 'tags',
    tag: 'aws:createdBy',
    tagView: 'all'
  })

  assert.deepEqual(getCostTagWorkspaceQuery({
    chartTab: 'smart',
    selectedTag: 'Project',
    tagView: 'people'
  }), {
    chartTab: 'smart',
    tag: undefined,
    tagView: undefined
  })
})
