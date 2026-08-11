import {
  GetMetricDataCommand,
  ListMetricsCommand,
  type Dimension,
  type Metric
} from '@aws-sdk/client-cloudwatch'
import type { AIUsageEnvironment, AIUsageFact, AIUsageGranularity, AIUsageMetrics, AIUsageProvider } from '../../shared/types/ai-usage'
import { emptyAIUsageMetrics } from '../../shared/types/ai-usage'
import { getCloudWatchClient } from '../lib/aws-client-factory'
import { getCostAndUsage } from './cost-explorer'
import { AI_COST_EXPLORER_SERVICES, isBedrockService } from './ai-service-catalog'
import { estimateBedrockTokenCost } from './ai-usage-pricing'
import { findAIUsageScope, resolveAIUsageScopes, type AIUsageAccountScope } from './ai-usage-scope'
import {
  getAIUsageCollectorState,
  saveAIUsageCollectorState,
  saveAIUsageFacts,
  withAIUsageFactKeys
} from './ai-usage-storage'
import { logger } from './logger'
import { getCacheManager } from './cache-manager'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const TELEMETRY_CONCURRENCY = 4
const METRIC_QUERY_BATCH = 450

const RUNTIME_METRICS = new Set([
  'Invocations',
  'InvocationLatency',
  'InvocationClientErrors',
  'InvocationServerErrors',
  'InvocationThrottles',
  'InputTokenCount',
  'OutputTokenCount',
  'CacheReadInputTokens',
  'CacheWriteInputTokens',
  'OutputImageCount'
])

const MANTLE_METRICS = new Set([
  'Inferences',
  'InferenceClientErrors',
  'InputTokens',
  'OutputTokens'
])

interface MetricStream {
  metric: Metric
  provider: AIUsageProvider
}

interface FactAccumulator {
  bucket: string
  provider: AIUsageProvider
  service: string
  projectId?: string
  modelId?: string
  region: string
  metrics: AIUsageMetrics
  latencyTotal: number
}

function configuredRegions(environment: AIUsageEnvironment): string[] {
  const configured = environment === 'commercial'
    ? process.env.AI_USAGE_COMMERCIAL_REGIONS
    : process.env.AI_USAGE_GOVCLOUD_REGIONS
  const defaults = environment === 'commercial'
    ? ['us-east-1', 'us-east-2', 'us-west-1', 'us-west-2']
    : ['us-gov-west-1', 'us-gov-east-1']
  return configured
    ? [...new Set(configured.split(',').map(region => region.trim()).filter(Boolean))]
    : defaults
}

function dimensionValue(dimensions: Dimension[] | undefined, name: string): string | undefined {
  return dimensions?.find(dimension => dimension.Name === name)?.Value
}

function metricIdentity(metric: Metric): string {
  return `${metric.MetricName}|${(metric.Dimensions || []).map(dimension => `${dimension.Name}=${dimension.Value}`).sort().join('|')}`
}

async function listNamespaceMetrics(
  environment: AIUsageEnvironment,
  accountId: string,
  region: string,
  namespace: 'AWS/Bedrock' | 'AWS/BedrockMantle',
  names: Set<string>
): Promise<Metric[]> {
  const client = await getCloudWatchClient(environment, region, accountId)
  const metrics = new Map<string, Metric>()
  let nextToken: string | undefined
  do {
    const response = await client.send(new ListMetricsCommand({ Namespace: namespace, NextToken: nextToken }))
    for (const metric of response.Metrics || []) {
      if (metric.MetricName && names.has(metric.MetricName)) metrics.set(metricIdentity(metric), metric)
    }
    nextToken = response.NextToken
  } while (nextToken)
  return [...metrics.values()]
}

export function selectMantleDetailMetrics(metrics: Metric[]): Metric[] {
  const byName = new Map<string, Metric[]>()
  for (const metric of metrics) {
    const current = byName.get(metric.MetricName || '') || []
    current.push(metric)
    byName.set(metric.MetricName || '', current)
  }

  return [...byName.values()].flatMap(candidates => {
    const projectAndModel = candidates.filter(metric =>
      dimensionValue(metric.Dimensions, 'Project') && dimensionValue(metric.Dimensions, 'Model'))
    if (projectAndModel.length) return projectAndModel
    const model = candidates.filter(metric => dimensionValue(metric.Dimensions, 'Model'))
    if (model.length) return model
    const project = candidates.filter(metric => dimensionValue(metric.Dimensions, 'Project'))
    return project.length ? project : candidates.filter(metric => (metric.Dimensions || []).length === 0)
  })
}

