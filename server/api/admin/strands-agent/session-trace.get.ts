/**
 * GET /api/admin/strands-agent/session-trace
 *
 * Get all agent metrics for a specific GHOST session
 * Provides end-to-end trace of backend execution
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { queryItems } from '../../../utils/dynamodb'
import type {
  StrandsMetric,
  SessionTrace,
  SessionTraceResponse
} from '~/shared/types/strands-agent-metrics'
import { logger } from '../../../utils/logger'

const TABLE_NAME = process.env.STRANDS_AGENT_METRICS_TABLE_NAME || 'strands-agent-metrics-prod'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const sessionId = query.sessionId as string

    if (!sessionId) {
      throw createError({
        statusCode: 400,
        message: 'sessionId parameter is required'
      })
    }

    // Query all metrics for this session using session-index
    const result = await queryItems(
      {
        tableName: TABLE_NAME,
        indexName: 'session-index',
        queryExpression: 'session_id = :sid',
        expressionAttributeValues: {
          ':sid': sessionId
        },
        scanIndexForward: true // Ascending order (chronological)
      },
      'govcloud'
    )

    const metrics = result.items as StrandsMetric[]

    // Build summary
    const queryMetrics = metrics.filter(m => m.metric_type === 'query')
    const errorMetrics = metrics.filter(m => m.metric_type === 'error')

    const totalQueries = queryMetrics.length
    const successfulQueries = queryMetrics.filter(m => (m as any).success).length
    const failedQueries = totalQueries - successfulQueries

    const totalExecutionTime = queryMetrics.reduce(
      (sum, m) => sum + ((m as any).execution_time_ms || 0),
      0
    )

    // Extract unique values
    const toolsUsed = Array.from(
      new Set(
        queryMetrics.flatMap(m => (m as any).tools_used || [])
      )
    )

    const accountsAccessed = Array.from(
      new Set(
        queryMetrics.map(m => (m as any).account_alias).filter(Boolean)
      )
    )

    const mcpsUsed = Array.from(
      new Set(
        queryMetrics.map(m => (m as any).mcp_id).filter(Boolean)
      )
    )

    const errors = errorMetrics.map(m => ({
      errorType: (m as any).error_type,
      errorMessage: (m as any).error_message,
      errorStep: (m as any).error_step,
      timestamp: m.timestamp
    }))

    const trace: SessionTrace = {
      sessionId,
      metrics,
      summary: {
        totalQueries,
        successfulQueries,
        failedQueries,
        totalExecutionTime,
        toolsUsed,
        accountsAccessed,
        mcpsUsed,
        errors
      }
    }

    return {
      success: true,
      trace
    } as SessionTraceResponse
  } catch (error: any) {
    logger.error('[Admin] Error fetching session trace:', error)

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch session trace'
    })
  }
})
