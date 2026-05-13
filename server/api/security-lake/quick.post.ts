/**
 * POST /api/security-lake/quick
 *
 * Execute simplified Security Lake queries with preset time ranges
 */

import { defineEventHandler, readBody, getHeaders } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { executeStoredQuery } from '../../utils/security-lake'
import type { QueryExecutionRequest } from '../../utils/security-lake'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/security-lake/quick', 'POST', {
  summary: 'Execute quick Security Lake queries',
  description: 'Execute simplified Security Lake queries with preset time ranges and parameters',
  tags: ['Security Lake'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['queryType', 'timeRange'],
          properties: {
            queryType: {
              type: 'string',
              enum: ['failed_access', 'privileged_actions', 'critical_findings', 'resources_most_findings'],
              description: 'Type of query to execute'
            },
            timeRange: {
              type: 'string',
              enum: ['today', 'yesterday', 'last_7_days', 'last_30_days', 'last_24_hours', 'last_hour'],
              description: 'Preset time range'
            },
            accountIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Account IDs to filter (optional)'
            },
            limit: {
              type: 'number',
              default: 100,
              description: 'Maximum number of results'
            },
            environment: {
              type: 'string',
              enum: ['commercial', 'govcloud'],
              default: 'commercial',
              description: 'AWS environment'
            },
            async: {
              type: 'boolean',
              default: false,
              description: 'Return query ID immediately instead of waiting for results'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Query results or query ID (if async)',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                oneOf: [
                  {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Query results'
                  },
                  {
                    type: 'object',
                    properties: {
                      queryExecutionId: { type: 'string' },
                      status: { type: 'string' },
                      message: { type: 'string' }
                    },
                    description: 'Async query response'
                  }
                ]
              },
              metadata: {
                type: 'object',
                properties: {
                  queryId: { type: 'string' },
                  queryName: { type: 'string' },
                  timeRange: { type: 'string' },
                  executionTimeMs: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid request parameters'
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event)

  // Validate request
  if (!body.queryType || !body.timeRange) {
    return errors.badRequest(event, 'queryType and timeRange are required')
  }

  try {
    // Calculate time range
    const now = new Date()
    let startTime: Date
    let endTime: Date = now

    switch (body.timeRange) {
      case 'today':
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'yesterday':
        startTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
        endTime = new Date(now.getFullYear(), now.getMonth(), now.getDate())
        break
      case 'last_24_hours':
        startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case 'last_hour':
        startTime = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case 'last_7_days':
        startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'last_30_days':
        startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        return errors.badRequest(event, 'Invalid timeRange')
    }

    // Build query parameters
    const parameters: Record<string, any> = {
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      limit: body.limit || 100
    }

    if (body.accountIds && Array.isArray(body.accountIds)) {
      parameters.accountIds = body.accountIds
    }

    // Execute query
    const queryRequest: QueryExecutionRequest = {
      queryId: body.queryType,
      parameters,
      environment: body.environment || 'commercial',
      async: body.async || false
    }

    const result = await executeStoredQuery(queryRequest)

    if (!result.success) {
      return errors.badRequest(event, result.error || 'Query execution failed')
    }

    // For async mode, return the query execution ID
    if (body.async && result.metadata?.queryExecutionId) {
      return sendSuccess(event, {
        queryExecutionId: result.metadata.queryExecutionId,
        status: 'QUEUED',
        message: 'Query submitted successfully'
      }, {
        queryId: result.metadata.queryId,
        queryName: result.metadata.queryName,
        timeRange: body.timeRange
      })
    }

    // For sync mode, return the results
    return sendSuccess(event, result.data, {
      queryId: result.metadata?.queryId,
      queryName: result.metadata?.queryName,
      timeRange: body.timeRange,
      executionTimeMs: result.executionTimeMs,
      metadata: result.metadata
    })

  } catch (error) {
    logger.error('[Security Lake] Quick query failed:', error)
    return errors.serverError(event, error instanceof Error ? (error instanceof Error ? error.message : String(error)) : 'Query execution failed')
  }
}))
