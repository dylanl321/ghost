import assert from 'node:assert/strict'
import test from 'node:test'
import { summarizeYear, type YearChartData } from '../../app/utils/year-end-summary'

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const nulls = (n: number) => Array<number | null>(n).fill(null)

// November in progress: 10 complete months, 20 spent so far, 550 projected for the month
const current: YearChartData = {
  year: 2026,
  months,
  series: [
    { name: 'Actual', data: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 20, null] },
    { name: 'AWS Projection', data: [...nulls(10), 110, 120] }
  ],
  confidenceBands: { lower: [...nulls(11), 100], upper: [...nulls(11), 140] },
  budget: { monthlyArray: Array(12).fill(105), monthly: 105, annual: 1260, isPepData: false },
  metadata: { currentMonth: 11 }
}

test('the month in progress splits into actual so far and the rest of the projection', () => {
  const s = summarizeYear(current, false)
  const nov = s.months[10]!
  assert.equal(s.currentIndex, 10)
  assert.equal(nov.kind, 'current')
  assert.equal(nov.actual, 20)
  assert.equal(nov.forecastPart, 90)
  assert.equal(nov.total, 110)
  assert.equal(s.months[11]!.kind, 'forecast')
  assert.equal(s.months[11]!.actual, null)
})

test('year figures add actuals to projections and compare with the budget', () => {
  const s = summarizeYear(current, false)
  assert.equal(s.actualToDate, 1020)
  assert.equal(s.projectedTotal, 1000 + 110 + 120)
  assert.equal(s.annualBudget, 1260)
  assert.equal(s.gap, -30)
  // Nov (110) and Dec (120) are over a 105 budget; the 100 months are under
  assert.equal(s.overMonths, 2)
  assert.equal(s.hasConfidence, true)
  assert.equal(s.budgetLabel, 'GDMS forecasted costs')
})

test('next year reads its only series as projections and notes a carried-forward budget', () => {
  const next: YearChartData = {
    year: 2027,
    months,
    series: [{ name: 'AWS Projection', data: [130, 130, ...nulls(10)] }],
    budget: { monthlyArray: Array(12).fill(105), annual: 1260, isPepData: true, carriedForwardAccounts: 3, carriedForwardFrom: 2026 },
    metadata: {}
  }
  const s = summarizeYear(next, true)
  assert.equal(s.currentIndex, -1)
  assert.equal(s.months[0]!.kind, 'forecast')
  assert.equal(s.months[5]!.kind, 'empty')
  assert.equal(s.projectedTotal, 260)
  assert.equal(s.budgetLabel, 'PEP budget')
  assert.equal(s.budgetNote, '2027 PEP budget not supplied for 3 accounts; using the December 2026 amount')
})

test('without a budget there are no gaps', () => {
  const s = summarizeYear({ ...current, budget: { annual: 0 } }, false)
  assert.equal(s.hasBudget, false)
  assert.equal(s.gap, 0)
  assert.ok(s.months.every(m => m.gap === null))
})
