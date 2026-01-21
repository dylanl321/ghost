/**
 * Admin API: Get CloudWatch Logs from Budget Alert Lambda
 * GET /api/admin/budget-alerts/lambda-logs
 * Returns CloudWatch logs from the budget-alert-system-prod Lambda function
 */

import {
  getBudgetAlertLogs,
  getBudgetAlertLogStreams,
  formatBudgetAlertLogEvent,
  getBudgetAlertLogConfig,
  type BudgetAlertLogQuery,
} from '../../../utils/budget-alert-lambda-logs'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  const query = getQuery(event)

  // Parse query parameters
  const startTime = query.startTime
    ? parseInt(query.startTime as string)
    : Date.now() - 24 * 60 * 60 * 1000 // Default: 24 hours ago
  const endTime = query.endTime
    ? parseInt(query.endTime as string)
    : Date.now()
  const filterPattern = query.filterPattern as string | undefined
  const logStreamNames = query.logStreamNames
    ? (query.logStreamNames as string).split(',')
    : undefined
  const limit = query.limit ? parseInt(query.limit as string) : 500
  const logLevel = (query.logLevel as 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG') || 'ALL'

  try {
    const config = getBudgetAlertLogConfig()
    logger.info(
      `[Admin] Fetching Budget Alert Lambda logs from ${config.logGroup} ` +
      `(${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()})`
    )

    const logQuery: BudgetAlertLogQuery = {
      startTime,
      endTime,
      filterPattern,
      logStreamNames,
      limit,
      logLevel,
    }

    const rawEvents = await getBudgetAlertLogs(logQuery)

    // Format events for display
    const formattedEvents = rawEvents.map(formatBudgetAlertLogEvent)

    logger.info(
      `[Admin] Fetched ${formattedEvents.length} Budget Alert Lambda log events`
    )

    // Additional client-side log level filtering for accuracy
    let filteredEvents = formattedEvents
    if (logLevel && logLevel !== 'ALL') {
      filteredEvents = formattedEvents.filter(
        (event) => event.level === logLevel
      )
    }

    return {
      success: true,
      data: {
        logs: filteredEvents,
        totalCount: filteredEvents.length,
        startTime: new Date(startTime).toISOString(),
        endTime: new Date(endTime).toISOString(),
        config: {
          logGroup: config.logGroup,
          region: config.region,
          accountId: config.accountId,
        },
      },
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching Budget Alert Lambda logs:', error)

    if (error.name === 'LogGroupNotFound') {
      throw createError({
        statusCode: 404,
        message: error.message,
      })
    }

    throw createError({
      statusCode: 500,
      message: `Failed to fetch Budget Alert Lambda logs: ${error.message}`,
    })
  }
})
