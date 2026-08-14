import assert from 'node:assert/strict'
import test from 'node:test'
import { buildReconciliation, mergeCostExplorerPeriods } from '../../server/utils/cost-domain'
import { getRelativeDateRange } from '../../server/utils/date-helpers'
import { getComparablePeriod } from '../../server/utils/date-periods'
import { getPeriodBudget } from '../../shared/utils/budget-utils'

test('merges paginated groups by full period and preserves signed credits', () => {
  const periods = mergeCostExplorerPeriods([
    [{
      TimePeriod: { Start: '2026-01-01', End: '2026-02-01' },
      Total: { UnblendedCost: { Amount: '90', Unit: 'USD' } },
      Groups: [{ Keys: ['a'], Metrics: { UnblendedCost: { Amount: '100', Unit: 'USD' } } }]
    }],
    [
      {
        TimePeriod: { Start: '2026-01-01', End: '2026-02-01' },
        Groups: [{ Keys: ['credit'], Metrics: { UnblendedCost: { Amount: '-10', Unit: 'USD' } } }]
      },
      {
        TimePeriod: { Start: '2026-02-01', End: '2026-03-01' },
        Total: { UnblendedCost: { Amount: '50', Unit: 'USD' } },
        Groups: []
      }
    ]
  ])

  assert.equal(periods.length, 2)
  assert.equal(periods[0]?.Groups?.length, 2)
  assert.equal(periods[0]?.Groups?.[1]?.Metrics?.UnblendedCost?.Amount, '-10')
  assert.deepEqual(buildReconciliation(periods), {
    authoritativeTotal: 140,
    groupedTotal: 90,
    delta: 50,
    reconciled: false
  })
})

test('combines a logical group split across pagination pages once', () => {
  const periods = mergeCostExplorerPeriods([
    [{
      TimePeriod: { Start: '2026-01-01', End: '2026-02-01' },
      Groups: [{ Keys: ['a'], Metrics: { UnblendedCost: { Amount: '25', Unit: 'USD' } } }]
    }],
    [{
      TimePeriod: { Start: '2026-01-01', End: '2026-02-01' },
      Groups: [{ Keys: ['a'], Metrics: { UnblendedCost: { Amount: '35', Unit: 'USD' } } }]
    }]
  ])

  assert.equal(periods[0]?.Groups?.length, 1)
  assert.equal(periods[0]?.Groups?.[0]?.Metrics?.UnblendedCost?.Amount, '60')
})

test('returns an explicit empty current-month range on day one UTC', () => {
  const result = getRelativeDateRange('thisMonth', new Date('2026-08-01T12:00:00.000Z'))
  assert.deepEqual(result, {
    startDate: '2026-08-01',
    endDate: '2026-08-01',
    description: 'This month',
    empty: true
  })
})

test('uses leap-year and duration-aligned prior-month UTC windows', () => {
  const leapMonth = getRelativeDateRange('lastMonth', new Date('2024-03-01T03:00:00.000Z'))
  assert.equal(leapMonth.startDate, '2024-02-01')
  assert.equal(leapMonth.endDate, '2024-03-01')

  const priorMtd = getComparablePeriod('current-month', new Date('2026-08-05T18:00:00.000Z'))
  assert.equal(priorMtd.startDate.toISOString().slice(0, 10), '2026-07-01')
  assert.equal(priorMtd.endDate.toISOString().slice(0, 10), '2026-07-05')
  assert.equal(priorMtd.daysInPeriod, 4)
})

test('sums PEP months and prorates the current month for pace', () => {
  const source = {
    pepBudget2026Monthly: JSON.stringify({ Jan: 100, Feb: 200, Mar: 310 }),
    estimatedMonthlyCharge: '999'
  }
  const budget = getPeriodBudget(source, '2026-01-01', '2026-03-15', {
    referenceDate: new Date('2026-03-15T12:00:00.000Z'),
    includeFullCurrentMonth: true
  })

  assert.equal(budget.periodBudget, 610)
  assert.equal(budget.paceToDateBudget, 440)
  assert.equal(budget.source, 'pep-monthly')
})

test('does not apply a current monthly estimate to a historical period', () => {
  const budget = getPeriodBudget(
    { estimatedMonthlyCharge: '500' },
    '2026-06-01',
    '2026-07-01',
    { referenceDate: new Date('2026-08-05T12:00:00.000Z') }
  )
  assert.deepEqual(budget, {
    periodBudget: null,
    paceToDateBudget: null,
    source: 'unavailable'
  })
})
