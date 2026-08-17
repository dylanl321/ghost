import { buildCostFilter } from '../utils/cost-domain'
import { getCostAndUsage } from '../utils/cost-explorer'
import { normalizeCostDateRange, type ResolvedCostScope } from './cost-scope'

interface PeriodInput {
  startDate: string
  endDate: string
}

function totals(resultsByTime: any[]): Map<string, number> {
  const values = new Map<string, number>()
  for (const period of resultsByTime) {
    for (const group of period.Groups || []) {
      const key = group.Keys?.[0]
      if (key) values.set(key, (values.get(key) || 0) + Number(group.Metrics?.UnblendedCost?.Amount || 0))
    }
  }
  return values
}

export function costDeltas(current: Map<string, number>, comparison: Map<string, number>) {
  return [...new Set([...current.keys(), ...comparison.keys()])].map(key => {
    const currentValue = current.get(key) || 0
    const comparisonValue = comparison.get(key) || 0
    return {
      key,
      current: currentValue,
      comparison: comparisonValue,
      delta: currentValue - comparisonValue,
      percentChange: comparisonValue === 0 ? currentValue === 0 ? 0 : null : ((currentValue - comparisonValue) / comparisonValue) * 100
    }
  }).sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta) || left.key.localeCompare(right.key))
}

async function loadPeriod(scope: ResolvedCostScope, period: PeriodInput) {
  const base = {
    startDate: period.startDate,
    endDate: period.endDate,
    granularity: 'MONTHLY' as const,
    metrics: ['UnblendedCost'],
    filter: buildCostFilter({ accountIds: scope.linkedAccountIds.length ? scope.linkedAccountIds : undefined })
  }
  const [services, accounts] = await Promise.all([
    getCostAndUsage({ ...base, groupBy: [{ type: 'DIMENSION' as const, key: 'SERVICE' }] }, scope.environment, scope.payerAccountId),
    getCostAndUsage({ ...base, groupBy: [{ type: 'DIMENSION' as const, key: 'LINKED_ACCOUNT' }] }, scope.environment, scope.payerAccountId)
  ])
  return {
    period,
    total: services.dataset.reconciliation.authoritativeTotal,
    reconciliation: services.dataset.reconciliation,
    services: totals(services.resultsByTime),
    accounts: totals(accounts.resultsByTime)
  }
}

export async function compareMcpCosts(input: {
  scope: ResolvedCostScope
  current: { start_date: string; end_date: string }
  comparison: { start_date: string; end_date: string }
}) {
  const currentRange = normalizeCostDateRange({ ...input.current, maximumDays: 365 })
  const comparisonRange = normalizeCostDateRange({ ...input.comparison, maximumDays: 365 })
  const [current, comparison] = await Promise.all([
    loadPeriod(input.scope, { startDate: currentRange.startDate, endDate: currentRange.endDate }),
    loadPeriod(input.scope, { startDate: comparisonRange.startDate, endDate: comparisonRange.endDate })
  ])
  const currentDays = (Date.parse(current.period.endDate) - Date.parse(current.period.startDate)) / 86_400_000
  const comparisonDays = (Date.parse(comparison.period.endDate) - Date.parse(comparison.period.startDate)) / 86_400_000
  return {
    current: { period: current.period, total: current.total, reconciliation: current.reconciliation },
    comparison: { period: comparison.period, total: comparison.total, reconciliation: comparison.reconciliation },
    totalDelta: current.total - comparison.total,
    totalPercentChange: comparison.total === 0 ? current.total === 0 ? 0 : null : ((current.total - comparison.total) / comparison.total) * 100,
    serviceDeltas: costDeltas(current.services, comparison.services),
    accountDeltas: costDeltas(current.accounts, comparison.accounts),
    warnings: currentDays === comparisonDays ? [] : [`Periods have different lengths (${currentDays} and ${comparisonDays} days).`]
  }
}
