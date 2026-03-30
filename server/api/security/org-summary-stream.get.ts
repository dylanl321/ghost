/**
 * GET /api/security/org-summary-stream
 * SSE streaming endpoint for organization security health summary.
 *
 * Default: checks DynamoDB first, returns instant data if available.
 * With ?refresh=true: skips DynamoDB, runs Athena with progress events.
 */

import { defineEventHandler, setResponseHeaders, getQuery } from 'h3'
import { organizationCache, CacheKeys, CacheTags } from '../../utils/cache-manager'
import { loadSecuritySummary, saveSecuritySummary } from '../../utils/security-summary-store'
import { buildSecuritySummaryViaAthena } from '../../utils/security-hub-athena'
import { logger } from '../../utils/logger'
import type { OrgSecuritySummary } from '../../../shared/types/security-dashboard'

export default defineEventHandler(async (event) => {
  setResponseHeaders(event, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  const res = event.node.res
  const query = getQuery(event)
  const forceRefresh = query.refresh === 'true'

  function send(eventType: string, data: any) {
    res.write(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`)
  }

  try {
    const cacheKey = CacheKeys.securityOrgSummary()

    if (!forceRefresh) {
      // Check in-memory cache first
      const cached = await organizationCache.get<OrgSecuritySummary>(cacheKey)
      if (cached) {
        send('progress', { stage: 'cache_hit', message: 'Loading cached results...', percent: 100 })
        send('complete', { success: true, data: cached })
        res.end()
        return
      }

      // Check DynamoDB store
      const stored = await loadSecuritySummary()
      if (stored) {
        await organizationCache.set(cacheKey, stored, { ttl: 300, tags: [CacheTags.SECURITY] })
        send('progress', { stage: 'cache_hit', message: 'Loading pre-computed results...', percent: 100 })
        send('complete', { success: true, data: stored })
        res.end()
        return
      }
    }

    // Run Athena with progress streaming
    const start = Date.now()
    const result = await buildSecuritySummaryViaAthena((progress) => {
      send('progress', progress)
    })

    // Save to DynamoDB and in-memory cache
    send('progress', { stage: 'saving', message: 'Saving results...', percent: 95 })
    await saveSecuritySummary(result, { durationMs: Date.now() - start })
    await organizationCache.set(cacheKey, result, { ttl: 300, tags: [CacheTags.SECURITY] })

    send('progress', { stage: 'complete', message: 'Security data loaded', percent: 100 })
    send('complete', { success: true, data: result })
  } catch (err: any) {
    logger.error('[SecurityHub Stream] Fatal error', { error: err.message })
    send('error', { message: err.message || 'Failed to load security data' })
  }

  res.end()
})
