/**
 * Admin API: Get Log Streams from Budget Alert Lambda
 * GET /api/admin/budget-alerts/lambda-log-streams
 * Returns list of log streams (Lambda invocations) for the budget alert Lambda
 */

import {
  getBudgetAlertLogStreams,
  getBudgetAlertLogConfig,
} from '../../../utils/budget-alert-lambda-logs'
import { requireAdmin } from '../../../utils/user-roles'

export default defineEventHandler(async (event) => {
  // Require admin access
  await requireAdmin(event)

  const query = getQuery(event)
  const limit = query.limit ? parseInt(query.limit as string) : 50

  try {
    const config = getBudgetAlertLogConfig()
    logger.info(
      `[Admin] Fetching Budget Alert Lambda log streams from ${config.logGroup}`
    )

    const streams = await getBudgetAlertLogStreams(limit)

    // Format streams for display
    const formattedStreams = streams.map((stream) => ({
      logStreamName: stream.logStreamName,
      creationTime: stream.creationTime
        ? new Date(stream.creationTime).toISOString()
        : null,
      firstEventTimestamp: stream.firstEventTimestamp
        ? new Date(stream.firstEventTimestamp).toISOString()
        : null,
      lastEventTimestamp: stream.lastEventTimestamp
        ? new Date(stream.lastEventTimestamp).toISOString()
        : null,
      lastIngestionTime: stream.lastIngestionTime
        ? new Date(stream.lastIngestionTime).toISOString()
        : null,
      storedBytes: stream.storedBytes,
    }))

    logger.info(
      `[Admin] Fetched ${formattedStreams.length} Budget Alert Lambda log streams`
    )

    return {
      success: true,
      data: {
        streams: formattedStreams,
        totalCount: formattedStreams.length,
        config: {
          logGroup: config.logGroup,
          region: config.region,
          accountId: config.accountId,
        },
      },
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching Budget Alert Lambda log streams:', error)

    throw createError({
      statusCode: 500,
      message: `Failed to fetch Budget Alert Lambda log streams: ${error.message}`,
    })
  }
})
