import type {
  AIUsageBreakdownRow,
  AIUsageCost,
  AIUsageCostBasis,
  AIUsageDataQuality,
  AIUsageEnvironmentFilter,
  AIUsageFact,
  AIUsageFilters,
  AIUsageGroupBy,
  AIUsageMetrics,
  AIUsageOptions,
  AIUsageOverviewResponse,
  AIUsageProvider,
  AIUsageSummary,
  AIUsageTrendPoint
} from '../../shared/types/ai-usage'
import { emptyAIUsageMetrics } from '../../shared/types/ai-usage'
import { resolveAIUsageScopes, type AIUsageAccountScope } from './ai-usage-scope'
import { getAIUsageCollectorState, loadAIUsageFacts } from './ai-usage-storage'
import { getCacheManager } from './cache-manager'

const DAY_MS = 24 * 60 * 60 * 1000

export interface AIUsageQueryInput {
  period?: string
  startDate?: string
  endDate?: string
  environment?: AIUsageEnvironmentFilter
  accountIds?: string[]
  linesOfBusiness?: string[]
  departments?: string[]
  providers?: AIUsageProvider[]
  services?: string[]
  projects?: string[]
  models?: string[]
  regions?: string[]
  costBasis?: AIUsageCostBasis
  groupBy?: AIUsageGroupBy
}

interface DateRange {
  startDate: string
  endDate: string
  label: string
}

function utcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export function resolveAIUsageDateRange(input: Pick<AIUsageQueryInput, 'period' | 'startDate' | 'endDate'>, now = new Date()): DateRange {
  if (input.startDate || input.endDate) {
    if (!input.startDate || !input.endDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.endDate)) {
      throw new Error('Both startDate and endDate are required in YYYY-MM-DD format')
    }
    if (input.startDate >= input.endDate) throw new Error('startDate must be before endDate')
    if ((new Date(input.endDate).getTime() - new Date(input.startDate).getTime()) / DAY_MS > 400) {
      throw new Error('AI usage date ranges cannot exceed 400 days')
    }
    return { startDate: input.startDate, endDate: input.endDate, label: 'Custom range' }
  }

  const today = utcDay(now)
  const end = new Date(today.getTime() + DAY_MS)
  const year = today.getUTCFullYear()
  const month = today.getUTCMonth()
  const period = input.period || 'last30days'
  const ranges: Record<string, { start: Date; label: string }> = {
    last7days: { start: new Date(today.getTime() - 6 * DAY_MS), label: 'Last 7 days' },
    last30days: { start: new Date(today.getTime() - 29 * DAY_MS), label: 'Last 30 days' },
    last90days: { start: new Date(today.getTime() - 89 * DAY_MS), label: 'Last 90 days' },
    thisMonth: { start: new Date(Date.UTC(year, month, 1)), label: 'This month' },
    thisQuarter: { start: new Date(Date.UTC(year, Math.floor(month / 3) * 3, 1)), label: 'This quarter' },
    ytd: { start: new Date(Date.UTC(year, 0, 1)), label: 'Year-to-date' },
    last12months: { start: new Date(Date.UTC(year, month - 11, 1)), label: 'Last 12 months' }
  }
  const selected = ranges[period]
  if (!selected) throw new Error(`Unsupported AI usage period: ${period}`)
  return { startDate: iso(selected.start), endDate: iso(end), label: selected.label }
}

function previousRange(range: DateRange): DateRange {
  const start = new Date(`${range.startDate}T00:00:00.000Z`)
  const end = new Date(`${range.endDate}T00:00:00.000Z`)
  const duration = end.getTime() - start.getTime()
  const previousStart = new Date(start.getTime() - duration)
  return { startDate: iso(previousStart), endDate: range.startDate, label: 'Previous period' }
}

function selectedCostBasis(fact: AIUsageFact, requested: AIUsageCostBasis): boolean {
  if (!fact.costBasis) return true
  return fact.environment === 'govcloud' ? fact.costBasis === 'billable' : fact.costBasis === requested
}

function matches(value: string | undefined, filters: string[]): boolean {
  return filters.length === 0 || Boolean(value && filters.includes(value))
}

