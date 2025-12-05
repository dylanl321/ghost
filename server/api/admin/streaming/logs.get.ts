/**
 * GET /api/admin/streaming/logs
 *
 * Fetch Strands ECS CloudWatch logs
 * Supports filtering by time range, container, and search patterns
 */

import { defineEventHandler, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import {
  getStrandsLogs,
  formatLogEvent,
  listStrandsLogGroups,
  getStrandsLogConfig,
  type StrandsLogQuery
} from '../../../utils/strands-cloudwatch-logs'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  try {
    const query = getQuery(event)

    // Parse query parameters
    const startTime = query.startTime
      ? parseInt(query.startTime as string)
      : Date.now() - 3600000 // Default: last 1 hour

    const endTime = query.endTime
      ? parseInt(query.endTime as string)
      : Date.now()

    const filterPattern = query.filterPattern as string | undefined
    const limit = query.limit ? parseInt(query.limit as string) : 500
    const containers = query.containers
      ? (query.containers as string).split(',')
      : ['agent'] // Default to agent container only

    // Build log query
    const logQuery: StrandsLogQuery = {
      startTime,
      endTime,
      filterPattern,
      limit,
      containers
    }

    // Fetch logs
    logger.info('[Streaming Logs] Fetching logs with query:', logQuery)
    const rawLogs = await getStrandsLogs(logQuery)

    // Format logs for display
    const formattedLogs = rawLogs.map(formatLogEvent)

    // Get config for debugging
    const config = getStrandsLogConfig()

    return {
      success: true,
      logs: formattedLogs,
      count: formattedLogs.length,
      query: {
        startTime,
        endTime,
        filterPattern,
        limit,
        containers
      },
      config
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching streaming logs:', error)

    // Check if it's a CloudWatch-specific error with helpful context
    if (error.availableContainers) {
      return {
        success: false,
        error: error.message,
        availableContainers: error.availableContainers
      }
    }

    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch streaming logs'
    })
  }
})
