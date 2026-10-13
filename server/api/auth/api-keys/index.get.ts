/**
 * GET /api/auth/api-keys
 * List API keys for the authenticated user
 */

import { createError, defineEventHandler } from 'h3'
import { listApiKeys } from '../../../utils/api-keys'
import { getAuthContext, requireOIDCAuth } from '../../../middleware/entra-auth'
import type { ApiKey, EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

interface ApiKeysResponse {
  keys: Omit<ApiKey, 'keyHash' | 'salt'>[]
  stats: { total: number; active: number; expired: number; byScope: Record<string, number> }
  canCreateKeys: boolean
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<ApiKeysResponse>> => {
  try {
    requireOIDCAuth(event)
    
    // Get authenticated user context
    const authContext = getAuthContext(event)
    const userIdValue = authContext.user?.email || authContext.user?.preferred_username ||
      authContext.user?.claims?.email || authContext.user?.claims?.preferred_username
    if (!userIdValue) throw createError({ statusCode: 403, statusMessage: 'A verified user identity is required' })
    const userId = String(userIdValue).toLowerCase()
    
    logger.info(`Listing API keys for ${userId}`)
    
    // Get API keys
    const apiKeys = await listApiKeys(userId)
    const now = new Date()
    const stats = {
      total: apiKeys.length,
      active: apiKeys.filter(key => key.isActive && (!key.expiresAt || key.expiresAt > now)).length,
      expired: apiKeys.filter(key => !key.isActive || Boolean(key.expiresAt && key.expiresAt <= now)).length,
      byScope: apiKeys.flatMap(key => key.scopes).reduce<Record<string, number>>((counts, scope) => {
        counts[scope] = (counts[scope] || 0) + 1
        return counts
      }, {})
    }
    
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
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to list API keys'
    })
  }
})
