import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getAnnualBudgetArray,
  getBudgetSource,
  getMonthlyBudget,
  getPeriodBudget,
  isBudgetCarriedForward
} from '../../shared/utils/budget-utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const pep = (base: number) => JSON.stringify(Object.fromEntries(MONTHS.map((m, i) => [m, base + i])))
const utc = (y: number, m: number, d = 1) => new Date(Date.UTC(y, m - 1, d))

const only2026 = { pepBudget2026Monthly: pep(100), estimatedMonthlyCharge: '999' } // Dec 2026 = 111
const with2027 = { ...only2026, pepBudget2027Monthly: pep(500) } // Jan 2027 = 500

test('2027 PEP budget is used when supplied', () => {
  assert.equal(getMonthlyBudget(with2027, utc(2027, 1, 15)), 500)
  assert.equal(getMonthlyBudget(with2027, utc(2026, 12, 15)), 111)
  assert.equal(getBudgetSource(with2027, utc(2027, 3)), 'pep')
  assert.equal(isBudgetCarriedForward(with2027, utc(2027, 3)), false)
  assert.deepEqual(getAnnualBudgetArray(with2027, 2027).monthlyArray.slice(0, 2), [500, 501])
})

test('without 2027 data, December 2026 carries forward and is flagged', () => {
  assert.equal(getMonthlyBudget(only2026, utc(2027, 1, 15)), 111)
  assert.equal(getMonthlyBudget(only2026, utc(2028, 6, 15)), 111)
  assert.equal(getBudgetSource(only2026, utc(2027, 1)), 'pep-carryforward')
  assert.equal(isBudgetCarriedForward(only2026, utc(2027, 1)), true)
  assert.equal(isBudgetCarriedForward(only2026, utc(2026, 10)), false)
  const annual = getAnnualBudgetArray(only2026, 2027)
  assert.equal(annual.carriedForwardFrom, 2026)
  assert.deepEqual(annual.monthlyArray, Array(12).fill(111))
})

test('period budgets span the year boundary', () => {
  // Dec 2026 (111) + Jan 2027: 500 supplied, or 111 carried forward
  const supplied = getPeriodBudget(with2027, '2026-12-01', '2027-02-01', { referenceDate: utc(2027, 1, 20) })
  assert.equal(supplied.periodBudget, 611)
  assert.equal(supplied.source, 'pep-monthly')

  const carried = getPeriodBudget(only2026, '2026-12-01', '2027-02-01', { referenceDate: utc(2027, 1, 20) })
  assert.equal(carried.periodBudget, 222)
  assert.equal(carried.source, 'pep-carryforward')
  assert.equal(carried.carriedForwardFrom, 2026)
})

test('PEP budgets are not backfilled before the first PEP year', () => {
  const result = getPeriodBudget(only2026, '2025-01-01', '2025-02-01', { referenceDate: utc(2026, 10, 30) })
  assert.equal(result.source, 'unavailable')
})
