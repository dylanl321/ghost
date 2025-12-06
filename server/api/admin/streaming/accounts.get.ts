/**
 * GET /api/admin/streaming/accounts
 *
 * Get streaming metrics grouped by AWS account
 * Returns top accounts by stream count and avg duration
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { scanItems } from '../../../utils/dynamodb'
import type { StreamingMetrics } from '~/shared/types/streaming-metrics'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.STREAMING_METRICS_TABLE_NAME || 'ghost-streaming-metrics'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const period = (query.period as '24h' | '7d' | '30d') || '7d'
    const limit = query.limit ? parseInt(query.limit as string) : 20

    // Calculate date range
    const { startDate, endDate } = getDateRange(period)

    // Fetch account-level metrics for the period
    // Query all metrics with metricType starting with "account:"
    const result = await scanItems(
      TABLE_NAME,
      'begins_with(#metricType, :accountPrefix) AND #metricDate BETWEEN :startDate AND :endDate',
      limit * 10, // Fetch more than limit to allow aggregation
      undefined,
      'govcloud',
      {
        '#metricType': 'metricType',
        '#metricDate': 'metricDate'
      },
      {
        ':accountPrefix': 'account:',
        ':startDate': startDate,
        ':endDate': endDate
      }
    )

    const accountMetrics = result.items as StreamingMetrics[]

    // Aggregate by account
    const accountStatsMap = new Map<
      string,
      {
        accountId: string
        streamCount: number
        totalDuration: number
      }
    >()

    for (const metric of accountMetrics) {
      // Extract accountId from metricType "account:{accountId}"
      const accountId = metric.metricType.replace('account:', '')

      const existing = accountStatsMap.get(accountId) || {
        accountId,
        streamCount: 0,
        totalDuration: 0
      }

      existing.streamCount += metric.totalStreams
      existing.totalDuration += metric.totalDuration

      accountStatsMap.set(accountId, existing)
    }

    // Convert to array and calculate derived metrics
    const topAccounts = Array.from(accountStatsMap.values())
      .map(account => ({
        accountId: account.accountId,
        streamCount: account.streamCount,
        avgDuration: account.streamCount > 0 ? account.totalDuration / account.streamCount : 0
      }))
      .sort((a, b) => b.streamCount - a.streamCount)
      .slice(0, limit)

    return {
      success: true,
      accounts: topAccounts,
      count: topAccounts.length,
      period,
      startDate,
      endDate
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching account streaming metrics:', error)

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch account streaming metrics'
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
