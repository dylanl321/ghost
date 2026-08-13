import { createHash, randomUUID } from 'node:crypto'
import { putItem } from '../utils/dynamodb'
import { logger } from '../utils/logger'
import { getMcpAuditTableConfig } from './config'
import type { GhostMcpAuditEvent, GhostMcpPrincipal } from './types'
import { findAccountByIdentifierOptimized } from '../utils/account-lookup-optimized'

const AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60
const workflowSequences = new Map<string, { sequence: number; expiresAt: number }>()

export async function recordMcpAudit(input: {
  principal: GhostMcpPrincipal
  tool: string
  status: GhostMcpAuditEvent['status']
  durationMs: number
  targetIds?: string[]
  changedFields?: string[]
  errorCode?: string
  result?: any
  environment?: 'commercial' | 'govcloud' | 'unknown'
}): Promise<void> {
  try {
    const timestamp = new Date().toISOString()
    const envelope = input.result?.structuredContent
    const metadata = envelope?.metadata || {}
    const data = envelope?.data
    const resultCount = Array.isArray(data) ? data.length
      : Array.isArray(data?.records) ? data.records.length
        : Array.isArray(data?.results) ? data.results.length
          : Array.isArray(data?.entries) ? data.entries.length
            : undefined
    const correlationId = createHash('sha256')
      .update(`${input.principal.subject}\0${input.principal.clientId}\0${Math.floor(Date.now() / (30 * 60 * 1000))}`)
      .digest('hex').slice(0, 32)
    const sequence = nextWorkflowSequence(correlationId)
    const interactionType: GhostMcpAuditEvent['interactionType'] = input.tool.includes('evidence') ? 'evidence'
      : input.tool.includes('credential') ? 'credential'
        : input.tool.includes('docs.answer') || input.tool.includes('ai.') ? 'generation'
          : input.tool.includes('summary') || input.tool.includes('health') || input.tool.includes('remediation') ? 'analysis'
            : input.tool.includes('download') || input.tool.includes('outputs') ? 'output'
              : input.tool.includes('create') || input.tool.includes('update') || input.tool.includes('delete') ? 'write' : 'lookup'
    const teamKeys = await resolveTeamKeys(input.targetIds || [])
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
      // Keep analytics metadata-only: target IDs are reduced to a count before persistence.
      changedFields: input.changedFields,
      errorCode: input.errorCode,
      eventDate: timestamp.slice(0, 10),
      environment: input.environment || 'unknown',
      source: metadata.source,
      resultCount,
      serializedSizeBytes: envelope ? Buffer.byteLength(JSON.stringify(envelope), 'utf8') : 0,
      truncated: Boolean(metadata.truncated || metadata.nextCursor),
      fallback: Boolean(metadata.fallback),
      cacheHit: Boolean(metadata.cacheHit),
      warningCount: Array.isArray(metadata.warnings) ? metadata.warnings.length : 0,
      retryable: Boolean(envelope?.error?.retryable),
      errorCategory: input.errorCode ? classifyErrorCategory(input.errorCode) : undefined,
      correlationId,
      toolSequence: sequence,
      targetCount: input.targetIds?.length || 0,
      teamKeys,
      interactionType,
      ttl: Math.floor(Date.now() / 1000) + AUDIT_RETENTION_SECONDS
    }
    const config = getMcpAuditTableConfig()
    await putItem(config.tableName, event, config.environment, config.accountId)
  } catch (error) {
    logger.error('[MCP Audit] Failed to persist audit event', error)
  }
}

function nextWorkflowSequence(correlationId: string): number {
  const now = Date.now()
  const current = workflowSequences.get(correlationId)
  if (!current || current.expiresAt <= now) {
    workflowSequences.set(correlationId, { sequence: 1, expiresAt: now + 30 * 60 * 1000 })
    return 1
  }
  current.sequence++
  return current.sequence
}

async function resolveTeamKeys(targetIds: string[]): Promise<string[]> {
  const teams = new Set<string>()
  for (const targetId of targetIds.slice(0, 100)) {
    try {
      const account = (await findAccountByIdentifierOptimized(targetId, { includeDecommissioned: true }))?.account
      const team = account?.departmentNumber || account?.pepDepartment || account?.linesOfBusiness
      if (team) teams.add(String(team))
    } catch {
      // Telemetry must never block a tool when optional attribution is unavailable.
    }
  }
  return teams.size ? [...teams].sort() : ['unassigned']
}

function classifyErrorCategory(code: string): string {
  const value = code.toLowerCase()
  if (value.includes('throttl') || value.includes('timeout')) return 'transient'
  if (value.includes('access') || value.includes('auth') || value.includes('denied')) return 'authorization'
  if (value.includes('not_found') || value.includes('invalid') || value.includes('ambiguous')) return 'validation'
  return 'internal'
}
