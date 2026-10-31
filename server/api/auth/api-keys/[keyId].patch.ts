/**
 * PATCH /api/auth/api-keys/:keyId
 * Update API key metadata (notes, description, etc.)
 */

import { createError, defineEventHandler, readBody, getRouterParam } from 'h3'
import { requireApiKeyOwner } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import type { EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'
import { updateApiKeyMetadata, validateApiKeyMetadata } from '../../../utils/api-keys'

// Register OpenAPI documentation
registerEndpoint('/api/auth/api-keys/{keyId}', 'PATCH', {
  summary: 'Update API key metadata',
  description: 'Update metadata (notes, description) for an API key',
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
    }
  ],
  requestBody: {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            metadata: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Key description or notes' }
              },
              description: 'Additional metadata for the API key'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'API key updated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              message: { type: 'string', example: 'API key updated successfully' }
            }
          }
        }
      }
    },
    400: { description: 'Invalid request' },
    401: { description: 'Authentication required' },
    403: { description: 'Insufficient permissions' },
    404: { description: 'API key not found' },
    500: { description: 'Server error' }
  }
})

export default defineEventHandler(async (event): Promise<EntraAPIResponse<any>> => {
  try {
    const userId = requireApiKeyOwner(event)

    // Get key ID from route params
    const keyId = getRouterParam(event, 'keyId')
    if (!keyId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'API key ID is required'
      })
    }

    // Parse request body
    const body = await readBody<{ metadata?: Record<string, any> }>(event)

    if (!body?.metadata) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Metadata is required'
      })
    }
    const metadataError = validateApiKeyMetadata(body.metadata)
    if (metadataError) throw createError({ statusCode: 400, statusMessage: metadataError })

    // Not-owned and missing keys answer the same 404 so key ids cannot be probed.
    if (!(await updateApiKeyMetadata(keyId, userId, body.metadata))) {
      throw createError({
        statusCode: 404,
        statusMessage: 'API key not found'
      })
    }

    logger.info(`Updated API key ${keyId} metadata by ${userId}`)

    return {
      success: true,
      data: { message: 'API key updated successfully' }
    }
  } catch (error: any) {
    logger.error('Error updating API key:', error)

    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }

    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to update API key'
    })
  }
})
