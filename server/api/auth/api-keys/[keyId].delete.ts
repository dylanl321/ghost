/**
 * DELETE /api/auth/api-keys/[keyId]
 * Deactivate an API key
 */

import { defineEventHandler, getRouterParam } from 'h3'
import { createError } from 'h3'
import { deactivateApiKey } from '../../../utils/api-keys'
import { getAuthContext, requireScope } from '../../../middleware/entra-auth'
import type { EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

interface DeactivateResponse {
  keyId: string
  deactivated: boolean
  message: string
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<DeactivateResponse>> => {
  try {
    // Require write access to deactivate API keys
    requireScope(event, 'write')
    
    // Get key ID from route
    const keyId = getRouterParam(event, 'keyId')
    if (!keyId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'API key ID is required'
      })
    }
    
    // Get authenticated user context
    const authContext = getAuthContext(event)
    const userId = authContext.user?.email || authContext.user?.displayName || 'unknown'
    
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