/**
 * Budget Alert Lambda CloudWatch Logs Utility
 *
 * Provides functions for fetching CloudWatch logs from the budget alert Lambda
 * function in Commercial AWS. Used by admin views for monitoring and debugging.
 */

import type { FilteredLogEvent, LogStream } from '@aws-sdk/client-cloudwatch-logs'
import {
  CloudWatchLogsClient,
  FilterLogEventsCommand,
  DescribeLogStreamsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import { logger } from './logger'
import { assumeChildAccountRole } from './credentials/awsAccountCredentials'
import { PROFORMA_ACCOUNT_ID } from '../lib/dynamodb-config'

// Budget Alert Lambda configuration
const BUDGET_ALERT_LOG_GROUP = process.env.BUDGET_ALERT_LOG_GROUP || '/aws/lambda/budget-alert-system-prod'
const COMMERCIAL_REGION = process.env.AWS_COMMERCIAL_REGION || 'us-east-1'

// Cache the CloudWatch Logs client
let budgetAlertLogsClient: CloudWatchLogsClient | null = null
let clientExpiration: Date | null = null

/**
 * Initialize CloudWatch Logs client for budget alert Lambda
 */
async function initBudgetAlertLogsClient(): Promise<CloudWatchLogsClient> {
  // Return cached client if still valid
  if (budgetAlertLogsClient && clientExpiration && clientExpiration > new Date()) {
    return budgetAlertLogsClient
  }

  try {
    // Get credentials for the proforma account where the Lambda runs
    const credentials = await assumeChildAccountRole('commercial', PROFORMA_ACCOUNT_ID)

    budgetAlertLogsClient = new CloudWatchLogsClient({
      region: COMMERCIAL_REGION,
      credentials: {
        accessKeyId: credentials.accessKeyId!,
        secretAccessKey: credentials.secretAccessKey!,
        sessionToken: credentials.sessionToken,
      },
    })

    // Set expiration to 50 minutes (credentials typically last 1 hour)
    clientExpiration = new Date(Date.now() + 50 * 60 * 1000)

    return budgetAlertLogsClient
  } catch (error) {
    logger.error('[Budget Alert Logs] Error initializing CloudWatch Logs client:', error)
    throw error
  }
}

/**
 * Refresh the CloudWatch client (for expired credentials)
 */
async function refreshBudgetAlertLogsClient(): Promise<void> {
  budgetAlertLogsClient = null
  clientExpiration = null
  await initBudgetAlertLogsClient()
}

/**
 * Query options for Lambda logs
 */
export interface BudgetAlertLogQuery {
  startTime?: number // Unix timestamp in milliseconds
  endTime?: number // Unix timestamp in milliseconds
  filterPattern?: string // CloudWatch Logs filter pattern
  logStreamNames?: string[] // Specific log streams to query
  limit?: number // Max number of events to return
  logLevel?: 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'DEBUG'
}

/**
 * Formatted log event for display
 */
export interface FormattedLogEvent {
  timestamp: number
  timestampFormatted: string
  logStreamName: string
  message: string
  eventId: string
  level: string
  parsedJSON: any | null
  isJSON: boolean
  invocationId?: string
}

/**
 * Get Lambda execution log streams (sorted by most recent)
 */
export async function getBudgetAlertLogStreams(limit: number = 50): Promise<LogStream[]> {
  try {
    const client = await initBudgetAlertLogsClient()

    const allStreams: LogStream[] = []
    let nextToken: string | undefined

    do {
      const command = new DescribeLogStreamsCommand({
        logGroupName: BUDGET_ALERT_LOG_GROUP,
        orderBy: 'LastEventTime',
        descending: true,
        limit: Math.min(limit, 50),
        nextToken,
      })

      try {
        const response = await client.send(command)
        allStreams.push(...(response.logStreams ?? []))
        nextToken = response.nextToken

        if (allStreams.length >= limit) {
          break
        }
      } catch (error: any) {
        if (
          (error instanceof Error ? error.name : "Error") === 'ExpiredTokenException' ||
          (error instanceof Error ? error.message : String(error))?.includes('security token included in the request is expired')
        ) {
          logger.warn('[Budget Alert Logs] Security token expired. Refreshing...')
          await refreshBudgetAlertLogsClient()
          const retryClient = await initBudgetAlertLogsClient()
          const response = await retryClient.send(command)
          allStreams.push(...(response.logStreams ?? []))
          nextToken = response.nextToken
        } else {
          throw error
        }
      }
    } while (nextToken && allStreams.length < limit)

    return allStreams.slice(0, limit)
  } catch (error) {
    logger.error('[Budget Alert Logs] Error fetching log streams:', error)
    throw error
  }
}

/**
 * Get logs from the budget alert Lambda function
 */
export async function getBudgetAlertLogs(
  query: BudgetAlertLogQuery = {}
): Promise<FilteredLogEvent[]> {
  try {
    const client = await initBudgetAlertLogsClient()

    // Default to last 24 hours if no time range specified
    const startTime = query.startTime || Date.now() - 24 * 60 * 60 * 1000
    const endTime = query.endTime || Date.now()

    // Build filter pattern based on log level
    let filterPattern = query.filterPattern || ''
    if (query.logLevel && query.logLevel !== 'ALL') {
      const levelPatterns: Record<string, string> = {
        'ERROR': '?ERROR ?error ?Error',
        'WARN': '?WARN ?warn ?Warn ?WARNING ?warning',
        'INFO': '?INFO ?info ?Info',
        'DEBUG': '?DEBUG ?debug ?Debug'
      }
      const levelFilter = levelPatterns[query.logLevel]
      if (levelFilter) {
        filterPattern = filterPattern ? `${filterPattern} ${levelFilter}` : levelFilter
      }
    }

    const allEvents: FilteredLogEvent[] = []
    let nextToken: string | undefined
    const limit = query.limit || 1000

    do {
      const command = new FilterLogEventsCommand({
        logGroupName: BUDGET_ALERT_LOG_GROUP,
        startTime,
        endTime,
        filterPattern: filterPattern || undefined,
        logStreamNames: query.logStreamNames,
        nextToken,
        limit: Math.min(limit - allEvents.length, 10000),
      })

      try {
        const response = await client.send(command)
        allEvents.push(...(response.events ?? []))
        nextToken = response.nextToken

        if (allEvents.length >= limit) {
          break
        }
      } catch (error: any) {
        if (
          (error instanceof Error ? error.name : "Error") === 'ExpiredTokenException' ||
          (error instanceof Error ? error.message : String(error))?.includes('security token included in the request is expired')
        ) {
          logger.warn('[Budget Alert Logs] Security token expired. Refreshing...')
          await refreshBudgetAlertLogsClient()
          const retryClient = await initBudgetAlertLogsClient()
          const response = await retryClient.send(command)
          allEvents.push(...(response.events ?? []))
          nextToken = response.nextToken
        } else {
          throw error
        }
      }
    } while (nextToken && allEvents.length < limit)

    // Sort by timestamp descending (most recent first)
    return allEvents.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0))
  } catch (error: any) {
    logger.error('[Budget Alert Logs] Error fetching logs:', error)

    if (
      (error instanceof Error ? error.name : "Error") === 'ResourceNotFoundException' ||
      (error instanceof Error ? error.message : String(error))?.includes('log group does not exist')
    ) {
      const enhancedError: any = new Error(
        `Log group "${BUDGET_ALERT_LOG_GROUP}" not found. ` +
        `The budget alert Lambda may not have been invoked yet or the log group name is incorrect.`
      )
      enhancedError.name = 'LogGroupNotFound'
      throw enhancedError
    }

    throw error
  }
}

