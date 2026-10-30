/**
 * GET /api/auth/api-keys
 * List API keys for the authenticated user
 */

import { createError, defineEventHandler } from 'h3'
import { listApiKeys, summarizeApiKeys } from '../../../utils/api-keys'
import { requireApiKeyOwner } from '../../../middleware/entra-auth'
import type { ApiKey, EntraAPIResponse } from '../../../types/entra'
import type { ApiKeyStats } from '../../../utils/api-keys'
import { logger } from '../../../utils/logger'
import { isTransientDependencyError } from '../../../mcp/oauth/transient-error'

interface ApiKeysResponse {
  keys: Omit<ApiKey, 'keyHash' | 'salt'>[]
  stats: ApiKeyStats
  canCreateKeys: boolean
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<ApiKeysResponse>> => {
  try {
    
    const userId = requireApiKeyOwner(event)
    
    logger.info(`Listing API keys for ${userId}`)
    
    // Get API keys
    const apiKeys = await listApiKeys(userId)
    const stats = summarizeApiKeys(apiKeys)
    
    return {
      success: true,
      data: {
        keys: apiKeys,
        stats,
        canCreateKeys: true
      }
    }
  } catch (error: any) {
    logger.error('Error listing API keys:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Never show an outage as an empty key list.
    throw createError({
      statusCode: isTransientDependencyError(error) ? 503 : 500,
      statusMessage: 'Failed to list API keys'
    })
  }
})
