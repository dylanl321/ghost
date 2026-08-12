import { randomUUID } from 'node:crypto'
import { putItem } from '../utils/dynamodb'
import { logger } from '../utils/logger'
import { getMcpAuditTableConfig } from './config'
import type { GhostMcpAuditEvent, GhostMcpPrincipal } from './types'

const AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60

export async function recordMcpAudit(input: {
  principal: GhostMcpPrincipal
  tool: string
  status: GhostMcpAuditEvent['status']
  durationMs: number
  targetIds?: string[]
  changedFields?: string[]
  errorCode?: string
}): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const event: GhostMcpAuditEvent = {
      eventId: randomUUID(),
      timestamp,
      subject: input.principal.subject,
      email: input.principal.email,
      clientId: input.principal.clientId,
      tool: input.tool,
      scopes: input.principal.scopes,
      status: input.status,
      durationMs: Math.round(input.durationMs),
      targetIds: input.targetIds,
      changedFields: input.changedFields,
      errorCode: input.errorCode,
      ttl: Math.floor(Date.now() / 1000) + AUDIT_RETENTION_SECONDS
    }
    const config = getMcpAuditTableConfig()
    await putItem(config.tableName, event, config.environment, config.accountId)
  } catch (error) {
    logger.error('[MCP Audit] Failed to persist audit event', error)
  }
}
