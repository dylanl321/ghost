import { defineEventHandler, getQuery } from 'h3'
import type { CostDashboardAccount, CostDashboardResponse, CostSource } from '../../../shared/types/cost-domain'
import { getPeriodBudget } from '../../../shared/utils/budget-utils'
import { registerEndpoint } from '../../plugins/swagger'
import { getAccountIdsFromCriteria, parseAndValidateAccountFilters } from '../../utils/account-filters'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getAccountScopeCacheKey } from '../../utils/cache-keys'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { buildCostFilter } from '../../utils/cost-domain'
import { getCostAndUsage } from '../../utils/cost-explorer'
import { getComparablePeriod, dateRangeToISO } from '../../utils/date-periods'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'

registerEndpoint('/api/costs/dashboard', 'GET', {
  summary: 'Canonical cost dashboard data',
  description: 'Authoritative actuals, service/account breakdowns, aligned comparisons, and period budgets. Forecasts are deferred.',
  tags: ['Costs'],
  responses: {
    200: { description: 'Canonical cost dashboard response' },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

function aggregateGroups(resultsByTime: any[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const period of resultsByTime || []) {
    for (const group of period.Groups || []) {
      const key = group.Keys?.[0]
      if (!key) continue
      const value = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount || '0') || 0
      totals.set(key, (totals.get(key) || 0) + value)
    }
  }
  return totals
}

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  let dateRange: ReturnType<typeof validateDateParams>
  try {
    dateRange = validateDateParams({
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      period: query.period as RelativePeriod
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }

  const mode: CostSource = query.mode === 'proforma' || query.proforma === 'true' ? 'proforma' : 'billable'
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  if (mode === 'proforma' && environment !== 'commercial') {
    return errors.badRequest(event, 'Proforma data is only available in the commercial environment')
  }
  const targetAccountId = mode === 'proforma'
    ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
    : environment === 'commercial'
      ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
      : undefined

  const { criteria, errors: filterErrors } = parseAndValidateAccountFilters(query)
  if (filterErrors.length) return errors.badRequest(event, filterErrors.join('; '))
  const accountIds = criteria.accountIds || criteria.linesOfBusiness || criteria.departments
    ? await getAccountIdsFromCriteria(criteria)
    : undefined
  if (accountIds && accountIds.length === 0) return errors.notFound(event, 'No accounts match the requested scope')
  const filter = buildCostFilter({ accountIds })
  const baseParams = {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: 'MONTHLY' as const,
    metrics: ['UnblendedCost'],
    filter
  }
  const cacheKey = `costs:dashboard:${JSON.stringify({
    source: mode,
    metric: 'UnblendedCost',
    dates: [dateRange.startDate, dateRange.endDate],
    granularity: 'MONTHLY',
    accountScope: getAccountScopeCacheKey(accountIds)
  })}`

  const data = await costCache.getOrSet(cacheKey, async (): Promise<CostDashboardResponse> => {
    const [accountCosts, serviceCosts, accountMetadata] = await Promise.all([
      getCostAndUsage({
        ...baseParams,
        groupBy: [{ type: 'DIMENSION' as const, key: 'LINKED_ACCOUNT' }]
      }, environment, targetAccountId),
      getCostAndUsage({
        ...baseParams,
        groupBy: [{ type: 'DIMENSION' as const, key: 'SERVICE' }]
      }, environment, targetAccountId),
      getAllAccountsUnified(true)
    ])
    const accountSpend = aggregateGroups(accountCosts.resultsByTime)
    const serviceSpend = aggregateGroups(serviceCosts.resultsByTime)
    const metadata = new Map<string, any>()
    for (const account of accountMetadata) {
      for (const id of [account.accountId, account.awsStandardAccountID, account.awsGovCloudAccountID]) {
        if (id) metadata.set(id, account)
      }
    }
    const scopedIds = new Set([...accountSpend.keys(), ...(accountIds || [])])
    const includeFullCurrentMonth = ['thisMonth', 'thisQuarter', 'thisYear', 'ytd'].includes(String(query.period || ''))
    const accounts: CostDashboardAccount[] = [...scopedIds].map((accountId): CostDashboardAccount => {
      const account = metadata.get(accountId)
      const budget = getPeriodBudget(account, dateRange.startDate, dateRange.endDate, { includeFullCurrentMonth })
      const actualSpend = accountSpend.get(accountId) || 0
      const pace = budget.paceToDateBudget
      const variance = pace === null ? null : actualSpend - pace
      return {
        accountId,
        accountName: account?.name || account?.accountName,
        actualSpend,
        periodBudget: budget.periodBudget,
        paceToDateBudget: pace,
        projectedSpend: null,
        variance,
        variancePercent: pace && variance !== null ? (variance / pace) * 100 : null,
        healthBasis: pace === null ? 'unavailable' : 'pace',
        budgetSource: budget.source
      }
    }).sort((a, b) => b.actualSpend - a.actualSpend)

    let previousMonthMtd: number | null = null
    let previousMonthFull: number | null = null
    if (query.period === 'thisMonth') {
      const aligned = dateRangeToISO(getComparablePeriod('current-month'))
      const currentMonthStart = dateRange.startDate
      const previousStart = aligned.startDate
      const comparisonParams = (startDate: string, endDate: string) => getCostAndUsage({
        startDate,
        endDate,
        granularity: 'MONTHLY',
        metrics: ['UnblendedCost'],
        filter
      }, environment, targetAccountId)
      const [alignedData, fullData] = await Promise.all([
        comparisonParams(aligned.startDate, aligned.endDate),
        comparisonParams(previousStart, currentMonthStart)
      ])
      previousMonthMtd = alignedData.dataset.reconciliation.authoritativeTotal
      previousMonthFull = fullData.dataset.reconciliation.authoritativeTotal
    }

    const actualSpend = accountCosts.dataset.reconciliation.authoritativeTotal
    const periodBudget = accounts.reduce((sum, account) => sum + (account.periodBudget || 0), 0)
    const paceToDateBudget = accounts.reduce((sum, account) => sum + (account.paceToDateBudget || 0), 0)
    const budgetAvailable = accounts.some(account => account.periodBudget !== null)
    const paceAvailable = accounts.some(account => account.paceToDateBudget !== null)
    const variance = paceAvailable ? actualSpend - paceToDateBudget : null
    return {
      mode,
      actuals: accountCosts.dataset,
      accounts,
      services: [...serviceSpend].map(([service, cost]) => ({ service, cost })).sort((a, b) => b.cost - a.cost),
      comparisons: {
        currentMtd: actualSpend,
        previousMonthMtd,
        previousMonthFull,
        percentChange: previousMonthMtd === null || previousMonthMtd === 0
          ? null
          : ((actualSpend - previousMonthMtd) / previousMonthMtd) * 100
      },
      budget: {
        periodBudget: budgetAvailable ? periodBudget : null,
        paceToDateBudget: paceAvailable ? paceToDateBudget : null,
        actualSpend,
        projectedSpend: null,
        variance,
        variancePercent: paceToDateBudget > 0 && variance !== null ? (variance / paceToDateBudget) * 100 : null,
        healthBasis: paceAvailable ? 'pace' : 'unavailable',
        budgetSource: accounts.some(account => account.budgetSource === 'pep-monthly')
          ? 'pep-monthly'
          : accounts.some(account => account.budgetSource === 'estimated-monthly')
            ? 'estimated-monthly'
            : 'unavailable',
        accountsWithBudget: accounts.filter(account => account.periodBudget !== null).length
      },
      forecast: null,
      warnings: ['Forecasts are intentionally deferred from the canonical dashboard response.']
    }
  }, { ttl: 900, tags: [CacheTags.COSTS, mode, 'dashboard'] })

  return sendSuccess(event, data, {
    dateRange,
    billingDomain: mode,
    metric: 'UnblendedCost'
  })
}))
