/**
 * GET /api/entra/config/status
 * Get Entra ID configuration status and validation
 */

import { defineEventHandler } from 'h3'
import { validateAllEntraConfig, getConfigSummary } from '../../../utils/entra/validation'
import { validateOIDCConfig } from '../../../utils/oidc-config'
import { getApiKeyStats } from '../../../utils/api-keys'
import { getTableEnvironment } from '../../../lib/dynamodb-config'
import { registerEndpoint } from '../../../plugins/swagger'
import type { EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/entra/config/status', 'GET', {
  summary: 'Get Entra ID configuration status',
  description: 'Get comprehensive status of Entra ID configuration, OIDC setup, and API keys (admin only)',
  tags: ['Configuration'],
  security: [
    { OIDCAuth: [] }
  ],
  responses: {
    200: {
      description: 'Configuration status retrieved successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  entraConfig: {
                    type: 'object',
                    properties: {
                      valid: { type: 'boolean' },
                      errors: { type: 'array', items: { type: 'string' } },
                      warnings: { type: 'array', items: { type: 'string' } }
                    }
                  },
                  oidcConfig: {
                    type: 'object',
                    properties: {
                      valid: { type: 'boolean' },
                      configured: { type: 'boolean' },
                      errors: { type: 'array', items: { type: 'string' } }
                    }
                  },
                  configSummary: {
                    type: 'object',
                    properties: {
                      endpoints: { type: 'object' },
                      authentication: { type: 'object' },
                      features: { type: 'object' }
                    }
                  },
                  apiKeyStats: {
                    type: 'object',
                    properties: {
                      total: { type: 'integer' },
                      active: { type: 'integer' },
                      expired: { type: 'integer' }
                    }
                  },
                  environment: { type: 'string' },
                  nodeEnv: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    401: { description: 'Authentication required' },
    403: { description: 'Admin permissions required' },
    500: { description: 'Server error' }
  }
})

interface ConfigStatusResponse {
  entraConfig: ReturnType<typeof validateAllEntraConfig>
  oidcConfig: ReturnType<typeof validateOIDCConfig>
  configSummary: ReturnType<typeof getConfigSummary>
  apiKeyStats: Awaited<ReturnType<typeof getApiKeyStats>>
  environment: string
  nodeEnv: string
}

export default defineEventHandler(async (): Promise<EntraAPIResponse<ConfigStatusResponse>> => {
  try {
    // Configuration status is available to all authenticated users
    // No admin scope required for basic status checks
    
    logger.debug('Checking Entra ID configuration status')
    
    // Validate configurations
    const entraConfig = validateAllEntraConfig()
    const oidcConfig = validateOIDCConfig()
    const configSummary = getConfigSummary()
    
    // Get API key statistics
    const apiKeyStats = await getApiKeyStats()
    
    const response: ConfigStatusResponse = {
      entraConfig,
      oidcConfig,
      configSummary,
      apiKeyStats,
      // Where API keys are actually stored, from the same config the key code reads.
      environment: await getTableEnvironment('apiKeys'),
      nodeEnv: process.env.NODE_ENV || 'development'
    }
    
    return {
      success: true,
      data: response
    }
  } catch (error: any) {
    logger.error('Error checking configuration status:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to check configuration status'
    })
  }
})