function bucketFor(timestamp: Date, granularity: AIUsageGranularity): string {
  return granularity === 'hour'
    ? `${timestamp.toISOString().slice(0, 13)}:00:00Z`
    : timestamp.toISOString().slice(0, 10)
}

function factTtl(bucket: string, granularity: AIUsageGranularity): number {
  const date = new Date(granularity === 'hour' ? bucket : `${bucket}T00:00:00.000Z`)
  const retention = granularity === 'hour' ? 90 * DAY_MS : 400 * DAY_MS
  return Math.floor((date.getTime() + retention) / 1000)
}

function applyMetric(accumulator: FactAccumulator, metricName: string, value: number): void {
  switch (metricName) {
    case 'Invocations':
    case 'Inferences': accumulator.metrics.invocations += value; break
    case 'InputTokenCount':
    case 'InputTokens':
    case 'TotalInputTokens': accumulator.metrics.inputTokens += value; break
    case 'OutputTokenCount':
    case 'OutputTokens':
    case 'TotalOutputTokens': accumulator.metrics.outputTokens += value; break
    case 'CacheReadInputTokens': accumulator.metrics.cacheReadTokens += value; break
    case 'CacheWriteInputTokens': accumulator.metrics.cacheWriteTokens += value; break
    case 'InvocationClientErrors':
    case 'InferenceClientErrors': accumulator.metrics.clientErrors += value; break
    case 'InvocationServerErrors': accumulator.metrics.serverErrors += value; break
    case 'InvocationThrottles': accumulator.metrics.throttles += value; break
    case 'OutputImageCount': accumulator.metrics.outputImages += value; break
    case 'InvocationLatency':
      accumulator.latencyTotal += value
      accumulator.metrics.latencySamples += 1
      accumulator.metrics.latencyMs = accumulator.latencyTotal / accumulator.metrics.latencySamples
      break
  }
}

async function fetchTelemetryFacts(input: {
  scope: AIUsageAccountScope
  environment: AIUsageEnvironment
  accountId: string
  region: string
  granularity: AIUsageGranularity
  startTime: Date
  endTime: Date
}): Promise<AIUsageFact[]> {
  const client = await getCloudWatchClient(input.environment, input.region, input.accountId)
  const [runtime, mantleRaw] = await Promise.all([
    listNamespaceMetrics(input.environment, input.accountId, input.region, 'AWS/Bedrock', RUNTIME_METRICS),
    listNamespaceMetrics(input.environment, input.accountId, input.region, 'AWS/BedrockMantle', MANTLE_METRICS)
  ])
  const streams: MetricStream[] = [
    ...runtime.filter(metric => dimensionValue(metric.Dimensions, 'ModelId')).map(metric => ({ metric, provider: 'bedrock-runtime' as const })),
    ...selectMantleDetailMetrics(mantleRaw).map(metric => ({ metric, provider: 'bedrock-mantle' as const }))
  ]
  if (streams.length === 0) return []

  const accumulators = new Map<string, FactAccumulator>()
  const period = input.granularity === 'hour' ? 3600 : 86400
  for (let index = 0; index < streams.length; index += METRIC_QUERY_BATCH) {
    const batch = streams.slice(index, index + METRIC_QUERY_BATCH)
    const queries = batch.map((stream, queryIndex) => ({
      Id: `m${queryIndex}`,
      MetricStat: {
        Metric: stream.metric,
        Period: period,
        Stat: stream.metric.MetricName === 'InvocationLatency' ? 'Average' : 'Sum'
      },
      ReturnData: true
    }))
    let nextToken: string | undefined
    do {
      const response = await client.send(new GetMetricDataCommand({
        StartTime: input.startTime,
        EndTime: input.endTime,
        ScanBy: 'TimestampAscending',
        MetricDataQueries: queries,
        NextToken: nextToken
      }))

      for (const result of response.MetricDataResults || []) {
        const stream = batch[Number.parseInt((result.Id || '').slice(1), 10)]
        if (!stream || !stream.metric.MetricName) continue
        const projectId = dimensionValue(stream.metric.Dimensions, 'Project')
        const modelId = dimensionValue(stream.metric.Dimensions, stream.provider === 'bedrock-runtime' ? 'ModelId' : 'Model')
        for (let valueIndex = 0; valueIndex < (result.Values || []).length; valueIndex++) {
          const timestamp = result.Timestamps?.[valueIndex]
          const value = result.Values?.[valueIndex]
          if (!timestamp || value === undefined) continue
          const bucket = bucketFor(timestamp, input.granularity)
          const key = [bucket, stream.provider, projectId || '', modelId || ''].join('|')
          let accumulator = accumulators.get(key)
          if (!accumulator) {
            accumulator = {
              bucket,
              provider: stream.provider,
              service: stream.provider === 'bedrock-runtime' ? 'Amazon Bedrock Runtime' : 'Amazon Bedrock Mantle',
              projectId,
              modelId,
              region: input.region,
              metrics: emptyAIUsageMetrics(),
              latencyTotal: 0
            }
            accumulators.set(key, accumulator)
          }
          applyMetric(accumulator, stream.metric.MetricName, value)
        }
      }
      nextToken = response.NextToken
    } while (nextToken)
  }

  const collectedAt = new Date().toISOString()
  return await Promise.all([...accumulators.values()].map(async accumulator => {
    const estimate = await estimateBedrockTokenCost({
      modelId: accumulator.modelId,
      region: accumulator.region,
      inputTokens: accumulator.metrics.inputTokens,
      outputTokens: accumulator.metrics.outputTokens,
      cacheReadTokens: accumulator.metrics.cacheReadTokens,
      cacheWriteTokens: accumulator.metrics.cacheWriteTokens
    })
    return withAIUsageFactKeys({
      granularity: input.granularity,
      bucket: accumulator.bucket,
      environment: input.environment,
      enclaveId: input.scope.enclaveId,
      enclaveName: input.scope.enclaveName,
      accountId: input.accountId,
      commercialAccountId: input.scope.commercialAccountId,
      govCloudAccountId: input.scope.govCloudAccountId,
      lineOfBusiness: input.scope.lineOfBusiness,
      department: input.scope.department,
      provider: accumulator.provider,
      service: accumulator.service,
      projectId: accumulator.projectId,
      modelId: accumulator.modelId,
      region: accumulator.region,
      metrics: accumulator.metrics,
      actualCost: 0,
      estimatedCost: estimate.estimatedCost,
      pricedTokens: estimate.pricedTokens,
      collectedAt,
      priceEffectiveDate: estimate.priceEffectiveDate,
      ttl: factTtl(accumulator.bucket, input.granularity)
    })
  }))
}

