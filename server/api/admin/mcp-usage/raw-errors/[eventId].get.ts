import { getRouterParam } from 'h3'
import { getItem } from '../../../../utils/dynamodb'
import { requireAdmin } from '../../../../utils/user-roles'
import { getMcpRawErrorsTableConfig } from '../../../../mcp/config'
import type { GhostMcpRawErrorRecord } from '../../../../mcp/types'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const eventId = getRouterParam(event, 'eventId')
  if (!eventId) throw createError({ statusCode: 400, statusMessage: 'Event ID is required' })

  const config = getMcpRawErrorsTableConfig()
  const record = await getItem(config.tableName, { eventId }, config.environment, config.accountId) as GhostMcpRawErrorRecord | null
  if (!record || record.ttl <= Math.floor(Date.now() / 1000)) {
    return { success: true, data: { available: false, reason: 'expired_or_unavailable' } }
  }

  return { success: true, data: { available: true, record } }
})
