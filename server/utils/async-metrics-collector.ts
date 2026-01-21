/**
 * Async Chat Metrics Collector
 * Collects and aggregates metrics for async polling queries
 * Replaces SSE streaming metrics
 */

import { logger } from './logger'
import { putItem, getItem, updateItem } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'

/**
 * Get async metrics table configuration
 */
async function getMetricsTableConfig() {
  const tableName = await getTableName('asyncMetrics')
  const environment = await getTableEnvironment('asyncMetrics')
  const accountId = await getTableAccountId('asyncMetrics')
  return { tableName, environment, accountId }
}

export interface AsyncQueryMetrics {
  jobId: string
  userId: string
  query: string
  status: 'complete' | 'error' | 'timeout'
  durationMs: number
  pollCount: number
  toolCallsCount: number
  accountId?: string
  mcpUsed?: string
  mcpType?: 'permanent' | 'temporary'
  errorMessage?: string
  timestamp: string
}

export interface AggregatedMetrics {
  metricDate: string
  metricType: string
  totalQueries: number
  completedQueries: number
  erroredQueries: number
  timeoutQueries: number
  avgDurationMs: number
  minDurationMs: number
  maxDurationMs: number
  totalDurationMs: number
  avgPollCount: number
  completionRate: number
  errorRate: number
  toolsUsed: Record<string, number>
  accountsQueried: Record<string, number>
  lastUpdated: string
  ttl: number
}

/**
 * Record metrics for a completed async query
 */
export async function recordAsyncQueryMetrics(metrics: AsyncQueryMetrics): Promise<void> {
  try {
    const date = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    // Update daily aggregate
    await updateDailyMetrics(date, metrics)

    // Update user-specific aggregate
    await updateUserMetrics(date, metrics.userId, metrics)

    // Update account-specific aggregate if available
    if (metrics.accountId) {
      await updateAccountMetrics(date, metrics.accountId, metrics)
    }

    logger.debug('[Async Metrics] Recorded query metrics', {
      jobId: metrics.jobId,
      status: metrics.status,
      durationMs: metrics.durationMs,
      pollCount: metrics.pollCount
    })
  } catch (error: any) {
    logger.error('[Async Metrics] Failed to record metrics:', error)
    // Don't throw - metrics should never fail the main query
  }
}

/**
 * Update daily aggregate metrics
 */
async function updateDailyMetrics(date: string, metrics: AsyncQueryMetrics): Promise<void> {
  const metricType = 'daily'
  await updateAggregateMetrics(date, metricType, metrics)
}

/**
 * Update user-specific metrics
 */
async function updateUserMetrics(date: string, userId: string, metrics: AsyncQueryMetrics): Promise<void> {
  const metricType = `user:${userId}`
  await updateAggregateMetrics(date, metricType, metrics)
}

/**
 * Update account-specific metrics
 */
async function updateAccountMetrics(date: string, accountId: string, metrics: AsyncQueryMetrics): Promise<void> {
  const metricType = `account:${accountId}`
  await updateAggregateMetrics(date, metricType, metrics)
}

/**
 * Update aggregate metrics in DynamoDB
 */
async function updateAggregateMetrics(
  date: string,
  metricType: string,
  metrics: AsyncQueryMetrics
): Promise<void> {
  const tableConfig = await getMetricsTableConfig()
  const key = { metricDate: date, metricType }

  // Get existing metrics
  let aggregate = await getItem<AggregatedMetrics>(tableConfig.tableName, key, tableConfig.environment, tableConfig.accountId)

  if (!aggregate) {
    // Create new aggregate
    aggregate = {
      metricDate: date,
      metricType,
      totalQueries: 0,
      completedQueries: 0,
      erroredQueries: 0,
      timeoutQueries: 0,
      avgDurationMs: 0,
      minDurationMs: metrics.durationMs,
      maxDurationMs: metrics.durationMs,
      totalDurationMs: 0,
      avgPollCount: 0,
      completionRate: 0,
      errorRate: 0,
      toolsUsed: {},
      accountsQueried: {},
      lastUpdated: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 3600) // 90 days
    }
  }

  // Update counts
  aggregate.totalQueries++

  if (metrics.status === 'complete') {
    aggregate.completedQueries++
  } else if (metrics.status === 'error') {
    aggregate.erroredQueries++
  } else if (metrics.status === 'timeout') {
    aggregate.timeoutQueries++
  }

  // Update durations
  aggregate.totalDurationMs += metrics.durationMs
  aggregate.avgDurationMs = Math.round(aggregate.totalDurationMs / aggregate.totalQueries)
  aggregate.minDurationMs = Math.min(aggregate.minDurationMs, metrics.durationMs)
  aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, metrics.durationMs)

  // Update poll count average
  const totalPollCount = (aggregate.avgPollCount * (aggregate.totalQueries - 1)) + metrics.pollCount
  aggregate.avgPollCount = Math.round(totalPollCount / aggregate.totalQueries)

  // Update rates
  aggregate.completionRate = Number((aggregate.completedQueries / aggregate.totalQueries).toFixed(2))
  aggregate.errorRate = Number((aggregate.erroredQueries / aggregate.totalQueries).toFixed(2))

  // Update tools used
  if (metrics.mcpUsed) {
    aggregate.toolsUsed[metrics.mcpUsed] = (aggregate.toolsUsed[metrics.mcpUsed] || 0) + 1
  }

  // Update accounts queried
  if (metrics.accountId) {
    aggregate.accountsQueried[metrics.accountId] = (aggregate.accountsQueried[metrics.accountId] || 0) + 1
  }

  aggregate.lastUpdated = new Date().toISOString()

  // Save updated aggregate
  await putItem(tableConfig.tableName, aggregate, tableConfig.environment, tableConfig.accountId)
}

/**
 * Get daily metrics
 */
export async function getDailyMetrics(date: string): Promise<AggregatedMetrics | null> {
  const tableConfig = await getMetricsTableConfig()
  return await getItem<AggregatedMetrics>(tableConfig.tableName, {
    metricDate: date,
    metricType: 'daily'
  }, tableConfig.environment, tableConfig.accountId)
}

/**
 * Get stored user metrics from DynamoDB
 * Named distinctly from chat-metrics-aggregator's getUserMetrics which aggregates live chat data
 */
export async function getStoredUserMetrics(date: string, userId: string): Promise<AggregatedMetrics | null> {
  const tableConfig = await getMetricsTableConfig()
  return await getItem<AggregatedMetrics>(tableConfig.tableName, {
    metricDate: date,
    metricType: `user:${userId}`
  }, tableConfig.environment, tableConfig.accountId)
}

/**
 * Get account metrics
 */
export async function getAccountMetrics(date: string, accountId: string): Promise<AggregatedMetrics | null> {
  const tableConfig = await getMetricsTableConfig()
  return await getItem<AggregatedMetrics>(tableConfig.tableName, {
    metricDate: date,
    metricType: `account:${accountId}`
  }, tableConfig.environment, tableConfig.accountId)
}

/**
 * Get metrics for a date range
 */
export async function getMetricsRange(
  startDate: string,
  endDate: string,
  metricType: string = 'daily'
): Promise<AggregatedMetrics[]> {
  // This would require a query operation - for now returning empty
  // In production, implement using DynamoDB query with date range
  logger.warn('[Async Metrics] Range queries not implemented yet')
  return []
}
