import type { Expression, ResultByTime } from '@aws-sdk/client-cost-explorer'
import type {
  AIUsageCostDriverResponse,
  AIUsageCostDriverRow,
  AIUsageEnvironment
} from '../../shared/types/ai-usage'
import type { AIUsageQueryInput } from './ai-usage-query'
import { resolveAIUsageDateRange } from './ai-usage-query'
import { getCostAndUsage, getCostAndUsageWithResources } from './cost-explorer'
import { resolveAIUsageScopes } from './ai-usage-scope'
import { getCacheManager } from './cache-manager'

const DAY_MS = 24 * 60 * 60 * 1000

function payerAccount(environment: AIUsageEnvironment, basis: 'billable' | 'proforma'): string | undefined {
  if (environment === 'govcloud') return undefined
  return basis === 'proforma'
    ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
    : process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
}

function costFilter(accountIds: string[], service: string, regions: string[]): Expression {
  const filters: Expression[] = [
    { Dimensions: { Key: 'LINKED_ACCOUNT', Values: accountIds, MatchOptions: ['EQUALS'] } },
    { Dimensions: { Key: 'SERVICE', Values: [service], MatchOptions: ['EQUALS'] } }
  ]
  if (regions.length) {
    filters.push({ Dimensions: { Key: 'REGION', Values: regions, MatchOptions: ['EQUALS'] } })
  }
  return { And: filters }
}

function sortedRows(values: Map<string, AIUsageCostDriverRow>): AIUsageCostDriverRow[] {
  return [...values.values()].sort((a, b) => b.cost - a.cost || a.label.localeCompare(b.label)).slice(0, 30)
}

export function summarizeAIUsageCostDriverPeriods(periods: ResultByTime[]): {
  groupedCost: number
  usageTypes: AIUsageCostDriverRow[]
  operations: AIUsageCostDriverRow[]
  combinations: AIUsageCostDriverRow[]
} {
  const usageTypes = new Map<string, AIUsageCostDriverRow>()
  const operations = new Map<string, AIUsageCostDriverRow>()
  const combinations = new Map<string, AIUsageCostDriverRow>()
  let groupedCost = 0
  for (const period of periods) {
    for (const group of period.Groups || []) {
      const usageType = group.Keys?.[0] || 'Unspecified usage type'
      const operation = group.Keys?.[1] || 'Unspecified operation'
      const cost = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount || '0') || 0
      groupedCost += cost
      const usage = usageTypes.get(usageType) || { key: usageType, label: usageType, cost: 0, usageType }
      usage.cost += cost
      usageTypes.set(usageType, usage)
      const operationRow = operations.get(operation) || { key: operation, label: operation, cost: 0, operation }
      operationRow.cost += cost
      operations.set(operation, operationRow)
      const key = `${usageType}|${operation}`
      const combination = combinations.get(key) || {
        key,
        label: `${usageType} · ${operation}`,
        usageType,
        operation,
        cost: 0
      }
      combination.cost += cost
      combinations.set(key, combination)
    }
  }
  return {
    groupedCost,
    usageTypes: sortedRows(usageTypes),
    operations: sortedRows(operations),
    combinations: sortedRows(combinations)
  }
}

function mergeRows(target: Map<string, AIUsageCostDriverRow>, rows: AIUsageCostDriverRow[]): void {
  for (const row of rows) {
    const existing = target.get(row.key)
    if (existing) existing.cost += row.cost
    else target.set(row.key, { ...row })
  }
}

export async function queryAIUsageCostDrivers(
  input: AIUsageQueryInput,
  service: string
): Promise<AIUsageCostDriverResponse> {
  const cache = getCacheManager()
  const cacheKey = `ai-usage:cost-drivers:${service}:${JSON.stringify(input)}`
  const cached = await cache.get<AIUsageCostDriverResponse>(cacheKey)
  if (cached) return cached

  const range = resolveAIUsageDateRange(input)
  const scopes = await resolveAIUsageScopes({
    environment: input.environment || 'all',
    accountIds: input.accountIds,
    linesOfBusiness: input.linesOfBusiness,
    departments: input.departments
  })
  const usageTypes = new Map<string, AIUsageCostDriverRow>()
  const operations = new Map<string, AIUsageCostDriverRow>()
  const combinations = new Map<string, AIUsageCostDriverRow>()
  const resources = new Map<string, number>()
  const resourceErrors: string[] = []
  let totalCost = 0
  let resourceQueries = 0
  let resourceSuccesses = 0

  for (const environment of ['commercial', 'govcloud'] as const) {
    if (input.environment && input.environment !== 'all' && input.environment !== environment) continue
    const accountIds = [...new Set(scopes.flatMap(scope => scope.members)
      .filter(member => member.environment === environment)
      .map(member => member.accountId))]
    if (accountIds.length === 0) continue
    const basis = environment === 'govcloud' ? 'billable' : input.costBasis || 'proforma'
    const filter = costFilter(accountIds, service, input.regions || [])
    const response = await getCostAndUsage({
      startDate: range.startDate,
      endDate: range.endDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [
        { type: 'DIMENSION', key: 'USAGE_TYPE' },
        { type: 'DIMENSION', key: 'OPERATION' }
      ],
      filter
    }, environment, payerAccount(environment, basis))
    totalCost += Number.parseFloat(response.total?.UnblendedCost?.Amount || '0') || 0

    const driverSummary = summarizeAIUsageCostDriverPeriods(response.resultsByTime || [])
    mergeRows(usageTypes, driverSummary.usageTypes)
    mergeRows(operations, driverSummary.operations)
    mergeRows(combinations, driverSummary.combinations)

    resourceQueries++
    const endTime = new Date(`${range.endDate}T00:00:00.000Z`).getTime()
    const resourceStart = new Date(Math.max(
      new Date(`${range.startDate}T00:00:00.000Z`).getTime(),
      endTime - 14 * DAY_MS
    )).toISOString().slice(0, 10)
    try {
      const resourceResponse = await getCostAndUsageWithResources({
        startDate: resourceStart,
        endDate: range.endDate,
        granularity: 'DAILY',
        metrics: ['UnblendedCost'],
        filter
      }, environment, payerAccount(environment, basis))
      resourceSuccesses++
      for (const period of resourceResponse.resultsByTime || []) {
        for (const group of period.Groups || []) {
          const resourceId = group.Keys?.[0]
          const cost = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount || '0') || 0
          if (resourceId && resourceId !== 'NoResourceId' && cost !== 0) {
            resources.set(resourceId, (resources.get(resourceId) || 0) + cost)
          }
        }
      }
    } catch (error) {
      resourceErrors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const result: AIUsageCostDriverResponse = {
    service,
    totalCost,
    usageTypes: sortedRows(usageTypes),
    operations: sortedRows(operations),
    combinations: sortedRows(combinations),
    resources: [...resources.entries()]
      .map(([resourceId, cost]) => ({ resourceId, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 30),
    resourceDataAvailable: resourceQueries > 0 && resourceSuccesses > 0,
    resourceDataMessage: resourceQueries > 0 && resourceSuccesses === 0
      ? 'Resource-level Cost Explorer data is not enabled or supported for this service and billing view.'
      : resourceErrors.length ? 'Resource coverage is partial for the selected environments.' : undefined
  }
  await cache.set(cacheKey, result, { ttl: 900, tags: ['ai-usage'] })
  return result
}
