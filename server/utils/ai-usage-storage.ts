import type {
  AIUsageCollectionMarker,
  AIUsageEnvironment,
  AIUsageErrorCause,
  AIUsageFact,
  AIUsageGranularity
} from '../../shared/types/ai-usage'
import { batchPutItems, getItem, putItem, queryItems } from './dynamodb'
import { getTableConfig } from '../lib/dynamodb-config'
import { logger } from './logger'

const QUERY_CONCURRENCY = 8
let missingTableWarningLogged = false

export function isAIUsageTableMissing(error: unknown): boolean {
  const candidate = error as { name?: string; code?: string; message?: string }
  return candidate?.name === 'ResourceNotFoundException' ||
    candidate?.code === 'ResourceNotFoundException' ||
    candidate?.message?.includes('Requested resource not found') === true
}

function warnMissingTable(): void {
  if (missingTableWarningLogged) return
  missingTableWarningLogged = true
  logger.warn('[AI Usage] Storage table is not deployed; returning an empty usage snapshot')
}

export function buildAIUsageFactKeys(fact: Omit<AIUsageFact, 'pk' | 'sk'>): Pick<AIUsageFact, 'pk' | 'sk'> {
  const prefix = fact.granularity === 'hour' ? 'H' : 'D'
  const dimensions = [
    fact.provider,
    fact.costBasis || 'usage',
    fact.region || 'global',
    fact.service || 'unknown',
    fact.projectId || 'all-projects',
    fact.modelId || 'all-models'
  ].map(value => encodeURIComponent(value))
  return {
    pk: `${fact.environment.toUpperCase()}#${fact.accountId}`,
    sk: `${prefix}#${fact.bucket}#${dimensions.join('#')}`
  }
}

export function withAIUsageFactKeys(fact: Omit<AIUsageFact, 'pk' | 'sk'>): AIUsageFact {
  return { ...buildAIUsageFactKeys(fact), ...fact }
}

async function tableConfig() {
  return getTableConfig('aiUsage')
}

export async function saveAIUsageFacts(facts: AIUsageFact[]): Promise<void> {
  if (facts.length === 0) return
  const config = await tableConfig()
  await batchPutItems(config.tableName, facts, config.environment, config.accountId)
}

export function withAIUsageCollectionMarkerKeys(
  marker: Omit<AIUsageCollectionMarker, 'pk' | 'sk'>
): AIUsageCollectionMarker {
  return {
    pk: `${marker.environment.toUpperCase()}#${marker.accountId}`,
    sk: `M#${marker.bucket}#${encodeURIComponent(marker.region)}`,
    ...marker
  }
}

export function withAIUsageErrorCauseKeys(
  cause: Omit<AIUsageErrorCause, 'pk' | 'sk'>
): AIUsageErrorCause {
  return {
    ...cause,
    pk: `CAUSE#${cause.environment.toUpperCase()}#${cause.accountId}`,
    // Preserve Runtime's existing key shape so collection does not duplicate stored CloudTrail events.
    sk: cause.source === 'bedrock-runtime'
      ? `E#${cause.timestamp}#${encodeURIComponent(cause.eventId)}`
      : `E#${cause.timestamp}#${cause.source}#${encodeURIComponent(cause.eventId)}`
  }
}

export async function saveAIUsageCollectionMarkers(markers: AIUsageCollectionMarker[]): Promise<void> {
  if (markers.length === 0) return
  const config = await tableConfig()
  await batchPutItems(config.tableName, markers, config.environment, config.accountId)
}

export async function saveAIUsageErrorCauses(causes: AIUsageErrorCause[]): Promise<void> {
  if (causes.length === 0) return
  const config = await tableConfig()
  await batchPutItems(config.tableName, causes, config.environment, config.accountId)
}

async function queryPartition(
  pk: string,
  granularity: AIUsageGranularity,
  startDate: string,
  endDate: string
): Promise<AIUsageFact[]> {
  const config = await tableConfig()
  const prefix = granularity === 'hour' ? 'H' : 'D'
  const start = `${prefix}#${startDate}`
  const end = `${prefix}#${endDate}~`
  const facts: AIUsageFact[] = []
  let nextToken: string | undefined

  do {
    const result = await queryItems({
      tableName: config.tableName,
      queryExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      expressionAttributeValues: { ':pk': pk, ':start': start, ':end': end },
      nextToken
    }, config.environment, config.accountId)
    facts.push(...result.items as AIUsageFact[])
    nextToken = result.nextToken
  } while (nextToken)

  return facts
}

