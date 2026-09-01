import assert from 'node:assert/strict'
import test from 'node:test'
import { applyAccountFilters } from '../../app/utils/cost-filters'
import {
  accountMatchesScope,
  getCurrentMonthForecastRemainder,
  resolveCurrentMonthProjection
} from '../../app/utils/year-end-projection'

test('year-end projection uses displayed spend instead of hidden account costs', () => {
  const accountScope = new Set(['prod-account'])
  const projection = resolveCurrentMonthProjection({
    displayedCurrentSpend: 300,
    currentMonthData: {
      proforma: {
        accounts: [
          { accountId: 'prod-account', totalCost: 300 },
          { accountId: 'hidden-dev-account', totalCost: 1100 }
        ]
      }
    },
    mode: 'proforma',
    accountScope,
    remainderForecast: 50
  })

  assert.deepEqual(projection, { actual: 300, remainder: 50, projectedTotal: 350 })
  assert.equal(getCurrentMonthForecastRemainder(projection.projectedTotal, projection.actual), 50)
  assert.equal(accountMatchesScope({ awsStandardAccountID: 'prod-account' }, accountScope), true)
  assert.equal(accountMatchesScope({ accountId: 'hidden-dev-account' }, accountScope), false)
})

test('year-end projection can derive scoped actuals when displayed spend is unavailable', () => {
  const projection = resolveCurrentMonthProjection({
    currentMonthData: {
      accounts: [
        { accountId: 'included', totalCost: 125 },
        { accountId: 'excluded', totalCost: 875 }
      ]
    },
    mode: 'billable',
    accountScope: new Set(['included']),
    remainderForecast: 25
  })

  assert.deepEqual(projection, { actual: 125, remainder: 25, projectedTotal: 150 })
})

test('default account filters use explicit environment metadata, not request ID', () => {
  const filtered = applyAccountFilters([
    { accountId: 'prod', requestID: '100', enclaveStatus: 'Sustainment', environment: 'production' },
    { accountId: 'api-west', requestID: '10274', enclaveStatus: 'Sustainment', environment: 'production' },
    { accountId: 'dev', requestID: '100', enclaveStatus: 'Sustainment', environment: 'development' },
    { accountId: 'closed', requestID: '200', enclaveStatus: 'Decommissioned', environment: 'production' }
  ], {
    hideSavingsPlans: false,
    hideEnterpriseSupport: false,
    hideReservedInstances: false,
    hideDevAccounts: true,
    minCostThreshold: 0,
    currencyFormat: 'abbreviated',
    showDecommissioned: false,
    selectedTableColumns: null
  })

  assert.deepEqual(filtered.map(account => account.accountId), ['prod', 'api-west'])
})
