/**
 * GET /api/organization/structure
 * Get organizational unit structure
 */

import { defineEventHandler } from 'h3'
import { 
  getOrganizationInfo, 
  getOrganizationalUnitTree 
} from '../../utils/organizations'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/organization/structure', 'GET', {
  summary: 'Get organizational structure',
  description: 'Retrieve the organizational unit hierarchy and structure',
  tags: ['Organization'],
  parameters: [
    { $ref: '#/components/parameters/Environment' }
  ],
  responses: {
    200: {
      description: 'Organizational structure',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  organization: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      arn: { type: 'string' },
                      featureSet: { type: 'string' },
                      masterAccountId: { type: 'string' }
                    }
                  },
                  tree: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      children: { type: 'array' },
                      accounts: { type: 'array' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    404: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const { environment } = parseQueryParams(event)
  
  // Generate cache keys for organization data
  const orgInfoCacheKey = `organization:info:${environment}`
  
  // The OU tree has its own 5-minute cache in getOrganizationalUnitTree, so
  // it is not cached again here: a degraded (partial) tree used to stick for
  // an hour.
  const [orgInfo, treeResult] = await Promise.all([
    organizationCache.getOrSet(
      orgInfoCacheKey,
      async () => {
        logger.info(`Cache miss: Fetching organization info for ${environment} environment...`)
        return await getOrganizationInfo(environment)
      },
      {
        ttl: 3600, // 1 hour - org structure changes infrequently
        tags: [CacheTags.ORGANIZATION, environment]
      }
    ),
    getOrganizationalUnitTree(environment)
  ])
  const ouTree = treeResult.tree

  if (!orgInfo) {
    return errors.serverError(event, 'Unable to access Organizations service')
  }

  if (!ouTree) {
    return errors.notFound(event, 'Organizational unit tree not found')
  }

  // Add cache metadata
  const orgInfoCache = organizationCache.getEntryInfo(orgInfoCacheKey)
  const cacheStats = organizationCache.getStats()
  
  const metadata = {
    environment,
    cache: {
      organizationInfo: {
        hit: !!orgInfoCache,
        age: orgInfoCache?.age || null,
        ttl: orgInfoCache?.ttl || null
      },
      organizationTree: {
        degraded: treeResult.degraded,
        failedOUs: treeResult.failedOUs
      },
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`,
      totalEntries: cacheStats.entries
    },
    performance: {
      responseTimeMs: Date.now() - startTime
    }
  }
  
  return sendSuccess(event, {
    organization: orgInfo,
    tree: ouTree
  }, metadata)
}))