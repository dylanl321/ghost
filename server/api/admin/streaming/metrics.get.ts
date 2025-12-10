/**
 * GET /api/admin/streaming/metrics
 *
 * Get aggregated async chat metrics for the admin dashboard
 * Supports querying by time period (24h, 7d, 30d)
 * Updated for async polling (no longer SSE streaming)
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getDailyMetrics } from '../../../utils/async-metrics-collector'
import { queryItems } from '../../../utils/dynamodb'
import type { AggregatedMetrics } from '../../../utils/async-metrics-collector'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.AWS_ASYNC_METRICS_TABLE_NAME || 'ghost-async-metrics'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const period = (query.period as '24h' | '7d' | '30d') || '24h'

    // Calculate date range based on period
    const { startDate, endDate, days } = getDateRange(period)

    // Fetch daily metrics for the period
    const dailyMetrics = await fetchDailyMetrics(startDate, endDate)

    // Calculate aggregated metrics
    const dashboardMetrics = calculateDashboardMetrics(
      dailyMetrics,
      period,
      startDate,
      endDate,
      days
    )

    return {
      success: true,
      metrics: dashboardMetrics
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching streaming metrics:', error)

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch streaming metrics'
    })
  }
})

/**
 * Get date range based on period
 */
function getDateRange(period: '24h' | '7d' | '30d'): {
  startDate: string
  endDate: string
  days: number
} {
  const now = new Date()
  const endDate = now.toISOString().split('T')[0]

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
  start.setDate(start.getDate() - days + 1)
  const startDate = start.toISOString().split('T')[0]

  return { startDate, endDate, days }
}

/**
 * Fetch daily metrics for date range
 */
async function fetchDailyMetrics(startDate: string, endDate: string): Promise<AggregatedMetrics[]> {
  const dates = generateDateRange(startDate, endDate)

  const promises = dates.map(date => getDailyMetrics(date))
  const results = await Promise.all(promises)

  return results.filter(Boolean) as AggregatedMetrics[]
}

/**
 * Calculate dashboard metrics from daily metrics
 */
function calculateDashboardMetrics(
  dailyMetrics: AggregatedMetrics[],
  period: '24h' | '7d' | '30d',
  startDate: string,
  endDate: string,
  days: number
): any {
  // Sum up totals
  const totalQueries = dailyMetrics.reduce((sum, m) => sum + m.totalQueries, 0)
  const completedQueries = dailyMetrics.reduce((sum, m) => sum + m.completedQueries, 0)
  const erroredQueries = dailyMetrics.reduce((sum, m) => sum + m.erroredQueries, 0)
  const timeoutQueries = dailyMetrics.reduce((sum, m) => sum + m.timeoutQueries, 0)

  // Calculate average duration across all queries
  const totalDuration = dailyMetrics.reduce((sum, m) => sum + m.totalDurationMs, 0)
  const avgDuration = totalQueries > 0 ? totalDuration / totalQueries : 0

  // Calculate percentile durations (approximation from daily data)
  const allDurations = dailyMetrics.flatMap(m => [m.minDurationMs, m.avgDurationMs, m.maxDurationMs])
  allDurations.sort((a, b) => a - b)

  const p50Duration = allDurations[Math.floor(allDurations.length * 0.5)] || 0
  const p95Duration = allDurations[Math.floor(allDurations.length * 0.95)] || 0
  const p99Duration = allDurations[Math.floor(allDurations.length * 0.99)] || 0

  // Calculate rates
  const completionRate = totalQueries > 0 ? (completedQueries / totalQueries) * 100 : 0
  const errorRate = totalQueries > 0 ? (erroredQueries / totalQueries) * 100 : 0
  const timeoutRate = totalQueries > 0 ? (timeoutQueries / totalQueries) * 100 : 0

  // Calculate average poll count
  const avgPollCount = dailyMetrics.reduce((sum, m) => sum + m.avgPollCount, 0) / (dailyMetrics.length || 1)

  // Aggregate tools used
  const topTools = aggregateTopTools(dailyMetrics)

  // Aggregate top accounts
  const topAccounts = aggregateTopAccounts(dailyMetrics)

  // Build hourly stats for charts (approximation from daily data)
  const hourlyStats = buildHourlyStats(dailyMetrics, days)

  return {
    period,
    startDate,
    endDate,
    totalQueries,
    activeQueries: 0, // Would need separate tracking
    completedQueries,
    erroredQueries,
    timeoutQueries,
    avgDuration,
    avgPollCount,
    p50Duration,
    p95Duration,
    p99Duration,
    completionRate,
    errorRate,
    timeoutRate,
    topUsers: [], // Would need separate user tracking
    topAccounts,
    topTools,
    recentErrors: [], // Would need separate error logging
    hourlyStats
  }
}

/**
 * Aggregate top tools from daily metrics
 */
function aggregateTopTools(
  dailyMetrics: AggregatedMetrics[]
): Array<{ toolName: string; usageCount: number; avgExecutionTime: number }> {
  const toolsMap = new Map<string, number>()

  for (const metric of dailyMetrics) {
    for (const [tool, count] of Object.entries(metric.toolsUsed)) {
      toolsMap.set(tool, (toolsMap.get(tool) || 0) + count)
    }
  }

  // Convert to array and sort by usage
  const tools = Array.from(toolsMap.entries())
    .map(([toolName, usageCount]) => ({
      toolName,
      usageCount,
      avgExecutionTime: 0 // TODO: Track this in metrics
    }))
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 10) // Top 10

  return tools
}

/**
 * Aggregate top accounts from daily metrics
 */
function aggregateTopAccounts(
  dailyMetrics: AggregatedMetrics[]
): Array<{ accountId: string; queryCount: number }> {
  const accountsMap = new Map<string, number>()

  for (const metric of dailyMetrics) {
    for (const [account, count] of Object.entries(metric.accountsQueried)) {
      accountsMap.set(account, (accountsMap.get(account) || 0) + count)
    }
  }

  // Convert to array and sort by usage
  const accounts = Array.from(accountsMap.entries())
    .map(([accountId, queryCount]) => ({
      accountId,
      queryCount
    }))
    .sort((a, b) => b.queryCount - a.queryCount)
    .slice(0, 10) // Top 10

  return accounts
}

/**
 * Build hourly stats from daily metrics
 */
function buildHourlyStats(
  dailyMetrics: AggregatedMetrics[],
  days: number
): Array<{ hour: string; queryCount: number; completionRate: number; avgDuration: number }> {
  // For daily data, we'll approximate by distributing across hours
  // In production, you'd want to store hourly breakdowns
  const hourlyStats: Array<{
    hour: string
    queryCount: number
    completionRate: number
    avgDuration: number
  }> = []

  for (const metric of dailyMetrics) {
    // Create one entry per day (approximation)
    hourlyStats.push({
      hour: metric.metricDate + 'T12:00:00Z',
      queryCount: metric.totalQueries,
      completionRate: metric.completionRate,
      avgDuration: metric.avgDurationMs
    })
  }

  return hourlyStats
}

/**
 * Generate array of date strings between start and end (inclusive)
 */
function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = []
  const current = new Date(startDate)
  const end = new Date(endDate)

  while (current <= end) {
    dates.push(current.toISOString().split('T')[0])
    current.setDate(current.getDate() + 1)
  }

  return dates
}
