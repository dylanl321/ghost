/**
 * GET /api/auth/api-keys
 * List API keys for the authenticated user
 */

import { defineEventHandler, getQuery } from 'h3'
import { createError } from 'h3'
import { listApiKeys, getApiKeyStats } from '../../../utils/api-keys'
import { getAuthContext, requireScope } from '../../../middleware/entra-auth'
import type { ApiKey, EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

interface ApiKeysResponse {
  keys: Omit<ApiKey, 'keyHash' | 'salt'>[]
  stats: Awaited<ReturnType<typeof getApiKeyStats>>
  canCreateKeys: boolean
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<ApiKeysResponse>> => {
  try {
    // Require read access to view API keys
    requireScope(event, 'read')
    
    // Get authenticated user context
    const authContext = getAuthContext(event)
    const userId = authContext.user?.email || authContext.user?.displayName || 'unknown'
    
    // Get query parameters
    const query = getQuery(event)
    const includeAll = query.all === 'true' && authContext.scopes?.includes('admin')
    
    logger.info(`Listing API keys for ${userId}`)
    
    // Get API keys
    const apiKeys = await listApiKeys(includeAll ? undefined : userId)
    
    // Get statistics (only if admin)
    let stats = { total: 0, active: 0, expired: 0, byScope: {} }
    if (authContext.scopes?.includes('admin')) {
      stats = await getApiKeyStats()
    }
    
    // Check if user can create keys
    const canCreateKeys = authContext.scopes?.includes('admin') || false
    
    return {
      success: true,
      data: {
        keys: apiKeys,
        stats,
        canCreateKeys
      }
    }
  } catch (error: any) {
    logger.error('Error listing API keys:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list API keys'
    })
  }
})