function applyFilters(facts: AIUsageFact[], filters: AIUsageFilters): AIUsageFact[] {
  return facts.filter(fact =>
    selectedCostBasis(fact, filters.costBasis) &&
    matches(fact.provider, filters.providers) &&
    matches(fact.service, filters.services) &&
    matches(fact.projectId, filters.projects) &&
    matches(fact.modelId, filters.models) &&
    matches(fact.region, filters.regions))
}

function addMetrics(target: AIUsageMetrics, source: AIUsageMetrics): void {
  target.invocations += source.invocations || 0
  target.inputTokens += source.inputTokens || 0
  target.outputTokens += source.outputTokens || 0
  target.cacheReadTokens += source.cacheReadTokens || 0
  target.cacheWriteTokens += source.cacheWriteTokens || 0
  target.clientErrors += source.clientErrors || 0
  target.serverErrors += source.serverErrors || 0
  target.throttles += source.throttles || 0
  target.outputImages += source.outputImages || 0
  if (source.latencyMs !== null && source.latencyMs !== undefined && source.latencySamples > 0) {
    const currentTotal = (target.latencyMs || 0) * target.latencySamples
    const sourceTotal = source.latencyMs * source.latencySamples
    target.latencySamples += source.latencySamples
    target.latencyMs = (currentTotal + sourceTotal) / target.latencySamples
  }
}

function costThroughByEnvironment(facts: AIUsageFact[]): Map<string, string> {
  const through = new Map<string, string>()
  for (const fact of facts) {
    if (!fact.costBasis || !fact.dataThrough) continue
    const key = `${fact.environment}#${fact.costBasis}`
    if (!through.get(key) || fact.dataThrough > through.get(key)!) through.set(key, fact.dataThrough)
  }
  return through
}

function effectiveEstimatedCost(fact: AIUsageFact, through: Map<string, string>, basis: AIUsageCostBasis): number {
  if (!fact.estimatedCost) return 0
  const actualBasis = fact.environment === 'govcloud' ? 'billable' : basis
  const actualThrough = through.get(`${fact.environment}#${actualBasis}`)
  return !actualThrough || fact.bucket.slice(0, 10) > actualThrough ? fact.estimatedCost : 0
}

function costForFacts(facts: AIUsageFact[], through: Map<string, string>, basis: AIUsageCostBasis): AIUsageCost {
  const actual = facts.reduce((sum, fact) => sum + (fact.actualCost || 0), 0)
  const estimated = facts.reduce((sum, fact) => sum + effectiveEstimatedCost(fact, through, basis), 0)
  const pricedTokens = facts.reduce((sum, fact) => sum + (fact.pricedTokens || 0), 0)
  const totalTokens = facts.reduce((sum, fact) => sum + (fact.metrics.inputTokens || 0) + (fact.metrics.outputTokens || 0) + (fact.metrics.cacheReadTokens || 0) + (fact.metrics.cacheWriteTokens || 0), 0)
  return {
    actual,
    estimated,
    estimateCoveragePercent: totalTokens ? (pricedTokens / totalTokens) * 100 : null,
    currency: 'USD',
    basis
  }
}

function summaryForFacts(facts: AIUsageFact[], through: Map<string, string>, basis: AIUsageCostBasis): AIUsageSummary {
  const metrics = emptyAIUsageMetrics()
  facts.forEach(fact => addMetrics(metrics, fact.metrics))
  const activeFacts = facts.filter(fact => fact.metrics.invocations > 0 || fact.actualCost > 0)
  return {
    activeEnclaves: new Set(activeFacts.map(fact => fact.enclaveId)).size,
    activeAccounts: new Set(activeFacts.map(fact => `${fact.environment}#${fact.accountId}`)).size,
    activeProjects: new Set(activeFacts.filter(fact => fact.projectId).map(fact => `${fact.accountId}#${fact.projectId}`)).size,
    activeModels: new Set(activeFacts.filter(fact => fact.modelId).map(fact => fact.modelId)).size,
    metrics,
    cost: costForFacts(facts, through, basis),
    growthPercent: null
  }
}

