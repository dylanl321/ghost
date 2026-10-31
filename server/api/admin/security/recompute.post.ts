/**
 * POST /api/admin/security/recompute
 * Triggers Athena recomputation of the org security summary.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/user-roles'
import { refreshSecuritySummary } from '../../../utils/security-summary-store'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  logger.info('[AdminSecurity] Admin-triggered recomputation starting')
  const start = Date.now()

  try {
    const result = await refreshSecuritySummary()
    const durationMs = Date.now() - start

    logger.info(`[AdminSecurity] Recomputation complete in ${durationMs}ms`)

    return sendSuccess(event, {
      computeDurationMs: durationMs,
      totalFindings: result.totalFindings,
      totalAccounts: result.totalAccounts,
      orgRiskScore: result.orgRiskScore,
      complianceRate: result.complianceRate,
      dataSource: result.dataSource,
    })
  } catch (err: any) {
    logger.error('[AdminSecurity] Recomputation failed:', err.message)
    throw createError({ statusCode: 500, message: err.message || 'Recomputation failed' })
  }
})
