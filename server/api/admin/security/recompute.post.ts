/**
 * POST /api/admin/security/recompute
 * Triggers Athena recomputation of the org security summary.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/user-roles'
import { buildSecuritySummaryViaAthena } from '../../../utils/security-hub-athena'
import { saveSecuritySummary } from '../../../utils/security-summary-store'
import { organizationCache, CacheTags } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  logger.info('[AdminSecurity] Admin-triggered recomputation starting')
  const start = Date.now()

  try {
    const result = await buildSecuritySummaryViaAthena()
    const durationMs = Date.now() - start

    await saveSecuritySummary(result, { durationMs })
    await organizationCache.invalidateByTags([CacheTags.SECURITY])

    logger.info(`[AdminSecurity] Recomputation complete in ${durationMs}ms`)

    return sendSuccess(event, {
      computeDurationMs: durationMs,
      totalFindings: result.totalFindings,
      totalAccounts: result.totalAccounts,
      orgRiskScore: result.orgRiskScore,
      complianceRate: result.complianceRate,
    })
  } catch (err: any) {
    logger.error('[AdminSecurity] Recomputation failed:', err.message)
    throw createError({ statusCode: 500, message: err.message || 'Recomputation failed' })
  }
})
