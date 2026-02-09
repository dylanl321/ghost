/**
 * POST /api/cache/invalidate
 * 
 * Administrative endpoint to invalidate application caches
 * Useful for forcing data refresh after account updates or cost data changes
 */

import { defineEventHandler, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { requireScope } from '../../middleware/entra-auth'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/cache/invalidate', 'POST', {
  summary: 'Invalidate organization overview caches',
  description: 'Clear cached data to force fresh data retrieval on next request. Useful after account updates or cost data changes.',
  tags: ['Cache Management'],
  requestBody: {
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { 
                type: 'string',
                enum: ['accounts', 'costs', 'organization', 'services', 'budgets', 'all']
              },
              description: 'Cache tags to invalidate. Use "all" to clear all caches.'
            },
            reason: {
              type: 'string',
              description: 'Optional reason for cache invalidation (for audit purposes)'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Cache invalidation results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  invalidated: {
                    type: 'object',
                    properties: {
                      organization: { type: 'integer' },
                      accounts: { type: 'integer' },
                      costs: { type: 'integer' },
                      total: { type: 'integer' }
                    }
                  },
                  cacheStats: {
                    type: 'object',
                    properties: {
                      beforeInvalidation: { type: 'object' },
                      afterInvalidation: { type: 'object' }
                    }
                  },
                  timestamp: { type: 'string', format: 'date-time' },
                  reason: { type: 'string' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  // Require admin scope — cache invalidation is an administrative operation
  await requireScope(event, 'admin')

  const body = await readBody(event)
  const tags = body?.tags || ['all']
  const reason = body?.reason || 'Manual invalidation'
  
  // Validate tags
  const validTags = ['accounts', 'costs', 'organization', 'services', 'budgets', 'all']
  const invalidTags = tags.filter((tag: string) => !validTags.includes(tag))
  
  if (invalidTags.length > 0) {
    return errors.badRequest(event, `Invalid cache tags: ${invalidTags.join(', ')}`)
  }
  
  // Import cache managers
  const { organizationCache, accountCache, costCache, CacheTags } = await import('../../utils/cache-manager')
  
  // Get stats before invalidation
  const statsBefore = {
    organization: organizationCache.getStats(),
    accounts: accountCache.getStats(),
    costs: costCache.getStats()
  }
  
  // Perform cache invalidation
  const invalidationResults = {
    organization: 0,
    accounts: 0,
    costs: 0,
    total: 0
  }
  
  if (tags.includes('all')) {
    // Clear all caches
    await organizationCache.clear()
    await accountCache.clear()
    await costCache.clear()
    
    invalidationResults.organization = statsBefore.organization.entries
    invalidationResults.accounts = statsBefore.accounts.entries
    invalidationResults.costs = statsBefore.costs.entries
  } else {
    // Selective invalidation by tags
    if (tags.includes('organization')) {
      invalidationResults.organization = await organizationCache.invalidateByTags([CacheTags.ORGANIZATION])
    }
    
    if (tags.includes('accounts')) {
      invalidationResults.accounts = await accountCache.invalidateByTags([CacheTags.ACCOUNTS])
      // Also invalidate organization cache that depends on accounts
      invalidationResults.organization += await organizationCache.invalidateByTags([CacheTags.ACCOUNTS])
    }
    
    if (tags.includes('costs')) {
      invalidationResults.costs = await costCache.invalidateByTags([CacheTags.COSTS])
      // Also invalidate organization cache that depends on costs
      invalidationResults.organization += await organizationCache.invalidateByTags([CacheTags.COSTS])
    }
    
    if (tags.includes('services')) {
      invalidationResults.costs += await costCache.invalidateByTags([CacheTags.SERVICES])
    }
    
    if (tags.includes('budgets')) {
      invalidationResults.organization += await organizationCache.invalidateByTags([CacheTags.BUDGETS])
      invalidationResults.costs += await costCache.invalidateByTags([CacheTags.BUDGETS])
    }
  }
  
  invalidationResults.total = invalidationResults.organization + invalidationResults.accounts + invalidationResults.costs
  
  // Get stats after invalidation
  const statsAfter = {
    organization: organizationCache.getStats(),
    accounts: accountCache.getStats(),
    costs: costCache.getStats()
  }
  
  // Log the cache invalidation
  logger.info(`Cache invalidation: ${invalidationResults.total} entries cleared (tags: ${tags.join(', ')}) - Reason: ${reason}`)
  
  const result = {
    invalidated: invalidationResults,
    cacheStats: {
      beforeInvalidation: statsBefore,
      afterInvalidation: statsAfter
    },
    timestamp: new Date().toISOString(),
    reason,
    tags
  }
  
  return sendSuccess(event, result)
}))