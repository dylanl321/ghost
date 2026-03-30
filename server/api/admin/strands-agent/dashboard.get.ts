/**
 * GET /api/admin/strands-agent/dashboard
 *
 * Get aggregated Strands agent metrics for admin dashboard
 * Supports querying by time period (24h, 7d, 30d)
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { scanItems } from '../../../utils/dynamodb'
import type {
  StrandsQueryMetric,
  StrandsErrorMetric,
  StrandsAgentDashboardMetrics,
  StrandsAgentMetricsResponse
} from '#shared/types/strands-agent-metrics'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.STRANDS_AGENT_METRICS_TABLE_NAME || 'strands-agent-metrics-prod'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const period = (query.period as '24h' | '7d' | '30d') || '7d'

    // Calculate date range
    const { startDate, endDate } = getDateRange(period)

    // Fetch metrics for the period
    const result = await scanItems(
      TABLE_NAME,
      '#ts >= :startDate',
      undefined,
      undefined,
      'govcloud',
      {
        '#ts': 'timestamp'
      },
      {
        ':startDate': startDate
      }
    )

    const allMetrics = result.items
    const queryMetrics = allMetrics.filter(m => m.metric_type === 'query') as StrandsQueryMetric[]
    const errorMetrics = allMetrics.filter(m => m.metric_type === 'error') as StrandsErrorMetric[]

    // Calculate aggregated metrics
    const dashboardMetrics = calculateDashboardMetrics(
      queryMetrics,
      errorMetrics,
      period,
      startDate,
      endDate
    )

    return {
      success: true,
      metrics: dashboardMetrics
    } as StrandsAgentMetricsResponse
  } catch (error: any) {
    logger.error('[Admin] Error fetching Strands agent dashboard:', error)

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch Strands agent metrics'
    })
  }
})

/**
 * Calculate dashboard metrics from raw data
 */
