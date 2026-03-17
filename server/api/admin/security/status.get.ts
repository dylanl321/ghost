/**
 * GET /api/admin/security/status
 * Returns security summary metadata, cache status, and scheduler info.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/user-roles'
import { getSecuritySummaryMetadata, loadSecuritySummary } from '../../../utils/security-summary-store'
import { organizationCache, CacheKeys } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'

const SCHEDULER_ENABLED = process.env.REPORT_SCHEDULER_ENABLED !== 'false'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    // DynamoDB status
    const metadata = await getSecuritySummaryMetadata()
    let dynamodb: any = null
    let summaryPreview: any = null

    if (metadata) {
      dynamodb = {
        exists: true,
        computedAt: metadata.computedAt,
        ageMinutes: metadata.ageMinutes,
        durationMs: metadata.durationMs,
        source: 'athena',
      }

      // Load summary for preview stats
      const summary = await loadSecuritySummary()
      if (summary) {
        summaryPreview = {
          totalFindings: summary.totalFindings,
          totalAccounts: summary.totalAccounts,
          accountsAtRisk: summary.accountsAtRisk,
          orgRiskScore: summary.orgRiskScore,
          complianceRate: summary.complianceRate,
          severityBreakdown: summary.severityBreakdown,
        }
      }
    } else {
      dynamodb = { exists: false }
    }

    // L1 memory cache status
    const cacheInfo = organizationCache.getEntryInfo(CacheKeys.securityOrgSummary())
    const memoryCache = {
      exists: cacheInfo.exists,
      age: cacheInfo.age || null,
      ttl: cacheInfo.ttl || null,
      accessCount: cacheInfo.accessCount ?? 0,
    }

    // Scheduler info
    const scheduler = {
      enabled: SCHEDULER_ENABLED,
      cron: '0 3 * * *',
      description: 'Nightly at 3:00 AM UTC',
    }

    return sendSuccess(event, {
      dynamodb,
      memoryCache,
      scheduler,
      summaryPreview,
    })
  } catch (err: any) {
    logger.error('[AdminSecurity] Status check failed:', err.message)
    throw createError({ statusCode: 500, message: err.message || 'Failed to fetch security status' })
  }
})
