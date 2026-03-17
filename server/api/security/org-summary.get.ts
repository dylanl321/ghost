/**
 * GET /api/security/org-summary
 * Organization-level security health summary across all accounts.
 *
 * Three-tier data access:
 *   L1: in-memory cache (5 min TTL)
 *   L2: DynamoDB pre-computed summary (36 hr TTL, populated by nightly job)
 *   L3: Athena on-demand computation (rare, first load before nightly job runs)
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { organizationCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
import { loadSecuritySummary, saveSecuritySummary } from '../../utils/security-summary-store'
import { buildSecuritySummaryViaAthena } from '../../utils/security-hub-athena'
import { logger } from '../../utils/logger'
import { registerEndpoint } from '../../plugins/swagger'

registerEndpoint('/api/security/org-summary', 'GET', {
  summary: 'Get organization security health summary',
  description: 'Aggregated Security Hub findings across all accounts with per-account risk ranking. Uses DynamoDB-cached data pre-computed nightly via Athena.',
  tags: ['Security'],
  responses: {
    200: {
      description: 'Organization security summary',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: { type: 'object' }
            }
          }
        }
      }
    },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const cacheKey = CacheKeys.securityOrgSummary()

  // L1: in-memory cache
  const cached = await organizationCache.get(cacheKey)
  if (cached) {
    return sendSuccess(event, cached)
  }

  // L2: DynamoDB pre-computed summary
  const stored = await loadSecuritySummary()
  if (stored) {
    logger.info('[OrgSecurity] Serving from DynamoDB store')
    await organizationCache.set(cacheKey, stored, { ttl: 300, tags: [CacheTags.SECURITY] })
    return sendSuccess(event, stored)
  }

  // L3: Athena on-demand (first load before nightly job has run)
  logger.info('[OrgSecurity] No cached data, running Athena on-demand')
  const start = Date.now()
  const result = await buildSecuritySummaryViaAthena()
  await saveSecuritySummary(result, { durationMs: Date.now() - start })
  await organizationCache.set(cacheKey, result, { ttl: 300, tags: [CacheTags.SECURITY] })

  return sendSuccess(event, result)
}))
