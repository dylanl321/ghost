/**
 * GET /api/support/cloudwatch-logs
 * Search CloudWatch logs with filter patterns across accounts
 */

import { defineEventHandler, getQuery } from 'h3'
import {
  FilterLogEventsCommand,
  type FilteredLogEvent
} from '@aws-sdk/client-cloudwatch-logs'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { getChildAccountLogsClient, defaultLogsRegion } from '../../utils/cloudwatch-logs-client'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'
import { requireAdmin } from '../../utils/user-roles'

export interface CloudWatchLogEntry {
  timestamp: number
  message: string
  logStreamName: string
  eventId?: string
  ingestionTime?: number
  parsedMessage?: Record<string, any>
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'UNKNOWN'
}

export interface CloudWatchLogsResult {
  logs: CloudWatchLogEntry[]
  logGroup: string
  environment: AWSEnvironmentType
  accountId: string
  region: string
  filterPattern?: string
  timeRange: {
    startTime: number
    endTime: number
  }
  hasMore: boolean
  nextToken?: string
}

registerEndpoint('/api/support/cloudwatch-logs', 'GET', {
  summary: 'Search CloudWatch logs',
  description: 'Search CloudWatch logs with filter patterns in a specific log group',
  tags: ['Support Tools'],
  parameters: [
    {
      name: 'logGroup',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'CloudWatch log group name'
    },
    {
      name: 'accountId',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS account ID containing the log group'
    },
    {
      name: 'filterPattern',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'CloudWatch Logs filter pattern (e.g., "ERROR" or "{ $.level = "ERROR" }")'
    },
    {
      name: 'startTime',
      in: 'query',
      required: false,
      schema: { type: 'number' },
      description: 'Start time in Unix milliseconds (default: 24 hours ago)'
    },
    {
      name: 'endTime',
      in: 'query',
      required: false,
      schema: { type: 'number' },
      description: 'End time in Unix milliseconds (default: now)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'number' },
      description: 'Maximum number of log events to return (default: 100, max: 1000)'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: govcloud)'
    },
    {
      name: 'region',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS region (default: us-gov-west-1 for govcloud, us-east-1 for commercial)'
    },
    {
      name: 'nextToken',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Pagination token for fetching more results'
    }
  ],
  responses: {
    200: {
      description: 'CloudWatch logs search results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  logs: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        timestamp: { type: 'number' },
                        message: { type: 'string' },
                        logStreamName: { type: 'string' },
                        level: { type: 'string' }
                      }
                    }
                  },
                  hasMore: { type: 'boolean' },
                  nextToken: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

// Parse log level from message
function parseLogLevel(message: string): CloudWatchLogEntry['level'] {
  const upperMessage = message.toUpperCase()
  if (upperMessage.includes('FATAL') || upperMessage.includes('CRITICAL')) return 'FATAL'
  if (upperMessage.includes('ERROR')) return 'ERROR'
  if (upperMessage.includes('WARN')) return 'WARN'
  if (upperMessage.includes('INFO')) return 'INFO'
  if (upperMessage.includes('DEBUG') || upperMessage.includes('TRACE')) return 'DEBUG'
  return 'UNKNOWN'
}

// Try to parse JSON from message
function tryParseJSON(message: string): Record<string, any> | undefined {
  try {
    // Check if message starts with { or [
    const trimmed = message.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return JSON.parse(trimmed)
    }
    return undefined
  } catch {
    return undefined
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)

  // Required parameters
  const logGroup = query.logGroup as string
  const accountId = query.accountId as string

  if (!logGroup) {
    return errors.badRequest(event, 'logGroup is required')
  }

  if (!accountId || !/^\d{12}$/.test(accountId)) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
  }

  // Optional parameters with defaults
  const environment = (query.environment as AWSEnvironmentType) || 'govcloud'
  const region = (query.region as string) || defaultLogsRegion(environment)
  const filterPattern = query.filterPattern as string | undefined
  const limit = Math.min(parseInt(query.limit as string) || 100, 1000)
  const nextToken = query.nextToken as string | undefined

  // Time range defaults to last 24 hours
  const now = Date.now()
  const defaultStartTime = now - 24 * 60 * 60 * 1000
  const startTime = parseInt(query.startTime as string) || defaultStartTime
  const endTime = parseInt(query.endTime as string) || now

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  // Validate time range
  if (startTime >= endTime) {
    return errors.badRequest(event, 'startTime must be before endTime')
  }

  logger.info(`[CloudWatch Logs] Searching ${logGroup} in ${accountId} (${environment}/${region})`)
  logger.info(`[CloudWatch Logs] Filter: "${filterPattern || 'none'}", Time: ${new Date(startTime).toISOString()} to ${new Date(endTime).toISOString()}`)

  try {
    const client = await getChildAccountLogsClient(environment, accountId, region)

    const command = new FilterLogEventsCommand({
      logGroupName: logGroup,
      startTime,
      endTime,
      filterPattern: filterPattern || undefined,
      limit,
      nextToken
    })

    const response = await client.send(command)
    const events = response.events || []

    // Transform events to our format
    const logs: CloudWatchLogEntry[] = events.map((evt: FilteredLogEvent) => {
      const parsed = tryParseJSON(evt.message || '')

      return {
        timestamp: evt.timestamp || 0,
        message: evt.message || '',
        logStreamName: evt.logStreamName || '',
        eventId: evt.eventId,
        ingestionTime: evt.ingestionTime,
        parsedMessage: parsed,
        level: parsed?.level ? (parsed.level.toUpperCase() as CloudWatchLogEntry['level']) : parseLogLevel(evt.message || '')
      }
    })

    logger.info(`[CloudWatch Logs] Found ${logs.length} log events, hasMore: ${!!response.nextToken}`)

    const result: CloudWatchLogsResult = {
      logs,
      logGroup,
      environment,
      accountId,
      region,
      filterPattern,
      timeRange: {
        startTime,
        endTime
      },
      hasMore: !!response.nextToken,
      nextToken: response.nextToken
    }

    return sendSuccess(event, result)

  } catch (error: any) {
    logger.error(`[CloudWatch Logs] Error searching logs:`, error)

    // Handle specific AWS errors
    if ((error instanceof Error ? error.name : "Error") === 'ResourceNotFoundException') {
      return errors.notFound(event, `Log group "${logGroup}" not found in account ${accountId}`)
    }

    if ((error instanceof Error ? error.name : "Error") === 'AccessDeniedException') {
      return errors.forbidden(event, `Access denied to log group "${logGroup}" in account ${accountId}`)
    }

    if ((error instanceof Error ? error.name : "Error") === 'InvalidParameterException') {
      return errors.badRequest(event, `Invalid filter pattern: ${(error instanceof Error ? error.message : String(error))}`)
    }

    return errors.awsError(event, error)
  }
}))
