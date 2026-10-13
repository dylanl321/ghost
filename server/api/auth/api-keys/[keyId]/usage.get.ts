/**
 * GET /api/auth/api-keys/:keyId/usage
 * Get usage history and statistics for an API key
 */

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { getApiKeyUsageHistory, getApiKeyUsageStats, isApiKeyOwnedBy } from '../../../../utils/api-keys'
import { getAuthContext, requireOIDCAuth } from '../../../../middleware/entra-auth'
import { registerEndpoint } from '../../../../plugins/swagger'
import type { EntraAPIResponse } from '../../../../types/entra'
import { logger } from '../../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/auth/api-keys/{keyId}/usage', 'GET', {
  summary: 'Get API key usage history',
  description: 'Get usage history and statistics for a specific API key',
  tags: ['Authentication'],
  security: [
    { OIDCAuth: [] }
  ],
  parameters: [
    {
      name: 'keyId',
      in: 'path',
      required: true,
      schema: { type: 'string' },
      description: 'API key ID'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'integer', default: 100 },
      description: 'Maximum number of usage records to return'
    }
  ],
  responses: {
    200: {
      description: 'Usage history retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  stats: {
                    type: 'object',
                    properties: {
                      totalCalls: { type: 'integer' },
                      lastUsed: { type: 'string', format: 'date-time', nullable: true },
                      callsByEndpoint: { type: 'object' },
                      callsByStatus: { type: 'object' },
                      last24Hours: { type: 'integer' },
                      last7Days: { type: 'integer' },
                      last30Days: { type: 'integer' }
                    }
                  },
                  history: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        timestamp: { type: 'string', format: 'date-time' },
                        endpoint: { type: 'string' },
                        method: { type: 'string' },
                        statusCode: { type: 'integer' },
                        ipAddress: { type: 'string' },
                        userAgent: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    401: { description: 'Authentication required' },
    403: { description: 'Verified user identity required' },
    404: { description: 'API key not found' },
    500: { description: 'Server error' }
  }
})

export default defineEventHandler(async (event): Promise<EntraAPIResponse<any>> => {
  try {
    requireOIDCAuth(event)

    // Get key ID from route params
    const keyId = getRouterParam(event, 'keyId')
    if (!keyId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'API key ID is required'
      })
    }
    const authContext = getAuthContext(event)
    const userIdValue = authContext.user?.email || authContext.user?.preferred_username ||
      authContext.user?.claims?.email || authContext.user?.claims?.preferred_username
    const userId = userIdValue ? String(userIdValue).toLowerCase() : ''
    if (!userId || !(await isApiKeyOwnedBy(keyId, userId))) {
      throw createError({ statusCode: 404, statusMessage: 'API key not found' })
    }

    // Get limit from query params
    const url = new URL(event.node.req.url || '', 'http://localhost')
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') || '100', 10)
    const limit = Number.isFinite(requestedLimit) ? Math.min(500, Math.max(1, requestedLimit)) : 100

    // Get usage history and stats
    const [history, stats] = await Promise.all([
      getApiKeyUsageHistory(keyId, limit),
      getApiKeyUsageStats(keyId)
    ])

    return {
      success: true,
      data: {
        stats,
        history
      }
    }
  } catch (error: any) {
    logger.error('Error getting API key usage:', error)

    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }

    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to get API key usage'
    })
  }
})
