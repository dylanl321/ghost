/**
 * PATCH /api/auth/api-keys/:keyId
 * Update API key metadata (notes, description, etc.)
 */

import { createError, defineEventHandler, readBody, getRouterParam } from 'h3'
import { getAuthContext, requireOIDCAuth } from '../../../middleware/entra-auth'
import { registerEndpoint } from '../../../plugins/swagger'
import type { EntraAPIResponse } from '../../../types/entra'
import { updateItem, getItem } from '../../../utils/dynamodb'
import { getTableEnvironment, getTableName } from '../../../lib/dynamodb-config'
import { logger } from '../../../utils/logger'

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
    requireOIDCAuth(event)

    // Get authenticated user
    const authContext = getAuthContext(event)
    const userIdValue = authContext.user?.email || authContext.user?.preferred_username ||
      authContext.user?.claims?.email || authContext.user?.claims?.preferred_username
    if (!userIdValue) throw createError({ statusCode: 403, statusMessage: 'A verified user identity is required' })
    const userId = String(userIdValue).toLowerCase()

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

    if (!body.metadata) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Metadata is required'
      })
    }

    // Get existing key to verify it exists and check permissions
    const tableName = await getTableName('apiKeys')
    const environment = await getTableEnvironment('apiKeys')
    const existingKey = await getItem(tableName, { id: keyId }, environment)

    if (!existingKey) {
      throw createError({
        statusCode: 404,
        statusMessage: 'API key not found'
      })
    }
    if (String(existingKey.createdBy).toLowerCase() !== userId) {
      throw createError({ statusCode: 404, statusMessage: 'API key not found' })
    }

    // Update metadata
    await updateItem(
      tableName,
      { id: keyId },
      { metadata: { ...existingKey.metadata, ...body.metadata } },
      environment
    )

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
