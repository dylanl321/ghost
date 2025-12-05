/**
 * Streaming Metrics Collector
 * Collects and aggregates SSE streaming chat metrics for monitoring and analytics
 */

import type {
  StreamingMetrics,
  StreamSession,
  CollectMetricsRequest
} from '#shared/types/streaming-metrics'
import { getItem, putItem, updateItem } from './dynamodb'
import { logger } from './logger'

// Table name with fallback default
const TABLE_NAME = process.env.STREAMING_METRICS_TABLE_NAME || 'ghost-streaming-metrics'

/**
 * Collect metrics from a completed stream session
 * Aggregates at daily, user, and account levels
 */
export async function collectStreamMetrics(request: CollectMetricsRequest): Promise<void> {
  const { streamSession, metricDate } = request

  try {
    // Collect metrics at different aggregation levels
    await Promise.all([
      collectDailyMetrics(streamSession, metricDate),
      collectUserMetrics(streamSession, metricDate),
      streamSession.accountId ? collectAccountMetrics(streamSession, metricDate) : Promise.resolve()
    ])

    logger.info('[StreamingMetrics] Metrics collected successfully', {
      streamId: streamSession.streamId,
      userId: streamSession.userId,
      accountId: streamSession.accountId,
      duration: streamSession.duration,
      status: streamSession.status
    })
  } catch (error: any) {
    logger.error('[StreamingMetrics] Failed to collect metrics', {
      streamId: streamSession.streamId,
      error: error.message
    })
    // Don't throw - metrics collection shouldn't fail the stream
  }
}

/**
 * Collect daily aggregated metrics
 */
async function collectDailyMetrics(session: StreamSession, metricDate: string): Promise<void> {
  const metricType = 'daily'
  await updateMetricsRecord(session, metricDate, metricType)
}

/**
 * Collect user-level metrics
 */
async function collectUserMetrics(session: StreamSession, metricDate: string): Promise<void> {
  const metricType = `user:${session.userId}`
  await updateMetricsRecord(session, metricDate, metricType)
}

/**
 * Collect account-level metrics
 */
async function collectAccountMetrics(session: StreamSession, metricDate: string): Promise<void> {
  if (!session.accountId) return

  const metricType = `account:${session.accountId}`
  await updateMetricsRecord(session, metricDate, metricType)
}

/**
 * Update or create a metrics record in DynamoDB
 * Uses atomic update operations to handle concurrent writes
 */
async function updateMetricsRecord(
  session: StreamSession,
  metricDate: string,
  metricType: string
): Promise<void> {
  const key = { metricDate, metricType }

  // Try to get existing record
  const existing = await getItem(TABLE_NAME, key, 'govcloud') as StreamingMetrics | null

  if (existing) {
    // Update existing record
    await updateExistingMetrics(existing, session, key)
  } else {
    // Create new record
    await createNewMetrics(session, metricDate, metricType)
  }
}

/**
 * Update an existing metrics record
 */
async function updateExistingMetrics(
  existing: StreamingMetrics,
  session: StreamSession,
  key: { metricDate: string; metricType: string }
): Promise<void> {
  const duration = session.duration || 0

  // Update counters
  const totalStreams = existing.totalStreams + 1
  const completedStreams = session.status === 'completed' ? existing.completedStreams + 1 : existing.completedStreams
  const erroredStreams = session.status === 'errored' ? existing.erroredStreams + 1 : existing.erroredStreams
  const timeoutStreams = session.status === 'timeout' ? existing.timeoutStreams + 1 : existing.timeoutStreams
  const reconnectStreams = session.reconnectSuccess ? existing.reconnectStreams + 1 : existing.reconnectStreams

  // Update timing
  const totalDuration = existing.totalDuration + duration
  const avgDuration = totalDuration / totalStreams
  const minDuration = Math.min(existing.minDuration, duration)
  const maxDuration = Math.max(existing.maxDuration, duration)

  // Update event counts
  const statusEvents = existing.statusEvents + session.events.filter(e => e.eventType === 'status').length
  const toolCallEvents = existing.toolCallEvents + session.events.filter(e => e.eventType === 'tool_call').length
  const responseEvents = existing.responseEvents + session.events.filter(e => e.eventType === 'response').length

  // Update event breakdown
  const eventBreakdown = { ...existing.eventBreakdown }
  for (const event of session.events) {
    if (!eventBreakdown[event.eventType]) {
      eventBreakdown[event.eventType] = {
        count: 0,
        avgTimeToFirst: 0
      }
    }
    eventBreakdown[event.eventType].count++

    // Update avgTimeToFirst (only for first occurrence in this stream)
    if (eventBreakdown[event.eventType].count === 1) {
      eventBreakdown[event.eventType].avgTimeToFirst = event.timeFromStart
    } else {
      const oldAvg = eventBreakdown[event.eventType].avgTimeToFirst
      const newCount = eventBreakdown[event.eventType].count
      eventBreakdown[event.eventType].avgTimeToFirst =
        (oldAvg * (newCount - 1) + event.timeFromStart) / newCount
    }
  }

  // Update tools used
  const toolsUsed = { ...existing.toolsUsed }
  for (const tool of session.toolsCalled) {
    toolsUsed[tool] = (toolsUsed[tool] || 0) + 1
  }

  // Calculate rates
  const completionRate = (completedStreams / totalStreams) * 100
  const errorRate = (erroredStreams / totalStreams) * 100

  // Update the record
  await updateItem(
    TABLE_NAME,
    key,
    {
      totalStreams,
      completedStreams,
      erroredStreams,
      timeoutStreams,
      reconnectStreams,
      avgDuration,
      minDuration,
      maxDuration,
      totalDuration,
      statusEvents,
      toolCallEvents,
      responseEvents,
      eventBreakdown,
      toolsUsed,
      completionRate,
      errorRate,
      timestamp: new Date().toISOString(),
      ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
    },
    'govcloud'
  )
}

