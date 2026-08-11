import type { AIUsageFact, AIUsageGranularity } from '../../shared/types/ai-usage'
import { batchPutItems, getItem, putItem, queryItems } from './dynamodb'
import { getTableConfig } from '../lib/dynamodb-config'

const QUERY_CONCURRENCY = 8

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

export async function loadAIUsageFacts(
  partitions: string[],
  granularity: AIUsageGranularity,
  startDate: string,
  endDate: string
): Promise<AIUsageFact[]> {
  const uniquePartitions = [...new Set(partitions)]
  const facts: AIUsageFact[] = []
  for (let index = 0; index < uniquePartitions.length; index += QUERY_CONCURRENCY) {
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
  factsWritten: number
  warnings: string[]
}

export async function saveAIUsageCollectorState(state: AIUsageCollectorState): Promise<void> {
  const config = await tableConfig()
  await putItem(config.tableName, state, config.environment, config.accountId)
}

export async function getAIUsageCollectorState(): Promise<AIUsageCollectorState | null> {
  const config = await tableConfig()
  return await getItem(config.tableName, { pk: 'META', sk: 'COLLECTOR' }, config.environment, config.accountId) as AIUsageCollectorState | null
}