/**
 * Parse log level from log message
 */
export function parseBudgetAlertLogLevel(message: string): string {
  const upperMessage = message.toUpperCase()
  if (upperMessage.includes('ERROR')) return 'ERROR'
  if (upperMessage.includes('WARN')) return 'WARN'
  if (upperMessage.includes('INFO')) return 'INFO'
  if (upperMessage.includes('DEBUG')) return 'DEBUG'
  return 'INFO'
}

/**
 * Try to parse JSON from log message
 */
export function tryParseBudgetAlertJSON(message: string): any {
  try {
    // Try to find JSON in the message (Lambda logs often have prefixes)
    const jsonMatch = message.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    return null
  } catch {
    return null
  }
}

/**
 * Extract Lambda invocation ID from log stream name or message
 */
function extractInvocationId(logStreamName?: string, message?: string): string | undefined {
  // Lambda log stream names are like: 2024/01/15/[$LATEST]abc123...
  if (logStreamName) {
    const match = logStreamName.match(/\[\$LATEST\]([a-f0-9]+)/i)
    if (match) return match[1].substring(0, 8)
  }
  // Also check message for request ID
  if (message) {
    const match = message.match(/RequestId:\s*([a-f0-9-]+)/i)
    if (match) return match[1].substring(0, 8)
  }
  return undefined
}

/**
 * Format log event for display
 */
export function formatBudgetAlertLogEvent(event: FilteredLogEvent): FormattedLogEvent {
  const parsedJSON = tryParseBudgetAlertJSON(event.message || '')
  const timestamp = event.timestamp || Date.now()

  return {
    timestamp,
    timestampFormatted: new Date(timestamp).toISOString(),
    logStreamName: event.logStreamName || '',
    message: event.message || '',
    eventId: event.eventId || '',
    level: parseBudgetAlertLogLevel(event.message || ''),
    parsedJSON,
    isJSON: !!parsedJSON,
    invocationId: extractInvocationId(event.logStreamName, event.message),
  }
}

/**
 * Get configuration for the budget alert logs
 */
export function getBudgetAlertLogConfig() {
  return {
    logGroup: BUDGET_ALERT_LOG_GROUP,
    region: COMMERCIAL_REGION,
    accountId: PROFORMA_ACCOUNT_ID,
    environment: 'commercial' as const,
  }
}

/**
 * Get logs grouped by Lambda invocation (log stream)
 * Useful for viewing complete execution traces
 */
export async function getBudgetAlertLogsByInvocation(
  query: BudgetAlertLogQuery = {}
): Promise<{ invocationId: string; events: FormattedLogEvent[] }[]> {
  const events = await getBudgetAlertLogs(query)
  const formattedEvents = events.map(formatBudgetAlertLogEvent)

  // Group by log stream (which corresponds to Lambda invocation)
  const grouped = new Map<string, FormattedLogEvent[]>()

  for (const event of formattedEvents) {
    const key = event.logStreamName
    if (!grouped.has(key)) {
      grouped.set(key, [])
    }
    grouped.get(key)!.push(event)
  }

  // Convert to array and sort by most recent invocation first
  return Array.from(grouped.entries())
    .map(([invocationId, events]) => ({
      invocationId,
      events: events.sort((a, b) => a.timestamp - b.timestamp), // Chronological within invocation
    }))
    .sort((a, b) => {
      // Sort invocations by their most recent event
      const aLatest = Math.max(...a.events.map(e => e.timestamp))
      const bLatest = Math.max(...b.events.map(e => e.timestamp))
      return bLatest - aLatest
    })
}
