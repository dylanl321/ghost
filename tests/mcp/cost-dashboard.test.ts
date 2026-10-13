import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMcpCostDashboard } from '../../server/mcp/cost-dashboard'

test('builds explainable year-end projections and proportional account estimates', () => {
  const dashboard = buildMcpCostDashboard({
    mode: 'proforma',
    environment: 'commercial',
    period: { startDate: '2026-08-01', endDate: '2026-08-14', description: 'This month' },
    accountIdentifiers: ['production', 'analytics'],
    resolvedAccountIds: ['111', '222'],
    accounts: [
      { accountId: '111', accountName: 'Production', periodSpend: 120, currentMonthSpend: 120, completedMonthsSpend: 1000, periodBudget: 200, paceToDateBudget: 90, budgetSource: 'pep-monthly', annualBudget: 2400 },
      { accountId: '222', accountName: 'Analytics', periodSpend: 30, currentMonthSpend: 30, completedMonthsSpend: 200, periodBudget: 50, paceToDateBudget: 25, budgetSource: 'estimated-monthly', annualBudget: 600 }
    ],
    services: [{ service: 'Amazon EC2', spend: 100 }, { service: 'Amazon S3', spend: 50 }],
    previousMonthMtd: 100,
    previousMonthFull: 180,
    projectionAvailability: 'available',
    currentMonthRemainderForecast: 150,
    futureMonthsForecast: 900,
    dayOfMonth: 10
  })

  assert.equal(dashboard.summary.periodSpend, 150)
  assert.equal(dashboard.summary.dailyBurnRate, 15)
  assert.equal(dashboard.projections.endOfMonth.projectedTotal, 300)
  assert.equal(dashboard.projections.yearEnd.projectedTotal, 2400)
  assert.equal(dashboard.projections.yearEnd.varianceToAnnualBudget, -600)
  assert.equal(dashboard.accounts[0]?.forecastAllocation.currentMonthSpendShare, 0.8)
  assert.equal(dashboard.accounts[0]?.forecastAllocation.projectedMonthEnd, 240)
  assert.equal(dashboard.accounts[0]?.forecastAllocation.projectedYearEnd, 1960)
  assert.equal(dashboard.accounts[1]?.forecastAllocation.projectedYearEnd, 440)
})

test('does not fabricate projection values when AWS forecasts are unavailable', () => {
  const dashboard = buildMcpCostDashboard({
    mode: 'billable',
    environment: 'commercial',
    period: { startDate: '2026-07-01', endDate: '2026-08-01', description: 'Last month' },
    accountIdentifiers: [],
    resolvedAccountIds: [],
    accounts: [{ accountId: '111', accountName: 'Production', periodSpend: 50, periodBudget: null, paceToDateBudget: null, budgetSource: 'unavailable', annualBudget: 0 }],
    services: [],
    previousMonthMtd: null,
    previousMonthFull: null,
    projectionAvailability: 'not_applicable',
    projectionReason: 'Forecasts are unavailable for historical dashboard periods.',
    dayOfMonth: 1
  })

  assert.equal(dashboard.projections.availability, 'not_applicable')
  assert.equal(dashboard.projections.endOfMonth.projectedTotal, null)
  assert.equal(dashboard.projections.yearEnd.projectedTotal, null)
  assert.equal(dashboard.accounts[0]?.forecastAllocation.projectedYearEnd, null)
})
