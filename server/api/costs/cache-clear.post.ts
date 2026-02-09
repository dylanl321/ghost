/**
 * POST /api/costs/cache-clear
 * Clear cost-related cache entries
 *
 * This endpoint allows clearing cache when users switch between billable and proforma modes
 * to ensure they see immediate updated data.
 */

import { defineEventHandler, getQuery, readBody } from 'h3'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { requireScope } from '../../middleware/entra-auth'
import { costCache, organizationCache, CacheTags } from '../../utils/cache-manager'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/costs/cache-clear', 'POST', {
  summary: 'Clear cost cache',
  description: 'Clear cost-related cache entries to force fresh data fetch',
  tags: ['Costs'],
  requestBody: {
    required: false,
    content: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional array of cache tags to clear. If not provided, clears all cost caches.'
            }
          }
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Cache cleared successfully',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  clearedEntries: { type: 'number' },
                  tags: { type: 'array', items: { type: 'string' } }
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
  // Require admin scope — cache clearing is an administrative operation
  await requireScope(event, 'admin')

  // Read request body to get optional tags
  let tags: string[] = [CacheTags.COSTS]

  try {
    const body = await readBody(event).catch(() => ({}))
    if (body?.tags && Array.isArray(body.tags)) {
      tags = body.tags
    }
  } catch (error) {
    // If body parsing fails, use default tags
    logger.warn('Failed to parse cache-clear request body, using default tags')
  }

  logger.info(`Cache clear requested for tags: ${tags.join(', ')}`)

  // Clear cache entries by tags from both cost and organization caches
  // Organization cache stores entries with cost data (e.g., overview) that must also be invalidated
  const clearedCostEntries = await costCache.invalidateByTags(tags)
  const clearedOrgEntries = await organizationCache.invalidateByTags([CacheTags.COSTS])
  const clearedEntries = clearedCostEntries + clearedOrgEntries
  logger.info(`Cleared ${clearedEntries} cache entries (${clearedCostEntries} cost, ${clearedOrgEntries} org) for tags: ${tags.join(', ')}`)

  return sendSuccess(event, {
    clearedEntries,
    tags,
    message: `Cleared ${clearedEntries} cache entries`
  })
}))
