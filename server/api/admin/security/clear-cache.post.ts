/**
 * POST /api/admin/security/clear-cache
 * Clears the L1 in-memory cache for security data.
 */

import { defineEventHandler } from 'h3'
import { sendSuccess } from '../../../utils/api-response'
import { requireAdmin } from '../../../utils/user-roles'
import { organizationCache, CacheKeys, CacheTags } from '../../../utils/cache-manager'
import { logger } from '../../../utils/logger'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  await organizationCache.delete(CacheKeys.securityOrgSummary())
  const invalidated = await organizationCache.invalidateByTags([CacheTags.SECURITY])

  logger.info(`[AdminSecurity] Memory cache cleared (${invalidated} entries invalidated)`)

  return sendSuccess(event, { cleared: true, invalidated })
})
