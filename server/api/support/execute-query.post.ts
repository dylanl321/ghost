/**
 * POST /api/support/execute-query
 * Execute AI-generated queries against AWS Config or CloudWatch Logs
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { queryResources, getAggregatorName } from '../../utils/config-service'
import {
  FilterLogEventsCommand,
  type FilteredLogEvent
} from '@aws-sdk/client-cloudwatch-logs'
import { getChildAccountLogsClient } from '../../utils/cloudwatch-logs-client'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'
import { requireAdmin } from '../../utils/user-roles'

interface ExecuteQueryRequest {
  queryType: 'config' | 'cloudwatch'
  query: string
  environment: 'commercial' | 'govcloud'
  accountId?: string      // Required for cloudwatch
  logGroup?: string       // Required for cloudwatch
  startTime?: number
  endTime?: number
  limit?: number
}

interface AttributeSchema {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date'
  label: string
}

interface ExecuteQueryResponse {
  records: Record<string, any>[]
  attributeSchema: AttributeSchema[]
  totalCount: number
  queryType: string
  executionTime: number
}

registerEndpoint('/api/support/execute-query', 'POST', {
  summary: 'Execute AI-generated queries',
  description: 'Execute queries against AWS Config or CloudWatch Logs',
  tags: ['Support Tools'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['queryType', 'query', 'environment'],
          properties: {
            queryType: {
              type: 'string',
              enum: ['config', 'cloudwatch'],
              description: 'Type of query to execute'
            },
            query: {
              type: 'string',
              description: 'The query to execute (Config SQL or CloudWatch filter pattern)'
            },
            environment: {
              type: 'string',
              enum: ['commercial', 'govcloud'],
              description: 'AWS environment'
            },
            accountId: {
              type: 'string',
              description: 'Account ID (required for cloudwatch)'
            },
            logGroup: {
              type: 'string',
              description: 'Log group name (required for cloudwatch)'
            },
            startTime: {
              type: 'number',
              description: 'Start time in Unix milliseconds'
            },
            endTime: {
              type: 'number',
              description: 'End time in Unix milliseconds'
            },
            limit: {
              type: 'number',
              description: 'Maximum number of results (default: 100)'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Query execution results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  records: {
                    type: 'array',
                    items: { type: 'object' }
                  },
                  attributeSchema: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        type: { type: 'string' },
                        label: { type: 'string' }
                      }
                    }
                  },
                  totalCount: { type: 'number' },
                  queryType: { type: 'string' },
                  executionTime: { type: 'number' }
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

// Use centralized getAggregatorName imported from config-service

// Infer attribute schema from records
function inferAttributeSchema(records: Record<string, any>[]): AttributeSchema[] {
  if (records.length === 0) return []

  const schemaMap = new Map<string, AttributeSchema>()

  // Sample first few records to build schema
  const sampleSize = Math.min(records.length, 10)
  for (let i = 0; i < sampleSize; i++) {
    const record = records[i]
    for (const [key, value] of Object.entries(record)) {
      if (!schemaMap.has(key)) {
        schemaMap.set(key, {
          name: key,
          type: inferType(value),
          label: formatLabel(key)
        })
      }
    }
  }

  // Sort by common fields first
  const priority = ['resourceId', 'resourceType', 'accountId', 'region', 'name', 'timestamp', 'message']
  const schema = Array.from(schemaMap.values())
  schema.sort((a, b) => {
    const aPriority = priority.indexOf(a.name)
    const bPriority = priority.indexOf(b.name)
    if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority
    if (aPriority !== -1) return -1
    if (bPriority !== -1) return 1
    return a.name.localeCompare(b.name)
  })

  return schema
}

function inferType(value: any): AttributeSchema['type'] {
  if (value === null || value === undefined) return 'string'
  if (Array.isArray(value)) return 'array'
  if (value instanceof Date) return 'date'
  if (typeof value === 'object') return 'object'
  if (typeof value === 'boolean') return 'boolean'
  if (typeof value === 'number') return 'number'
  // Check if string looks like a date
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return 'date'
  return 'string'
}

function formatLabel(key: string): string {
  // Convert camelCase/snake_case to Title Case
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// Execute Config query
async function executeConfigQuery(
  query: string,
  environment: AWSEnvironmentType,
  limit: number
): Promise<Record<string, any>[]> {
  const aggregator = getAggregatorName(environment)
  logger.info(`[Execute Query] Running Config query on ${aggregator}`)

  const result = await queryResources(aggregator, query, environment, undefined, limit)

  // Parse JSON strings from results
  return result.results.map(item => {
    if (typeof item === 'string') {
      try {
        return JSON.parse(item)
      } catch {
        return { raw: item }
      }
    }
    return item
  })
}

// Execute CloudWatch Logs query
async function executeCloudWatchQuery(
  filterPattern: string,
  environment: AWSEnvironmentType,
  accountId: string,
  logGroup: string,
  startTime: number,
  endTime: number,
  limit: number
): Promise<Record<string, any>[]> {
  logger.info(`[Execute Query] Running CloudWatch query on ${logGroup} in ${accountId}`)

  const client = await getChildAccountLogsClient(environment, accountId)

  const command = new FilterLogEventsCommand({
    logGroupName: logGroup,
    startTime,
    endTime,
    filterPattern: filterPattern || undefined,
    limit
  })

  const response = await client.send(command)
  const events = response.events || []

  return events.map((evt: FilteredLogEvent) => {
    let parsedMessage: Record<string, any> | undefined
    try {
      const trimmed = (evt.message || '').trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        parsedMessage = JSON.parse(trimmed)
      }
    } catch {
      // Not JSON
    }

    return {
      timestamp: evt.timestamp,
      message: evt.message,
      logStreamName: evt.logStreamName,
      eventId: evt.eventId,
      ...(parsedMessage || {})
    }
  })
}

export default defineEventHandler(handleAsync(async (event) => {
  await requireAdmin(event)

  const body = await readBody<ExecuteQueryRequest>(event)

  // Validate required fields
  if (!body.queryType) {
    return errors.badRequest(event, 'queryType is required')
  }

  if (!body.query) {
    return errors.badRequest(event, 'query is required')
  }

  if (!body.environment) {
    return errors.badRequest(event, 'environment is required')
  }

  if (body.environment !== 'commercial' && body.environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }
  if (body.accountId !== undefined && !/^\d{12}$/.test(String(body.accountId))) {
    return errors.badRequest(event, 'accountId must be a 12-digit AWS account ID')
  }

  const environment = body.environment as AWSEnvironmentType
  const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500)
  const startTime = body.startTime || Date.now() - 24 * 60 * 60 * 1000 // Default 24h ago
  const endTime = body.endTime || Date.now()

  logger.info(`[Execute Query] Type: ${body.queryType}, Environment: ${environment}, Limit: ${limit}`)

  const executionStart = Date.now()
  let records: Record<string, any>[] = []

  try {
    switch (body.queryType) {
      case 'config':
        records = await executeConfigQuery(body.query, environment, limit)
        break

      case 'cloudwatch':
        if (!body.accountId) {
          return errors.badRequest(event, 'accountId is required for CloudWatch queries')
        }
        if (!body.logGroup) {
          return errors.badRequest(event, 'logGroup is required for CloudWatch queries')
        }
        records = await executeCloudWatchQuery(
          body.query,
          environment,
          body.accountId,
          body.logGroup,
          startTime,
          endTime,
          limit
        )
        break

      default:
        // There is no CloudTrail query backend here; the old placeholder
        // returned a fake "not implemented" row as if it were a result
        return errors.badRequest(event, String(body.queryType) === 'cloudtrail'
          ? 'CloudTrail queries are not supported here. Use the Access Audit tool for CloudTrail activity.'
          : `Invalid queryType: ${body.queryType}. Must be "config" or "cloudwatch"`)
    }

    const executionTime = Date.now() - executionStart
    const attributeSchema = inferAttributeSchema(records)

    logger.info(`[Execute Query] Completed in ${executionTime}ms, returned ${records.length} records`)

    const response: ExecuteQueryResponse = {
      records,
      attributeSchema,
      totalCount: records.length,
      queryType: body.queryType,
      executionTime
    }

    return sendSuccess(event, response)

  } catch (error: any) {
    logger.error(`[Execute Query] Error:`, error)

    // Handle specific AWS errors
    if (error.name === 'ResourceNotFoundException') {
      return errors.notFound(event, `Resource not found: ${error.message}`)
    }

    if (error.name === 'AccessDeniedException') {
      return errors.forbidden(event, `Access denied: ${error.message}`)
    }

    if (error.name === 'InvalidExpressionException' || error.name === 'InvalidParameterException') {
      return errors.badRequest(event, `Invalid query: ${error.message}`)
    }

    return errors.awsError(event, error)
  }
}))
