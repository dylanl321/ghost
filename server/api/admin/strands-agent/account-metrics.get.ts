/**
 * GET /api/admin/strands-agent/account-metrics
 *
 * Get Strands agent metrics for a specific AWS account
 * Shows all queries executed against that account
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { queryItems } from '../../../utils/dynamodb'
import type {
  StrandsMetric,
  StrandsMetricsQueryResponse
} from '~/shared/types/strands-agent-metrics'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.STRANDS_AGENT_METRICS_TABLE_NAME || 'strands-agent-metrics-prod'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const accountId = query.accountId as string
    const limit = query.limit ? parseInt(query.limit as string) : 100
    const nextToken = query.nextToken as string | undefined

    if (!accountId) {
      throw createError({
        statusCode: 400,
        message: 'accountId parameter is required'
      })
    }

    // Query metrics for this account using account-index
    const result = await queryItems(
      {
        tableName: TABLE_NAME,
        indexName: 'account-index',
        queryExpression: 'account_id = :aid',
        expressionAttributeValues: {
          ':aid': accountId
        },
        scanIndexForward: false, // Descending order (most recent first)
        limit,
        nextToken
      },
      'govcloud'
    )

    const metrics = result.items as StrandsMetric[]

    return {
      success: true,
      metrics,
      count: metrics.length,
      nextToken: result.nextToken
    } as StrandsMetricsQueryResponse
  } catch (error: any) {
    logger.error('[Admin] Error fetching account metrics:', error)

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch account metrics'
    })
  }
})
