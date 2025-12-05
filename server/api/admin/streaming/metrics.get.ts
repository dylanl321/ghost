/**
 * GET /api/admin/streaming/metrics
 *
 * Get aggregated streaming metrics for the admin dashboard
 * Supports querying by time period (24h, 7d, 30d)
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { getMetrics, getMetricsRange } from '../../../utils/streaming-metrics-collector'
import { queryItems } from '../../../utils/dynamodb'
import type {
  StreamingDashboardMetrics,
  StreamingMetrics
} from '~/shared/types/streaming-metrics'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.STREAMING_METRICS_TABLE_NAME || 'ghost-streaming-metrics'

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
async function fetchDailyMetrics(startDate: string, endDate: string): Promise<StreamingMetrics[]> {
  const dates = generateDateRange(startDate, endDate)

  const promises = dates.map(date => getMetrics(date, 'daily'))
  const results = await Promise.all(promises)

  return results.filter(Boolean) as StreamingMetrics[]
}

/**
 * Calculate dashboard metrics from daily metrics
 */
function calculateDashboardMetrics(
  dailyMetrics: StreamingMetrics[],
  period: '24h' | '7d' | '30d',
  startDate: string,
  endDate: string,
  days: number
): StreamingDashboardMetrics {
  // Sum up totals
  const totalStreams = dailyMetrics.reduce((sum, m) => sum + m.totalStreams, 0)
  const completedStreams = dailyMetrics.reduce((sum, m) => sum + m.completedStreams, 0)
  const erroredStreams = dailyMetrics.reduce((sum, m) => sum + m.erroredStreams, 0)
  const timeoutStreams = dailyMetrics.reduce((sum, m) => sum + m.timeoutStreams, 0)
  const reconnectStreams = dailyMetrics.reduce((sum, m) => sum + m.reconnectStreams, 0)

  // Calculate average duration across all streams
  const totalDuration = dailyMetrics.reduce((sum, m) => sum + m.totalDuration, 0)
  const avgDuration = totalStreams > 0 ? totalDuration / totalStreams : 0

  // Calculate percentile durations (approximation from daily data)
  const allDurations = dailyMetrics.flatMap(m => [m.minDuration, m.avgDuration, m.maxDuration])
  allDurations.sort((a, b) => a - b)

  const p50Duration = allDurations[Math.floor(allDurations.length * 0.5)] || 0
  const p95Duration = allDurations[Math.floor(allDurations.length * 0.95)] || 0
  const p99Duration = allDurations[Math.floor(allDurations.length * 0.99)] || 0

  // Calculate rates
  const completionRate = totalStreams > 0 ? (completedStreams / totalStreams) * 100 : 0
  const errorRate = totalStreams > 0 ? (erroredStreams / totalStreams) * 100 : 0
  const timeoutRate = totalStreams > 0 ? (timeoutStreams / totalStreams) * 100 : 0
  const reconnectSuccessRate = reconnectStreams > 0 ? (reconnectStreams / totalStreams) * 100 : 0

  // Calculate average events per stream
  const totalStatusEvents = dailyMetrics.reduce((sum, m) => sum + m.statusEvents, 0)
  const totalToolCallEvents = dailyMetrics.reduce((sum, m) => sum + m.toolCallEvents, 0)
  const totalResponseEvents = dailyMetrics.reduce((sum, m) => sum + m.responseEvents, 0)

  const avgEventsPerStream = totalStreams > 0
    ? (totalStatusEvents + totalToolCallEvents + totalResponseEvents) / totalStreams
    : 0
  const avgToolCallsPerStream = totalStreams > 0 ? totalToolCallEvents / totalStreams : 0

  // Aggregate tools used
  const topTools = aggregateTopTools(dailyMetrics)

  // Build hourly stats for charts (approximation from daily data)
  const hourlyStats = buildHourlyStats(dailyMetrics, days)

  return {
    period,
    startDate,
    endDate,
    totalStreams,
    activeStreams: 0, // Will be populated by active streams endpoint
    completedStreams,
    erroredStreams,
    avgDuration,
    p50Duration,
    p95Duration,
    p99Duration,
    completionRate,
    errorRate,
    timeoutRate,
    reconnectSuccessRate,
    avgEventsPerStream,
    avgToolCallsPerStream,
    topUsers: [], // Will be populated separately if needed
    topAccounts: [], // Will be populated separately if needed
    topTools,
    recentErrors: [], // Will be populated by logs endpoint
    hourlyStats
  }
}

/**
 * Aggregate top tools from daily metrics
 */
function aggregateTopTools(
  dailyMetrics: StreamingMetrics[]
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
 * Build hourly stats from daily metrics
 */
function buildHourlyStats(
  dailyMetrics: StreamingMetrics[],
  days: number
): Array<{ hour: string; streamCount: number; completionRate: number; avgDuration: number }> {
  // For daily data, we'll approximate by distributing across hours
  // In production, you'd want to store hourly breakdowns
  const hourlyStats: Array<{
    hour: string
    streamCount: number
    completionRate: number
    avgDuration: number
  }> = []

  for (const metric of dailyMetrics) {
    // Create one entry per day (approximation)
    hourlyStats.push({
      hour: metric.metricDate + 'T12:00:00Z',
      streamCount: metric.totalStreams,
      completionRate: metric.completionRate,
      avgDuration: metric.avgDuration
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
