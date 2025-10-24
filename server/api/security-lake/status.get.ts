/**
 * GET /api/security-lake/status
 *
 * Check the status of an async Security Lake query
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getAsyncQueryStatus } from '../../utils/security-lake'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/security-lake/status', 'GET', {
  summary: 'Check async query status',
  description: 'Check the status and results of an asynchronous Security Lake query',
  tags: ['Security Lake'],
  parameters: [
    {
      name: 'queryId',
      in: 'query',
      required: true,
      schema: {
        type: 'string',
        description: 'Athena query execution ID'
      }
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'commercial',
        description: 'AWS environment'
      }
    }
  ],
  responses: {
    200: {
      description: 'Query status and results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  queryId: { type: 'string' },
                  status: {
                    type: 'string',
                    enum: ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED']
                  },
                  startTime: { type: 'string', format: 'date-time' },
                  endTime: { type: 'string', format: 'date-time' },
                  data: {
                    type: 'array',
                    items: { type: 'object' },
                    description: 'Query results (only present when status is SUCCEEDED)'
                  },
                  error: { type: 'string', description: 'Error message (only present when status is FAILED)' },
                  executionTimeMs: { type: 'number' },
                  metadata: {
                    type: 'object',
                    properties: {
                      queryName: { type: 'string' },
                      recordCount: { type: 'number' },
                      dataScannedBytes: { type: 'number' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    400: {
      description: 'Invalid request parameters'
    },
    404: {
      description: 'Query not found'
    }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const query = getQuery(event)
  const queryId = query.queryId as string
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'

  // Validate request
  if (!queryId) {
    return errors.badRequest(event, 'queryId parameter is required')
  }

  try {
    // Get query status
    const status = await getAsyncQueryStatus(queryId, 'Security Lake Query', environment)

    if (status.status === 'FAILED') {
      return errors.serverError(event, status.error || 'Query failed')
    }

    return sendSuccess(event, status)

  } catch (error) {
    logger.error('[Security Lake] Status check failed:', error)
    return errors.serverError(event, error instanceof Error ? error.message : 'Status check failed')
  }
}))