function calculateDashboardMetrics(
  queryMetrics: StrandsQueryMetric[],
  errorMetrics: StrandsErrorMetric[],
  period: '24h' | '7d' | '30d',
  startDate: string,
  endDate: string
): StrandsAgentDashboardMetrics {
  // Query metrics
  const totalQueries = queryMetrics.length
  const successfulQueries = queryMetrics.filter(m => m.success).length
  const failedQueries = totalQueries - successfulQueries
  const successRate = totalQueries > 0 ? (successfulQueries / totalQueries) * 100 : 0

  // Performance
  const executionTimes = queryMetrics.map(m => m.execution_time_ms).sort((a, b) => a - b)
  const avgExecutionTime = executionTimes.length > 0
    ? executionTimes.reduce((sum, t) => sum + t, 0) / executionTimes.length
    : 0

  const p50ExecutionTime = executionTimes[Math.floor(executionTimes.length * 0.5)] || 0
  const p95ExecutionTime = executionTimes[Math.floor(executionTimes.length * 0.95)] || 0
  const p99ExecutionTime = executionTimes[Math.floor(executionTimes.length * 0.99)] || 0
  const slowQueries = queryMetrics.filter(m => m.execution_time_ms > 5000).length

  // Tool usage
  const totalToolCalls = queryMetrics.reduce((sum, m) => sum + m.tool_calls_count, 0)
  const avgToolCallsPerQuery = totalQueries > 0 ? totalToolCalls / totalQueries : 0

  // Aggregate top tools
  const toolUsageMap = new Map<string, { count: number; totalTime: number }>()
  for (const metric of queryMetrics) {
    for (const tool of metric.tools_used) {
      const existing = toolUsageMap.get(tool) || { count: 0, totalTime: 0 }
      existing.count++
      existing.totalTime += metric.execution_time_ms / metric.tool_calls_count // Approximate
      toolUsageMap.set(tool, existing)
    }
  }

  const topTools = Array.from(toolUsageMap.entries())
    .map(([toolName, data]) => ({
      toolName,
      usageCount: data.count,
      avgExecutionTime: data.count > 0 ? data.totalTime / data.count : 0
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10)

  // MCP usage
  const mcpUsageMap = new Map<string, {
    mcpType: 'permanent' | 'temporary' | 'aggregated'
    queryCount: number
    totalTime: number
  }>()

  for (const metric of queryMetrics) {
    const existing = mcpUsageMap.get(metric.mcp_id) || {
      mcpType: metric.mcp_type,
      queryCount: 0,
      totalTime: 0
    }
    existing.queryCount++
    existing.totalTime += metric.execution_time_ms
    mcpUsageMap.set(metric.mcp_id, existing)
  }

  const mcpUsage = Array.from(mcpUsageMap.entries())
    .map(([mcpId, data]) => ({
      mcpId,
      mcpType: data.mcpType,
      queryCount: data.queryCount,
      avgExecutionTime: data.queryCount > 0 ? data.totalTime / data.queryCount : 0
    }))
    .sort((a, b) => b.queryCount - a.queryCount)

  // Account metrics
  const accountUsageMap = new Map<string, {
    accountAlias: string
    queryCount: number
    successCount: number
    totalTime: number
  }>()

  for (const metric of queryMetrics) {
    const existing = accountUsageMap.get(metric.account_id) || {
      accountAlias: metric.account_alias,
      queryCount: 0,
      successCount: 0,
      totalTime: 0
    }
    existing.queryCount++
    if (metric.success) existing.successCount++
    existing.totalTime += metric.execution_time_ms
    accountUsageMap.set(metric.account_id, existing)
  }

  const topAccounts = Array.from(accountUsageMap.entries())
    .map(([accountId, data]) => ({
      accountId,
      accountAlias: data.accountAlias,
      queryCount: data.queryCount,
      avgExecutionTime: data.queryCount > 0 ? data.totalTime / data.queryCount : 0,
      successRate: data.queryCount > 0 ? (data.successCount / data.queryCount) * 100 : 0
    }))
    .sort((a, b) => b.queryCount - a.queryCount)
    .slice(0, 10)

  // Error analysis
  const totalErrors = errorMetrics.length
  const errorRate = totalQueries > 0 ? (totalErrors / totalQueries) * 100 : 0

  const errorTypeMap = new Map<string, number>()
  for (const error of errorMetrics) {
    errorTypeMap.set(error.error_type, (errorTypeMap.get(error.error_type) || 0) + 1)
  }

  const errorsByType = Array.from(errorTypeMap.entries())
    .map(([errorType, count]) => ({
      errorType,
      count,
      percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    }))
    .sort((a, b) => b.count - a.count)

  const errorStepMap = new Map<string, number>()
  for (const error of errorMetrics) {
    errorStepMap.set(error.error_step, (errorStepMap.get(error.error_step) || 0) + 1)
  }

  const errorsByStep = Array.from(errorStepMap.entries())
    .map(([errorStep, count]) => ({
      errorStep,
      count,
      percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0
    }))
    .sort((a, b) => b.count - a.count)

  // Query trend (group by hour or day depending on period)
  const queryTrend = buildQueryTrend(queryMetrics, period)

  return {
    period,
    startDate,
    endDate,
    totalQueries,
    successfulQueries,
    failedQueries,
    successRate,
    avgExecutionTime,
    p50ExecutionTime,
    p95ExecutionTime,
    p99ExecutionTime,
    slowQueries,
    totalToolCalls,
    avgToolCallsPerQuery,
    topTools,
    mcpUsage,
    topAccounts,
    totalErrors,
    errorRate,
    errorsByType,
    errorsByStep,
    queryTrend
  }
}

/**
 * Build query trend data
 */
function buildQueryTrend(
  queryMetrics: StrandsQueryMetric[],
  period: '24h' | '7d' | '30d'
): Array<{ timestamp: string; queryCount: number; successRate: number; avgExecutionTime: number }> {
  const bucketSize = period === '24h' ? 3600000 : 86400000 // 1 hour or 1 day in ms

  const bucketMap = new Map<string, {
    queryCount: number
    successCount: number
    totalTime: number
  }>()

  for (const metric of queryMetrics) {
    const timestamp = new Date(metric.timestamp)
    const bucketTime = new Date(Math.floor(timestamp.getTime() / bucketSize) * bucketSize)
    const bucketKey = bucketTime.toISOString()

    const existing = bucketMap.get(bucketKey) || {
      queryCount: 0,
      successCount: 0,
      totalTime: 0
    }

    existing.queryCount++
    if (metric.success) existing.successCount++
    existing.totalTime += metric.execution_time_ms

    bucketMap.set(bucketKey, existing)
  }

  return Array.from(bucketMap.entries())
    .map(([timestamp, data]) => ({
      timestamp,
      queryCount: data.queryCount,
      successRate: data.queryCount > 0 ? (data.successCount / data.queryCount) * 100 : 0,
      avgExecutionTime: data.queryCount > 0 ? data.totalTime / data.queryCount : 0
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

/**
 * Get date range based on period
 */
function getDateRange(period: '24h' | '7d' | '30d'): {
  startDate: string
  endDate: string
} {
  const now = new Date()
  const endDate = now.toISOString()

  let days = 1
  switch (period) {
    case '24h':
      days = 1
      break
    case '7d':
      days = 7
      break
    case '30d':
      days = 30
      break
  }

  const start = new Date(now)
  start.setDate(start.getDate() - days)
  const startDate = start.toISOString()

  return { startDate, endDate }
}
