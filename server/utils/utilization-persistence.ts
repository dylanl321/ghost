/**
 * Utilization Analysis Persistence
 * DynamoDB operations for storing and retrieving instance utilization analysis results.
 * Uses single-table design with PK/SK pattern.
 */

import { getTableConfig } from '../lib/dynamodb-config'
import { getItem, putItem, updateItem, batchPutItems, queryItems } from './dynamodb'
import { logger } from './logger'
import type { ClassificationSummary, InstanceClassification } from './instance-utilization-classifier'

export interface AnalysisJob {
  PK: string // ACCOUNT#{accountId}
  SK: string // ANALYSIS#{environment}#{timestamp}
  type: 'analysis-job'
  jobId: string
  accountId: string
  environment: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  triggeredAt: string
  completedAt?: string
  lookbackDays: number
  totalInstances: number
  progress: {
    phase: 'config' | 'cloudwatch' | 'optimizer' | 'pricing' | 'classifying' | 'saving' | 'done'
    instancesProcessed: number
    totalInstances: number
    metricsErrors: number
  }
  summary?: ClassificationSummary
  errorMessage?: string
  ttl: number
}

export interface LatestPointer {
  PK: string // ACCOUNT#{accountId}
  SK: string // LATEST#{environment}
  type: 'latest-pointer'
  jobId: string
  status: string
  triggeredAt?: string
  completedAt?: string
  summary?: ClassificationSummary
  ttl: number
}

async function getTableInfo() {
  const config = await getTableConfig('utilizationAnalysis')
  return {
    tableName: config.tableName,
    environment: config.environment,
    accountId: config.accountId
  }
}

export async function saveAnalysisJob(job: AnalysisJob): Promise<void> {
  const { tableName, environment, accountId } = await getTableInfo()
  await putItem(tableName, job, environment, accountId)
}

export async function updateAnalysisProgress(
  accountId: string,
  env: string,
  timestamp: string,
  progress: AnalysisJob['progress'],
  extra?: Partial<Pick<AnalysisJob, 'status' | 'completedAt' | 'summary' | 'errorMessage' | 'totalInstances'>>
): Promise<void> {
  const { tableName, environment, accountId: tableAccountId } = await getTableInfo()
  const updates: Record<string, any> = { progress }
  if (extra) Object.assign(updates, extra)
  await updateItem(
    tableName,
    { PK: `ACCOUNT#${accountId}`, SK: `ANALYSIS#${env}#${timestamp}` },
    updates,
    environment,
    tableAccountId
  )
}

export async function saveLatestPointer(pointer: LatestPointer): Promise<void> {
  const { tableName, environment, accountId } = await getTableInfo()
  await putItem(tableName, pointer, environment, accountId)
}

export async function getLatestAnalysis(accountId: string, env: string): Promise<LatestPointer | null> {
  const { tableName, environment, accountId: tableAccountId } = await getTableInfo()
  const result = await getItem(
    tableName,
    { PK: `ACCOUNT#${accountId}`, SK: `LATEST#${env}` },
    environment,
    tableAccountId
  )
  return result as LatestPointer | null
}

export async function getAnalysisJob(accountId: string, env: string, timestamp: string): Promise<AnalysisJob | null> {
  const { tableName, environment, accountId: tableAccountId } = await getTableInfo()
  const result = await getItem(
    tableName,
    { PK: `ACCOUNT#${accountId}`, SK: `ANALYSIS#${env}#${timestamp}` },
    environment,
    tableAccountId
  )
  return result as AnalysisJob | null
}

export async function saveInstanceClassifications(
  jobId: string,
  classifications: InstanceClassification[]
): Promise<void> {
  const { tableName, environment, accountId } = await getTableInfo()
  const items = classifications.map(c => ({
    PK: `JOB#${jobId}`,
    SK: `INSTANCE#${c.instanceId}`,
    type: 'instance-classification',
    ...c,
    ttl: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60 // 30 days
  }))
  await batchPutItems(tableName, items, environment, accountId)
}

export async function getInstanceClassifications(
  jobId: string,
  options?: { classification?: string; limit?: number; nextToken?: string }
): Promise<{ items: InstanceClassification[]; nextToken?: string }> {
  const { tableName, environment, accountId } = await getTableInfo()

  const params: any = {
    tableName,
    queryExpression: 'PK = :pk AND begins_with(SK, :sk)',
    expressionAttributeValues: {
      ':pk': `JOB#${jobId}`,
      ':sk': 'INSTANCE#'
    },
    limit: options?.limit || 50
  }

  if (options?.classification) {
    params.filterExpression = 'classification = :cls'
    params.expressionAttributeValues[':cls'] = options.classification
  }

  if (options?.nextToken) {
    params.nextToken = options.nextToken
  }

  const result = await queryItems(params, environment, accountId)

  return {
    items: (result.items || []) as InstanceClassification[],
    nextToken: result.nextToken
  }
}
