import type {
  AIUsageEnvironment,
  AIUsageErrorCause,
  AIUsageErrorCauseResponse
} from '../../shared/types/ai-usage'
import { queryCloudTrailEvents } from './cloudtrail-data'
import { resolveAIUsageDateRange, queryAIUsage, type AIUsageQueryInput } from './ai-usage-query'
import { findAIUsageScope, type AIUsageAccountScope } from './ai-usage-scope'
import {
  getAIUsageCollectorState,
  loadAIUsageErrorCauses,
  saveAIUsageErrorCauses,
  withAIUsageErrorCauseKeys,
  type AIUsageCollectorFailure
} from './ai-usage-storage'
import { getCacheManager } from './cache-manager'

const DAY_MS = 24 * 60 * 60 * 1000
const RUNTIME_EVENT_SOURCES = [
  'bedrock.amazonaws.com',
  'bedrock-runtime.amazonaws.com',
  'bedrock'
]

function modelIdFromRequest(request: Record<string, unknown> | undefined): string | undefined {
  if (!request) return undefined
  const candidates = [request.modelId, request.modelIdentifier, request.foundationModelId]
  const modelId = candidates.find(value => typeof value === 'string' && value.trim())
  return typeof modelId === 'string' ? modelId.slice(0, 300) : undefined
}

function bounded(value: string | undefined, length: number): string | undefined {
  return value ? value.slice(0, length) : undefined
}

function causeTtl(timestamp: string): number {
  return Math.floor((new Date(timestamp).getTime() + 90 * DAY_MS) / 1000)
}