async function queryPrefixedPartition<T>(
  pk: string,
  prefix: string,
  startDate: string,
  endDate: string
): Promise<T[]> {
  const config = await tableConfig()
  const items: T[] = []
  let nextToken: string | undefined

  do {
    const result = await queryItems({
      tableName: config.tableName,
      queryExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      expressionAttributeValues: {
        ':pk': pk,
        ':start': `${prefix}#${startDate}`,
        ':end': `${prefix}#${endDate}~`
      },
      nextToken
    }, config.environment, config.accountId)
    items.push(...result.items as T[])
    nextToken = result.nextToken
  } while (nextToken)

  return items
}

async function loadPrefixedItems<T>(
  partitions: string[],
  prefix: string,
  startDate: string,
  endDate: string
): Promise<T[]> {
  const uniquePartitions = [...new Set(partitions)]
  if (uniquePartitions.length === 0) return []
  const items: T[] = []
  try {
    for (let index = 0; index < uniquePartitions.length; index += QUERY_CONCURRENCY) {
      const batch = uniquePartitions.slice(index, index + QUERY_CONCURRENCY)
      const results = await Promise.all(batch.map(pk => queryPrefixedPartition<T>(pk, prefix, startDate, endDate)))
      items.push(...results.flat())
    }
  } catch (error) {
    if (isAIUsageTableMissing(error)) {
      warnMissingTable()
      return []
    }
    throw error
  }
  return items
}

export async function loadAIUsageCollectionMarkers(
  partitions: string[],
  startDate: string,
  endDate: string
): Promise<AIUsageCollectionMarker[]> {
  return loadPrefixedItems(partitions, 'M', startDate, endDate)
}

export async function loadAIUsageErrorCauses(
  targets: Array<{ environment: AIUsageEnvironment; accountId: string }>,
  startDate: string,
  endDate: string
): Promise<AIUsageErrorCause[]> {
  const partitions = targets.map(target => `CAUSE#${target.environment.toUpperCase()}#${target.accountId}`)
  return loadPrefixedItems(partitions, 'E', startDate, endDate)
}

export interface AIUsageCollectorFailure {
  accountId?: string
  enclaveName?: string
  environment: AIUsageEnvironment
  region?: string
  category: string
  message: string
}

export async function loadAIUsageFacts(
  partitions: string[],
  granularity: AIUsageGranularity,
  startDate: string,
  endDate: string
): Promise<AIUsageFact[]> {
  const uniquePartitions = [...new Set(partitions)]
  if (uniquePartitions.length === 0) return []
  const facts: AIUsageFact[] = []
  try {
    facts.push(...await queryPartition(uniquePartitions[0]!, granularity, startDate, endDate))
  } catch (error) {
    if (isAIUsageTableMissing(error)) {
      warnMissingTable()
      return []
    }
    throw error
  }

  for (let index = 1; index < uniquePartitions.length; index += QUERY_CONCURRENCY) {
    const batch = uniquePartitions.slice(index, index + QUERY_CONCURRENCY)
    const results = await Promise.all(batch.map(pk => queryPartition(pk, granularity, startDate, endDate)))
    facts.push(...results.flat())
  }
  return facts
}

export interface AIUsageCollectorState {
  pk: 'META'
  sk: 'COLLECTOR'
  status: 'running' | 'complete' | 'partial' | 'error'
  startedAt: string
  completedAt?: string
  accountsAttempted: number
  accountsSucceeded: number
  uniqueAccountsAttempted?: number
  uniqueAccountsSucceeded?: number
  accountRegionTargetsAttempted?: number
  accountRegionTargetsSucceeded?: number
  factsWritten: number
  markersWritten?: number
  causesWritten?: number
  causeCollection?: {
    runtime: 'complete' | 'partial' | 'unavailable'
    genai?: 'complete' | 'partial' | 'unavailable'
    collectedAt: string
    environments: Partial<Record<AIUsageEnvironment, 'complete' | 'unavailable'>>
  }
  warnings: string[]
  failures?: AIUsageCollectorFailure[]
}

export async function saveAIUsageCollectorState(state: AIUsageCollectorState): Promise<void> {
  const config = await tableConfig()
  await putItem(config.tableName, state, config.environment, config.accountId)
}

export async function getAIUsageCollectorState(): Promise<AIUsageCollectorState | null> {
  const config = await tableConfig()
  try {
    return await getItem(config.tableName, { pk: 'META', sk: 'COLLECTOR' }, config.environment, config.accountId) as AIUsageCollectorState | null
  } catch (error) {
    if (isAIUsageTableMissing(error)) {
      warnMissingTable()
      return null
    }
    throw error
  }
}
