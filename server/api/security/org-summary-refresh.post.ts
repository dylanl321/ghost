/**
 * POST /api/security/org-summary-refresh
 * Admin-only endpoint to trigger on-demand Athena recomputation of the
 * org security summary. Saves to DynamoDB and invalidates in-memory cache.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess, handleAsync } from '../../utils/api-response'
import { organizationCache, CacheTags } from '../../utils/cache-manager'
import { buildSecuritySummaryViaAthena } from '../../utils/security-hub-athena'
import { saveSecuritySummary } from '../../utils/security-summary-store'
import { logger } from '../../utils/logger'
import { requireAdmin } from '../../utils/user-roles'

export default defineEventHandler(handleAsync(async (event) => {
  // Same role rules as every other admin check (session groups, then Graph)
  await requireAdmin(event)

  logger.info('[OrgSecurity] Admin-triggered refresh starting')
  const start = Date.now()

  const result = await buildSecuritySummaryViaAthena()
  const durationMs = Date.now() - start

  await saveSecuritySummary(result, { durationMs })
  await organizationCache.invalidateByTags([CacheTags.SECURITY])

  logger.info(`[OrgSecurity] Admin refresh complete in ${durationMs}ms`)

  return sendSuccess(event, {
    message: 'Security summary refreshed',
    computeDurationMs: durationMs,
    totalFindings: result.totalFindings,
    totalAccounts: result.totalAccounts,
  })
}))
