/**
 * DELETE /api/auth/api-keys/[keyId]
 * Deactivate an API key
 */

import { createError, defineEventHandler, getRouterParam } from 'h3'
import { deactivateApiKey } from '../../../utils/api-keys'
import { requireApiKeyOwner } from '../../../middleware/entra-auth'
import type { EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

interface DeactivateResponse {
  keyId: string
  deactivated: boolean
  message: string
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<DeactivateResponse>> => {
  try {
    const userId = requireApiKeyOwner(event)

    // Get key ID from route
    const keyId = getRouterParam(event, 'keyId')
    if (!keyId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'API key ID is required'
      })
    }
    
    logger.info(`Deactivating API key ${keyId} for user ${userId}`)
    
    // Deactivate the key
    const deactivated = await deactivateApiKey(keyId, userId)
    
    if (!deactivated) {
      throw createError({
        statusCode: 404,
        statusMessage: 'API key not found or insufficient permissions'
      })
    }
    
    return {
      success: true,
      data: {
        keyId,
        deactivated: true,
        message: 'API key has been deactivated'
      }
    }
  } catch (error: any) {
    logger.error('Error deactivating API key:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to deactivate API key'
    })
  }
})
