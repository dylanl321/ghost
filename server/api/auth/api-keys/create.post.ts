/**
 * POST /api/auth/api-keys/create
 * Create a new API key for non-interactive access
 */

import { createError, defineEventHandler, readBody } from 'h3'
import {
  createApiKey,
  INTEGRATION_API_KEY_SCOPES,
  validateIntegrationApiKeyRequest
} from '../../../utils/api-keys'
import { getAuthContext, requireOIDCAuth } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import type { CreateApiKeyRequest, CreateApiKeyResponse, EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/auth/api-keys/create', 'POST', {
  summary: 'Create new API key',
  description: 'Create a read-only API key for the supported /api/v1 integration contract.',
  tags: ['Authentication'],
  security: [
    { OIDCAuth: [] }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            name: { 
              type: 'string', 
              maxLength: 100,
              description: 'Human-readable name for the API key',
              example: 'Production Scripts'
            },
            scopes: {
              type: 'array',
              items: { 
                type: 'string',
                enum: INTEGRATION_API_KEY_SCOPES
              },
              description: 'Required permissions for the API key',
              example: ['accounts:read', 'costs:read']
            },
            expiresInDays: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
              default: 90,
              description: 'Expiration in days. Defaults to 90 when omitted.',
              example: 90
            },
            neverExpires: {
              type: 'boolean',
              default: false,
              description: 'Explicitly create a key without an expiration. Cannot be combined with expiresInDays.'
            },
            metadata: {
              type: 'object',
              description: 'Additional metadata (optional)',
              example: { purpose: 'Automated user sync' }
            }
          },
          required: ['name', 'scopes']
        }
      }
    }
  },
  responses: {
    200: {
      description: 'API key created successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  key: { 
                    type: 'string',
                    description: 'The actual API key - store securely! Only shown once.'
                  },
                  scopes: { type: 'array', items: { type: 'string' } },
                  expiresAt: { type: 'string', format: 'date-time' }
                }
              }
            }
          }
        }
      }
    },
    400: { description: 'Invalid request parameters' },
    401: { description: 'Authentication required' },
    403: { description: 'Verified user identity required' },
    500: { description: 'Server error' }
  }
})

export default defineEventHandler(async (event): Promise<EntraAPIResponse<CreateApiKeyResponse>> => {
  try {
    requireOIDCAuth(event)
    
    // Get authenticated user context
    const authContext = getAuthContext(event)
    const createdByValue = authContext.user?.email || authContext.user?.preferred_username ||
      authContext.user?.claims?.email || authContext.user?.claims?.preferred_username
    if (!createdByValue) throw createError({ statusCode: 403, statusMessage: 'A verified user identity is required' })
    const createdBy = String(createdByValue).toLowerCase()
    
    // Parse request body
    const body = await readBody<CreateApiKeyRequest>(event)
    
    const validationError = validateIntegrationApiKeyRequest(body)
    if (validationError) throw createError({ statusCode: 400, statusMessage: validationError })
    
    logger.info(`Creating API key "${body.name}" for ${createdBy}`)
    
    // Create the API key
    const newApiKey = await createApiKey({
      ...body,
      metadata: { ...body.metadata, integrationContract: 'v1' }
    }, createdBy)
    
    logger.info(`Successfully created API key ${newApiKey.id}`)
    
    return {
      success: true,
      data: newApiKey
    }
  } catch (error: any) {
    logger.error('Error creating API key:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to create API key'
    })
  }
})