function groupIdentity(fact: AIUsageFact, groupBy: AIUsageGroupBy): { key: string; label: string } {
  switch (groupBy) {
    case 'account': return { key: `${fact.environment}#${fact.accountId}`, label: fact.accountId }
    case 'environment': return { key: fact.environment, label: fact.environment === 'commercial' ? 'Commercial' : 'GovCloud' }
    case 'provider': return { key: fact.provider, label: fact.provider }
    case 'service': return { key: fact.service, label: fact.service }
    case 'project': return { key: fact.projectId || 'unattributed', label: fact.projectId || 'Unattributed' }
    case 'model': return { key: fact.modelId || 'unattributed', label: fact.modelId || 'Unattributed' }
    case 'region': return { key: fact.region || 'global', label: fact.region || 'Global' }
    case 'day': return { key: fact.bucket.slice(0, 10), label: fact.bucket.slice(0, 10) }
    default: return { key: fact.enclaveId, label: fact.enclaveName }
  }
}

function breakdownForFacts(
  facts: AIUsageFact[],
  groupBy: AIUsageGroupBy,
  through: Map<string, string>,
  basis: AIUsageCostBasis
): AIUsageBreakdownRow[] {
  const groups = new Map<string, { identity: ReturnType<typeof groupIdentity>; facts: AIUsageFact[] }>()
  for (const fact of facts) {
    const identity = groupIdentity(fact, groupBy)
    if (!groups.has(identity.key)) groups.set(identity.key, { identity, facts: [] })
    groups.get(identity.key)!.facts.push(fact)
  }
  return [...groups.values()].map(group => {
    const metrics = emptyAIUsageMetrics()
    group.facts.forEach(fact => addMetrics(metrics, fact.metrics))
    const first = group.facts[0]!
    return {
      key: group.identity.key,
      label: group.identity.label,
      environment: groupBy === 'environment' || groupBy === 'account' ? first.environment : undefined,
      enclaveId: groupBy === 'enclave' ? first.enclaveId : undefined,
      enclaveName: groupBy === 'enclave' ? first.enclaveName : undefined,
      accountId: groupBy === 'account' ? first.accountId : undefined,
      provider: groupBy === 'provider' ? first.provider : undefined,
      service: groupBy === 'service' ? first.service : undefined,
      projectId: groupBy === 'project' ? first.projectId : undefined,
      modelId: groupBy === 'model' ? first.modelId : undefined,
      region: groupBy === 'region' ? first.region : undefined,
      metrics,
      cost: costForFacts(group.facts, through, basis),
      active: group.facts.some(fact => fact.metrics.invocations > 0 || fact.actualCost > 0),
      lastSeen: group.facts.map(fact => fact.bucket).sort().at(-1)
    }
  }).sort((a, b) => (b.metrics.invocations + b.cost.actual) - (a.metrics.invocations + a.cost.actual))
}

function trendForFacts(facts: AIUsageFact[], through: Map<string, string>, basis: AIUsageCostBasis): AIUsageTrendPoint[] {
  const byDay = new Map<string, AIUsageFact[]>()
  for (const fact of facts) {
    const date = fact.bucket.slice(0, 10)
    if (!byDay.has(date)) byDay.set(date, [])
    byDay.get(date)!.push(fact)
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, dayFacts]) => {
    const metrics = emptyAIUsageMetrics()
    dayFacts.forEach(fact => addMetrics(metrics, fact.metrics))
    const cost = costForFacts(dayFacts, through, basis)
    return {
      date,
      activeEnclaves: new Set(dayFacts.filter(fact => fact.metrics.invocations > 0 || fact.actualCost > 0).map(fact => fact.enclaveId)).size,
      invocations: metrics.invocations,
      inputTokens: metrics.inputTokens,
      outputTokens: metrics.outputTokens,
      actualCost: cost.actual,
      estimatedCost: cost.estimated
    }
  })
}

function optionsForFacts(facts: AIUsageFact[]): AIUsageOptions {
  const values = (selector: (fact: AIUsageFact) => string | undefined) =>
    [...new Set(facts.map(selector).filter((value): value is string => Boolean(value)))].sort()
  return {
    providers: values(fact => fact.provider) as AIUsageProvider[],
    services: values(fact => fact.service),
    projects: values(fact => fact.projectId),
    models: values(fact => fact.modelId),
    regions: values(fact => fact.region),
    linesOfBusiness: values(fact => fact.lineOfBusiness),
    departments: values(fact => fact.department)
  }
}