async function collectCostFacts(
  scopes: AIUsageAccountScope[],
  environment: AIUsageEnvironment,
  costBasis: 'billable' | 'proforma',
  startDate: string,
  endDate: string
): Promise<AIUsageFact[]> {
  if (environment === 'govcloud' && costBasis === 'proforma') return []
  const targetAccountId = environment === 'commercial'
    ? costBasis === 'proforma'
      ? process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
      : process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
    : undefined
  const response = await getCostAndUsage({
    startDate,
    endDate,
    granularity: 'DAILY',
    metrics: ['UnblendedCost'],
    groupBy: [
      { type: 'DIMENSION', key: 'LINKED_ACCOUNT' },
      { type: 'DIMENSION', key: 'SERVICE' }
    ],
    filter: { Dimensions: { Key: 'SERVICE', Values: AI_COST_EXPLORER_SERVICES } }
  }, environment, targetAccountId)

  const collectedAt = new Date().toISOString()
  const facts: AIUsageFact[] = []
  for (const period of response.resultsByTime || []) {
    const bucket = period.TimePeriod?.Start
    if (!bucket) continue
    for (const group of period.Groups || []) {
      const accountId = group.Keys?.[0]
      const service = group.Keys?.[1]
      if (!accountId || !service) continue
      const scope = findAIUsageScope(scopes, environment, accountId)
      if (!scope) continue
      const actualCost = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount || '0') || 0
      facts.push(withAIUsageFactKeys({
        granularity: 'day',
        bucket,
        environment,
        enclaveId: scope.enclaveId,
        enclaveName: scope.enclaveName,
        accountId,
        commercialAccountId: scope.commercialAccountId,
        govCloudAccountId: scope.govCloudAccountId,
        lineOfBusiness: scope.lineOfBusiness,
        department: scope.department,
        provider: isBedrockService(service) ? 'bedrock-cost' : 'aws-ai-service',
        service,
        costBasis,
        metrics: emptyAIUsageMetrics(),
        actualCost,
        estimatedCost: 0,
        pricedTokens: 0,
        collectedAt,
        dataThrough: response.dataset.dataThroughDate || undefined,
        ttl: factTtl(bucket, 'day')
      }))
    }
  }
  return facts
}

