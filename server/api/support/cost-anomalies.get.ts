/**
 * GET /api/support/cost-anomalies
 * Retrieve cost anomalies from AWS Cost Explorer
 */

import { defineEventHandler, getQuery } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { queryCostAnomalies } from '../../utils/cost-anomalies'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'
import type { AWSEnvironmentType } from '../../types'

registerEndpoint('/api/support/cost-anomalies', 'GET', {
  summary: 'Get cost anomalies',
  description: 'Retrieve cost anomalies detected by AWS Cost Explorer Anomaly Detection',
  tags: ['Support Tools', 'Costs'],
  parameters: [
    {
      name: 'accountId',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by specific account ID'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'] },
      description: 'AWS environment (default: commercial - anomaly detection is primarily in commercial)'
    },
    {
      name: 'daysBack',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 90 },
      description: 'Number of days to look back (default: 30)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100 },
      description: 'Maximum anomalies to return (default: 50)'
    },
    {
      name: 'cursor',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'AWS continuation token returned by the previous response'
    }
  ],
  responses: {
    200: {
      description: 'Cost anomalies',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: { type: 'object' },
                  anomalies: { type: 'array' },
                  recommendations: { type: 'array', items: { type: 'string' } }
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

export default defineEventHandler(handleAsync(async (event) => {
  const queryParams = getQuery(event)
  const accountId = queryParams.accountId as string | undefined
  const environment = (queryParams.environment as AWSEnvironmentType) || 'commercial'
  const daysBack = Math.min(parseInt(queryParams.daysBack as string) || 30, 90)
  const limit = Math.min(parseInt(queryParams.limit as string) || 50, 100)

  // Validate environment
  if (environment !== 'commercial' && environment !== 'govcloud') {
    return errors.badRequest(event, 'Environment must be "commercial" or "govcloud"')
  }

  logger.info(`[Cost Anomalies] Account: ${accountId || 'all'}, Days: ${daysBack}, Environment: ${environment}`)

  try {
    const responseData = await queryCostAnomalies({ accountId, environment, daysBack, limit, cursor: queryParams.cursor as string | undefined })
    logger.info(`[Cost Anomalies] Returned ${responseData.summary.returnedAnomalies} anomalies with total impact $${responseData.summary.totalImpact}`)
    return sendSuccess(event, responseData)

  } catch (error: any) {
    logger.error('[Cost Anomalies] Error:', error)

    // Handle specific errors
    if (error.name === 'LimitExceededException') {
      return errors.serverError(event, 'API rate limit exceeded. Please try again later.')
    }

    if (error.name === 'AccessDeniedException') {
      return errors.serverError(event, 'Access denied to Cost Explorer Anomaly Detection', {
        hint: 'Ensure the IAM role has ce:GetAnomalies permission'
      })
    }

    return errors.serverError(event, error.message || 'Failed to get cost anomalies')
  }
}))