function partitionsForScopes(scopes: AIUsageAccountScope[]): string[] {
  return scopes.flatMap(scope => scope.members.map(member => `${member.environment.toUpperCase()}#${member.accountId}`))
}

async function loadRange(scopes: AIUsageAccountScope[], range: DateRange): Promise<AIUsageFact[]> {
  const partitions = partitionsForScopes(scopes)
  const daily = await loadAIUsageFacts(partitions, 'day', range.startDate, range.endDate)
  return daily.filter(fact => fact.bucket >= range.startDate && fact.bucket < range.endDate)
}

export async function queryAIUsage(input: AIUsageQueryInput): Promise<AIUsageOverviewResponse> {
  const cache = getCacheManager()
  const cacheKey = `ai-usage:overview:${JSON.stringify({
    ...input,
    accountIds: [...(input.accountIds || [])].sort(),
    linesOfBusiness: [...(input.linesOfBusiness || [])].sort(),
    departments: [...(input.departments || [])].sort(),
    providers: [...(input.providers || [])].sort(),
    services: [...(input.services || [])].sort(),
    projects: [...(input.projects || [])].sort(),
    models: [...(input.models || [])].sort(),
    regions: [...(input.regions || [])].sort()
  })}`
  const cached = await cache.get<AIUsageOverviewResponse>(cacheKey)
  if (cached) return cached

  const range = resolveAIUsageDateRange(input)
  const priorRange = previousRange(range)
  const scopes = await resolveAIUsageScopes({
    environment: input.environment || 'all',
    accountIds: input.accountIds,
    linesOfBusiness: input.linesOfBusiness,
    departments: input.departments
  })
  const [currentRaw, previousRaw, collectorState] = await Promise.all([
    loadRange(scopes, range),
    loadRange(scopes, priorRange),
    getAIUsageCollectorState()
  ])
  const filters: AIUsageFilters = {
    startDate: range.startDate,
    endDate: range.endDate,
    periodLabel: range.label,
    environment: input.environment || 'all',
    accountIds: input.accountIds || [],
    linesOfBusiness: input.linesOfBusiness || [],
    departments: input.departments || [],
    providers: input.providers || [],
    services: input.services || [],
    projects: input.projects || [],
    models: input.models || [],
    regions: input.regions || [],
    costBasis: input.costBasis || 'proforma',
    groupBy: input.groupBy || 'enclave'
  }
  const current = applyFilters(currentRaw, filters)
  const previous = applyFilters(previousRaw, filters)
  const through = costThroughByEnvironment(currentRaw.filter(fact => selectedCostBasis(fact, filters.costBasis)))
  const previousThrough = costThroughByEnvironment(previousRaw.filter(fact => selectedCostBasis(fact, filters.costBasis)))
  const summary = summaryForFacts(current, through, filters.costBasis)
  const previousSummary = summaryForFacts(previous, previousThrough, filters.costBasis)
  summary.growthPercent = previousSummary.activeEnclaves === 0
    ? summary.activeEnclaves === 0 ? 0 : null
    : ((summary.activeEnclaves - previousSummary.activeEnclaves) / previousSummary.activeEnclaves) * 100
  const attempts = collectorState?.accountsAttempted || 0
  const dataQuality: AIUsageDataQuality = {
    collectedAt: collectorState?.completedAt || null,
    actualCostThrough: [...through.values()].sort().at(-1) || null,
    telemetryCoveragePercent: attempts ? ((collectorState?.accountsSucceeded || 0) / attempts) * 100 : 0,
    estimateCoveragePercent: summary.cost.estimateCoveragePercent,
    partial: collectorState?.status === 'partial' || collectorState?.status === 'error',
    warnings: collectorState?.warnings || (collectorState ? [] : ['AI usage collection has not completed yet.'])
  }
  const result: AIUsageOverviewResponse = {
    filters,
    summary,
    previousSummary,
    trend: trendForFacts(current, through, filters.costBasis),
    breakdown: breakdownForFacts(current, filters.groupBy, through, filters.costBasis),
    options: optionsForFacts(currentRaw),
    dataQuality
  }
  await cache.set(cacheKey, result, { ttl: 300, tags: ['ai-usage'] })
  return result
}
