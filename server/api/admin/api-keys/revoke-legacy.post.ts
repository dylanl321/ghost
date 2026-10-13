import { defineEventHandler, readBody } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { revokeLegacyIntegrationKeys } from '../../../utils/api-keys'

/**
 * Explicit cutover operation. It never revokes dedicated VMaaS keys or keys
 * created for the v1 contract, and defaults to a read-only preview.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ dryRun?: boolean }>(event)
  const dryRun = body?.dryRun !== false
  const keyIds = await revokeLegacyIntegrationKeys(dryRun)
  return {
    success: true,
    data: {
      dryRun,
      affectedCount: keyIds.length,
      keyIds
    }
  }
})
