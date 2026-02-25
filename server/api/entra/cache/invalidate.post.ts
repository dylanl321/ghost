/**
 * POST /api/entra/cache/invalidate
 * Invalidate Entra ID cache entries
 */

import { defineEventHandler, readBody } from 'h3'
import { createError } from 'h3'
import { clearEntraCache } from '../../../utils/entra/graph-client'
import { clearUserCache } from '../../../utils/entra/user-cache'
import { accountCache, CacheTags } from '../../../utils/cache-manager'
import { validateEntraConfig } from '../../../utils/entra/config'
import { registerEndpoint } from '../../../plugins/swagger'
import { requireScope } from '../../../middleware/entra-auth'
import type { EntraAPIResponse } from '../../../types/entra'
import { logger } from '../../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/entra/cache/invalidate', 'POST', {
  summary: 'Invalidate Entra ID cache',
  description: 'Invalidate specific or all Entra ID cache entries (admin only)',
  tags: ['Cache Management'],
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
    { OIDCAuth: [] },
    { DevBypass: [] }
  ],
  requestBody: {
    required: false,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            pattern: {
              type: 'string',
              enum: ['all', 'groups', 'users', 'account'],
              default: 'all',
              description: 'Cache invalidation pattern'
            },
            accountId: {
              type: 'string',
              description: 'Specific account ID to invalidate (when pattern is "account")'
            },
            groupId: {
              type: 'string',
              description: 'Specific group ID to invalidate'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Cache invalidated successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  invalidated: { type: 'integer' },
                  pattern: { type: 'string' },
                  message: { type: 'string' }
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

interface InvalidateRequest {
  pattern?: 'all' | 'groups' | 'users' | 'account'
  accountId?: string
  groupId?: string
}

interface InvalidateResponse {
  invalidated: number
  pattern: string
  message: string
}

export default defineEventHandler(async (event): Promise<EntraAPIResponse<InvalidateResponse>> => {
  try {
    // Require admin scope to invalidate cache
    await requireScope(event, 'admin')
    
    // Validate Entra configuration
    const configValidation = validateEntraConfig()
    if (!configValidation.valid) {
      throw createError({
        statusCode: 500,
        statusMessage: `Entra ID configuration error: ${configValidation.errors.join(', ')}`
      })
    }
    
    // Parse request body
    const body = await readBody<InvalidateRequest>(event)
    const { pattern = 'all', accountId, groupId } = body
    
    logger.info(`Invalidating Entra cache with pattern: ${pattern}`)
    
    let invalidated = 0
    let message = ''
    
    // Handle specific patterns
    if (groupId) {
      // Invalidate specific group cache
      const cacheKeys = [
        `entra:members:${groupId}`,
        `entra:members:dist-${groupId}`
      ]
      
      for (const key of cacheKeys) {
        const deleted = await accountCache.delete(key)
        if (deleted) invalidated++
      }
      
      message = `Invalidated cache for group ${groupId}`
    } else if (accountId) {
      // Invalidate specific account cache
      const cacheKeys = [
        `entra:groups:${accountId}`,
        `entra:groups:dist-${accountId}`,
        `entra:owners:${accountId}`
      ]
      
      for (const key of cacheKeys) {
        const deleted = await accountCache.delete(key)
        if (deleted) invalidated++
      }
      
      message = `Invalidated cache for account ${accountId}`
    } else {
      // Invalidate by pattern
      switch (pattern) {
        case 'groups':
          invalidated = await clearEntraCache('groups')
          message = 'Invalidated all group cache entries'
          break
          
        case 'users':
          await clearUserCache() // Clear in-memory user cache
          invalidated = await clearEntraCache('users')
          message = 'Invalidated all user cache entries'
          break
          
        case 'all':
        default:
          await clearUserCache() // Clear in-memory user cache
          invalidated = await clearEntraCache()
          message = 'Invalidated all Entra cache entries'
          break
      }
    }
    
    logger.debug(`Cache invalidation complete: ${invalidated} entries removed`)
    
    return {
      success: true,
      data: {
        invalidated,
        pattern: groupId ? `group:${groupId}` : accountId ? `account:${accountId}` : pattern,
        message
      }
    }
  } catch (error: any) {
    logger.error('Error invalidating cache:', error)
    
    // Re-throw H3 errors
    if (error.statusCode) {
      throw error
    }
    
    // Handle other errors
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to invalidate cache'
    })
  }
})