async function concurrentMap<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  for (let index = 0; index < items.length; index += concurrency) {
    results.push(...await Promise.all(items.slice(index, index + concurrency).map(async item => {
      try {
        return { status: 'fulfilled', value: await worker(item) } as PromiseFulfilledResult<R>
      } catch (reason) {
        return { status: 'rejected', reason } as PromiseRejectedResult
      }
    })))
  }
  return results
}

export async function collectAIUsage(options: { backfillDays?: number } = {}): Promise<{
  factsWritten: number
  warnings: string[]
  initialBackfill: boolean
}> {
  const existingState = await getAIUsageCollectorState()
  const initialBackfill = !existingState?.completedAt
  const backfillDays = Math.min(400, Math.max(1, options.backfillDays || (initialBackfill ? 400 : 3)))
  const startedAt = new Date().toISOString()
  const warnings: string[] = []
  let accountsAttempted = 0
  let accountsSucceeded = 0
  let factsWritten = 0

  await saveAIUsageCollectorState({
    pk: 'META', sk: 'COLLECTOR', status: 'running', startedAt,
    accountsAttempted, accountsSucceeded, factsWritten, warnings: []
  })

  try {
    const scopes = await resolveAIUsageScopes()
    const work = scopes.flatMap(scope => scope.members.flatMap(member =>
      configuredRegions(member.environment).map(region => ({ scope, ...member, region }))))
    accountsAttempted = work.length
    await saveAIUsageCollectorState({
      pk: 'META', sk: 'COLLECTOR', status: 'running', startedAt,
      accountsAttempted, accountsSucceeded, factsWritten, warnings: []
    })

    const now = new Date()
    const hourStart = new Date(now.getTime() - 2 * HOUR_MS)
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
    const dayStart = new Date(todayStart.getTime() - (backfillDays - 1) * DAY_MS)
    const telemetryResults = await concurrentMap(work, TELEMETRY_CONCURRENCY, async item => {
      const [hourly, daily] = await Promise.all([
        fetchTelemetryFacts({ ...item, granularity: 'hour', startTime: hourStart, endTime: now }),
        fetchTelemetryFacts({ ...item, granularity: 'day', startTime: dayStart, endTime: now })
      ])
      return [...hourly, ...daily]
    })

    const telemetryFacts: AIUsageFact[] = []
    for (const result of telemetryResults) {
      if (result.status === 'fulfilled') {
        telemetryFacts.push(...result.value)
        accountsSucceeded++
      } else {
        warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
      }
    }

    const endDate = now.toISOString().slice(0, 10)
    const startDate = new Date(todayStart.getTime() - backfillDays * DAY_MS).toISOString().slice(0, 10)
    const costResults = await Promise.allSettled([
      collectCostFacts(scopes, 'commercial', 'billable', startDate, endDate),
      collectCostFacts(scopes, 'commercial', 'proforma', startDate, endDate),
      collectCostFacts(scopes, 'govcloud', 'billable', startDate, endDate)
    ])
    const costFacts: AIUsageFact[] = []
    for (const result of costResults) {
      if (result.status === 'fulfilled') costFacts.push(...result.value)
      else warnings.push(result.reason instanceof Error ? result.reason.message : String(result.reason))
    }

    const facts = [...telemetryFacts, ...costFacts]
    factsWritten = facts.length
    await saveAIUsageFacts(facts)
    await getCacheManager().invalidateByTags(['ai-usage'])
    const completedAt = new Date().toISOString()
    await saveAIUsageCollectorState({
      pk: 'META', sk: 'COLLECTOR',
      status: warnings.length ? 'partial' : 'complete',
      startedAt, completedAt,
      accountsAttempted,
      accountsSucceeded,
      factsWritten,
      warnings: warnings.slice(0, 50)
    })
    logger.info(`[AI Usage] Collection complete: ${factsWritten} facts, ${warnings.length} warning(s)`)
    return { factsWritten, warnings, initialBackfill }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await saveAIUsageCollectorState({
      pk: 'META', sk: 'COLLECTOR', status: 'error', startedAt, completedAt: new Date().toISOString(),
      accountsAttempted, accountsSucceeded, factsWritten, warnings: [...warnings, message].slice(0, 50)
    }).catch(() => {})
    throw error
  }
}