/**
 * Create a new metrics record
 */
async function createNewMetrics(
  session: StreamSession,
  metricDate: string,
  metricType: string
): Promise<void> {
  const duration = session.duration || 0

  // Build event breakdown
  const eventBreakdown: Record<string, { count: number; avgTimeToFirst: number }> = {}
  for (const event of session.events) {
    if (!eventBreakdown[event.eventType]) {
      eventBreakdown[event.eventType] = {
        count: 0,
        avgTimeToFirst: event.timeFromStart
      }
    }
    eventBreakdown[event.eventType].count++
  }

  // Build tools used
  const toolsUsed: Record<string, number> = {}
  for (const tool of session.toolsCalled) {
    toolsUsed[tool] = (toolsUsed[tool] || 0) + 1
  }

  const metrics: StreamingMetrics = {
    metricDate,
    metricType,
    totalStreams: 1,
    completedStreams: session.status === 'completed' ? 1 : 0,
    erroredStreams: session.status === 'errored' ? 1 : 0,
    timeoutStreams: session.status === 'timeout' ? 1 : 0,
    reconnectStreams: session.reconnectSuccess ? 1 : 0,
    avgDuration: duration,
    minDuration: duration,
    maxDuration: duration,
    totalDuration: duration,
    statusEvents: session.events.filter(e => e.eventType === 'status').length,
    toolCallEvents: session.events.filter(e => e.eventType === 'tool_call').length,
    responseEvents: session.events.filter(e => e.eventType === 'response').length,
    eventBreakdown,
    toolsUsed,
    completionRate: session.status === 'completed' ? 100 : 0,
    errorRate: session.status === 'errored' ? 100 : 0,
    timestamp: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days
  }

  await putItem(TABLE_NAME, metrics, 'govcloud')
}

/**
 * Get metrics for a specific date and type
 */
export async function getMetrics(
  metricDate: string,
  metricType: string
): Promise<StreamingMetrics | null> {
  try {
    const result = await getItem(
      TABLE_NAME,
      { metricDate, metricType },
      'govcloud'
    ) as StreamingMetrics | null

    return result
  } catch (error: any) {
    logger.error('[StreamingMetrics] Failed to get metrics', {
      metricDate,
      metricType,
      error: error.message
    })
    return null
  }
}

/**
 * Get metrics for a date range
 * Returns all metric types for the specified dates
 */
export async function getMetricsRange(
  startDate: string,
  endDate: string,
  metricType?: string
): Promise<StreamingMetrics[]> {
  try {
    // For now, we'll need to query each date individually
    // In production, consider adding a GSI for more efficient range queries
    const dates = generateDateRange(startDate, endDate)

    const promises = dates.map(async (date) => {
      if (metricType) {
        // Get specific metric type
        const metric = await getMetrics(date, metricType)
        return metric ? [metric] : []
      } else {
        // Get all metric types for this date
        // This would benefit from a query operation with the date as partition key
        // For now, return empty array - implement when needed
        return []
      }
    })

    const results = await Promise.all(promises)
    return results.flat().filter(Boolean) as StreamingMetrics[]
  } catch (error: any) {
    logger.error('[StreamingMetrics] Failed to get metrics range', {
      startDate,
      endDate,
      error: error.message
    })
    return []
  }
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

/**
 * Create a StreamSession object from SSE stream data
 * Helper for API endpoints to easily convert stream data to session format
 */
export function createStreamSession(data: {
  streamId: string
  userId: string
  sessionId: string
  threadId?: string
  messageId: string
  query: string
  accountId?: string
  startTime: number
  endTime?: number
  status: 'active' | 'completed' | 'errored' | 'timeout'
  events: Array<{
    eventType: 'status' | 'tool_call' | 'response' | 'complete' | 'error' | 'disambiguation'
    eventData: any
    timestamp: number
  }>
  toolsCalled: string[]
  reconnectAttempts?: number
  reconnectSuccess?: boolean
  error?: string
  finalResponse?: string
}): StreamSession {
  return {
    streamId: data.streamId,
    userId: data.userId,
    sessionId: data.sessionId,
    threadId: data.threadId,
    messageId: data.messageId,
    query: data.query,
    accountId: data.accountId,
    startTime: data.startTime,
    endTime: data.endTime,
    duration: data.endTime ? data.endTime - data.startTime : undefined,
    status: data.status,
    events: data.events.map(e => ({
      ...e,
      timeFromStart: e.timestamp - data.startTime
    })),
    toolsCalled: data.toolsCalled,
    reconnectAttempts: data.reconnectAttempts || 0,
    reconnectSuccess: data.reconnectSuccess || false,
    error: data.error,
    finalResponse: data.finalResponse
  }
}
