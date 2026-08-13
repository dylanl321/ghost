/**
 * GET /api/admin/streaming/users
 *
 * Get streaming metrics grouped by user
 * Returns top users by stream count, avg duration, and error rate
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { scanItems } from '../../../utils/dynamodb'
import type { StreamingMetrics } from '#shared/types/streaming-metrics'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.STREAMING_METRICS_TABLE_NAME || 'ghost-streaming-metrics'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  const query = getQuery(event)
  const period = (query.period as '24h' | '7d' | '30d') || '7d'
  const limit = query.limit ? parseInt(query.limit as string) : 20
  const { startDate, endDate } = getDateRange(period)

  try {
    // Fetch user-level metrics for the period
    // Query all metrics with metricType starting with "user:"
    const result = await scanItems(
      TABLE_NAME,
      'begins_with(#metricType, :userPrefix) AND #metricDate BETWEEN :startDate AND :endDate',
      limit * 10, // Fetch more than limit to allow aggregation
      undefined,
      'govcloud',
      {
        '#metricType': 'metricType',
        '#metricDate': 'metricDate'
      },
      {
        ':userPrefix': 'user:',
        ':startDate': startDate,
        ':endDate': endDate
      }
    )

    const userMetrics = result.items as StreamingMetrics[]

    // Aggregate by user
    const userStatsMap = new Map<
      string,
      {
        userId: string
        streamCount: number
        totalDuration: number
        completedStreams: number
        erroredStreams: number
      }
    >()

    for (const metric of userMetrics) {
      // Extract userId from metricType "user:{userId}"
      const userId = metric.metricType.replace('user:', '')

      const existing = userStatsMap.get(userId) || {
        userId,
        streamCount: 0,
        totalDuration: 0,
        completedStreams: 0,
        erroredStreams: 0
      }

      existing.streamCount += metric.totalStreams
      existing.totalDuration += metric.totalDuration
      existing.completedStreams += metric.completedStreams
      existing.erroredStreams += metric.erroredStreams

      userStatsMap.set(userId, existing)
    }

    // Convert to array and calculate derived metrics
    const topUsers = Array.from(userStatsMap.values())
      .map(user => ({
        userId: user.userId,
        streamCount: user.streamCount,
        avgDuration: user.streamCount > 0 ? user.totalDuration / user.streamCount : 0,
        errorRate: user.streamCount > 0 ? (user.erroredStreams / user.streamCount) * 100 : 0
      }))
      .sort((a, b) => b.streamCount - a.streamCount)
      .slice(0, limit)

    return {
      success: true,
      users: topUsers,
      count: topUsers.length,
      period,
      startDate,
      endDate
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching user streaming metrics:', error)

    if (error.name === 'ResourceNotFoundException' || error.message?.includes('Requested resource not found')) {
      logger.warn(`[Admin] Streaming metrics table ${TABLE_NAME} is not deployed; returning an empty user list`)
      return {
        success: true,
        users: [],
        count: 0,
        period,
        startDate,
        endDate
      }
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch user streaming metrics'
    })
  }
})

/**
 * Get date range based on period
 */
function getDateRange(period: '24h' | '7d' | '30d'): {
  startDate: string
  endDate: string
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

  return { startDate, endDate }
}
