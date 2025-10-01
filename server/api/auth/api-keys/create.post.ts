/**
 * POST /api/auth/api-keys/create
 * Create a new API key for non-interactive access
 */

import { defineEventHandler, readBody } from 'h3'
import { createError } from 'h3'
import { createApiKey, API_KEY_SCOPES } from '../../../utils/api-keys'
import { getAuthContext, requireScope } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import type { CreateApiKeyRequest, CreateApiKeyResponse, EntraAPIResponse } from '../../../types/entra'

// Register OpenAPI documentation
registerEndpoint('/api/auth/api-keys/create', 'POST', {
  summary: 'Create new API key',
  description: 'Create a new API key for non-interactive access to Entra ID APIs',
  tags: ['Authentication'],
  security: [
    { BearerAuth: [] },
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
              description: 'Human-readable name for the API key',
              example: 'Production Scripts'
            },
            scopes: {
              type: 'array',
              items: { 
                type: 'string',
                enum: Object.keys(API_KEY_SCOPES)
              },
              description: 'Required permissions for the API key',
              example: ['entra:read', 'groups:read']
            },
            expiresInDays: {
              type: 'integer',
              minimum: 1,
              maximum: 365,
              description: 'Expiration in days (optional)',
              example: 90
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
    403: { description: 'Admin permissions required' },
    500: { description: 'Server error' }
  }
})

export default defineEventHandler(async (event): Promise<EntraAPIResponse<CreateApiKeyResponse>> => {
  try {
    // Require admin scope to create API keys
    requireScope(event, 'admin')
    
    // Get authenticated user context
    const authContext = getAuthContext(event)
    const createdBy = authContext.user?.email || authContext.user?.displayName || 'unknown'
    
    // Parse request body
    const body = await readBody<CreateApiKeyRequest>(event)
    
    // Validate request
    if (!body.name || body.name.trim().length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'API key name is required'
      })
    }
    
    if (!body.scopes || body.scopes.length === 0) {
      throw createError({
        statusCode: 400,
        statusMessage: 'At least one scope is required'
      })
    }
    
    // Validate scopes
    const validScopes = Object.keys(API_KEY_SCOPES)
    const invalidScopes = body.scopes.filter(scope => !validScopes.includes(scope))
    
    if (invalidScopes.length > 0) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid scopes: ${invalidScopes.join(', ')}. Valid scopes: ${validScopes.join(', ')}`
      })
    }
    
    // Validate expiration
    if (body.expiresInDays !== undefined) {
      if (body.expiresInDays < 1 || body.expiresInDays > 365) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Expiration must be between 1 and 365 days'
        })
      }
    }
    
    console.log(`Creating API key "${body.name}" for ${createdBy}`)
    
    // Create the API key
    const newApiKey = await createApiKey(body, createdBy)
    
    console.log(`Successfully created API key ${newApiKey.id}`)
    
    return {
      success: true,
      data: newApiKey
    }
  } catch (error: any) {
    console.error('Error creating API key:', error)
    
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