export async function collectRuntimeErrorCauses(
  scopes: AIUsageAccountScope[],
  lookbackDays: number
): Promise<{
  causes: AIUsageErrorCause[]
  failures: AIUsageCollectorFailure[]
  environments: Partial<Record<AIUsageEnvironment, 'complete' | 'unavailable'>>
}> {
  const causes: AIUsageErrorCause[] = []
  const failures: AIUsageCollectorFailure[] = []
  const environments: Partial<Record<AIUsageEnvironment, 'complete' | 'unavailable'>> = {}
  const endTime = new Date()
  const startTime = new Date(endTime.getTime() - Math.min(90, Math.max(1, lookbackDays)) * DAY_MS)

  for (const environment of ['commercial', 'govcloud'] as const) {
    const environmentScopes = scopes.filter(scope =>
      scope.telemetryEligible && scope.members.some(member => member.environment === environment))
    if (environmentScopes.length === 0) continue

    try {
      const requestedIds = environmentScopes.map(scope => scope.commercialAccountId || scope.enclaveId)
      const result = await queryCloudTrailEvents(requestedIds, {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        eventSources: RUNTIME_EVENT_SOURCES,
        errorsOnly: true
      }, { environment, limit: 5000 })

      for (const event of result.records) {
        if (!event.eventId || !event.errorCode) continue
        const scope = findAIUsageScope(environmentScopes, environment, event.accountId)
        if (!scope) continue
        causes.push(withAIUsageErrorCauseKeys({
          recordType: 'error-cause',
          eventId: event.eventId,
          environment,
          enclaveId: scope.enclaveId,
          enclaveName: scope.enclaveName,
          accountId: event.accountId,
          region: event.region,
          source: 'bedrock-runtime',
          modelId: modelIdFromRequest(event.requestParameters),
          operation: bounded(event.eventName, 200) || 'Unknown operation',
          errorCode: bounded(event.errorCode, 200) || 'Unknown error',
          errorMessage: bounded(event.errorMessage, 500),
          callerIdentity: bounded(
            event.userIdentityArn || event.userIdentityUserName || event.userIdentityPrincipalId,
            500
          ),
          timestamp: event.eventTime,
          ttl: causeTtl(event.eventTime)
        }))
      }
      environments[environment] = 'complete'
    } catch (error) {
      environments[environment] = 'unavailable'
      failures.push({
        environment,
        category: 'Error cause collection',
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  await saveAIUsageErrorCauses(causes)
  return { causes, failures, environments }
}

function matches(value: string | undefined, selected: string[]): boolean {
  return selected.length === 0 || Boolean(value && selected.includes(value))
}

function countBy<T>(items: T[], key: (item: T) => string | undefined): Array<{ key: string; count: number }> {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = key(item)
    if (value) counts.set(value, (counts.get(value) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ key: value, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export async function queryAIUsageErrorCauses(input: AIUsageQueryInput): Promise<AIUsageErrorCauseResponse> {
  const cache = getCacheManager()
  const cacheKey = `ai-usage:error-causes:${JSON.stringify(input)}`
  const cached = await cache.get<AIUsageErrorCauseResponse>(cacheKey)
  if (cached) return cached

  const range = resolveAIUsageDateRange(input)
  const { resolveAIUsageScopes } = await import('./ai-usage-scope')
  const scopes = await resolveAIUsageScopes({
    environment: input.environment || 'all',
    accountIds: input.accountIds,
    linesOfBusiness: input.linesOfBusiness,
    departments: input.departments
  })
  const targets = scopes.flatMap(scope => scope.members)
  const raw = await loadAIUsageErrorCauses(targets, range.startDate, range.endDate)
  const selectedProviders = input.providers || []
  const runtimeSelected = selectedProviders.length === 0 || selectedProviders.includes('bedrock-runtime')
  const bedrockServiceSelected = !(input.services || []).length ||
    (input.services || []).some(service => service.toLowerCase().includes('bedrock'))
  const causes = runtimeSelected && bedrockServiceSelected
    ? raw.filter(cause =>
        matches(cause.modelId, input.models || []) &&
        matches(cause.region, input.regions || []))
    : []

  const overview = await queryAIUsage(input)
  const metricErrorTotal = overview.summary.metrics.clientErrors +
    overview.summary.metrics.serverErrors +
    overview.summary.metrics.throttles
  const groupMap = new Map<string, AIUsageErrorCause[]>()
  for (const cause of causes) {
    const key = `${cause.errorCode}|${cause.operation}|${cause.errorMessage || ''}`
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(cause)
  }
  const collectorState = await getAIUsageCollectorState()
  const runtimeAvailability = collectorState?.causeCollection?.runtime === 'complete' || causes.length > 0
    ? 'available'
    : collectorState?.causeCollection?.runtime === 'partial'
      ? 'partial'
      : 'unavailable'
  const accountCounts = countBy(causes, cause => cause.accountId)
  const modelCounts = countBy(causes, cause => cause.modelId)
  const result: AIUsageErrorCauseResponse = {
    metricErrorTotal,
    matchedCloudTrailEvents: causes.length,
    affectedAccounts: accountCounts.map(item => ({
      accountId: item.key,
      enclaveName: causes.find(cause => cause.accountId === item.key)?.enclaveName || item.key,
      count: item.count
    })),
    affectedModels: modelCounts.map(item => ({ modelId: item.key, count: item.count })),
    groups: [...groupMap.entries()].map(([key, group]) => ({
      key,
      errorCode: group[0]!.errorCode,
      operation: group[0]!.operation,
      message: group[0]!.errorMessage,
      count: group.length,
      affectedAccounts: new Set(group.map(cause => cause.accountId)).size,
      affectedModels: new Set(group.map(cause => cause.modelId).filter(Boolean)).size
    })).sort((a, b) => b.count - a.count),
    recentExamples: causes.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10),
    sourceAvailability: {
      runtime: runtimeAvailability,
      mantle: 'unavailable',
      mantleMessage: 'Cause logging unavailable because Mantle CloudTrail data events are not configured.'
    }
  }
  await cache.set(cacheKey, result, { ttl: 300, tags: ['ai-usage'] })
  return result
}
