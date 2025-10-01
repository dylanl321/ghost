/**
 * POST /api/security-lake/execute
 * 
 * Execute a Security Lake stored query
 */

import { defineEventHandler, readBody, getHeaders } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { executeStoredQuery } from '../../utils/security-lake'
import type { QueryExecutionRequest } from '../../utils/security-lake'

// Register OpenAPI documentation
registerEndpoint('/api/security-lake/execute', 'POST', {
  summary: 'Execute Security Lake query',
  description: 'Execute a stored Security Lake query with parameters',
  tags: ['Security Lake'],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          required: ['queryId', 'parameters'],
          properties: {
            queryId: {
              type: 'string',
              description: 'ID of the stored query to execute',
              example: 'failed_access'
            },
            parameters: {
              type: 'object',
              description: 'Query parameters',
              example: {
                startTime: '2024-12-01T00:00:00Z',
                endTime: '2024-12-02T00:00:00Z',
                limit: 50
              }
            },
            environment: {
              type: 'string',
              enum: ['commercial', 'govcloud'],
              default: 'commercial',
              description: 'AWS environment'
            },
            dryRun: {
              type: 'boolean',
              default: false,
              description: 'Return SQL without executing'
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
      description: 'Query results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: { type: 'object' },
                description: 'Query results'
              },
              sql: {
                type: 'string',
                description: 'Generated SQL (dry run only)'
              },
              executionTimeMs: {
                type: 'number',
                description: 'Query execution time'
              },
              metadata: {
                type: 'object',
                properties: {
                  queryId: { type: 'string' },
                  queryName: { type: 'string' },
                  recordCount: { type: 'number' },
                  dataScannedBytes: { type: 'number' },
                  queryExecutionId: { type: 'string', description: 'Athena query execution ID (async mode)' }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid request or parameters'
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const body = await readBody(event) as QueryExecutionRequest

  // Validate request
  if (!body.queryId || !body.parameters) {
    return errors.badRequest(event, 'queryId and parameters are required')
  }

  try {
    // Execute the query
    const result = await executeStoredQuery(body)

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
        sql: result.sql,
        metadata: result.metadata
      })
    }

    // For sync mode, return the results
    return sendSuccess(event, result.data, {
      sql: result.sql,
      executionTimeMs: result.executionTimeMs,
      metadata: result.metadata
    })

  } catch (error) {
    console.error('[Security Lake] API execution failed:', error)
    return errors.serverError(event, error instanceof Error ? error.message : 'Query execution failed')
  }
}))