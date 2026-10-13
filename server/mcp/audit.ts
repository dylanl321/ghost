import { createHash, randomUUID } from 'node:crypto'
import { getItem, putItem } from '../utils/dynamodb'
import { logger } from '../utils/logger'
import { getConfigValue } from '../utils/site-config'
import { getMcpAuditTableConfig, getMcpRawErrorsTableConfig, getOAuthTableConfig } from './config'
import type {
  GhostMcpAuditEvent,
  GhostMcpClientAttribution,
  GhostMcpClientType,
  GhostMcpPrincipal,
  GhostMcpRawErrorRecord
} from './types'
import { findAccountByIdentifierOptimized } from '../utils/account-lookup-optimized'

const AUDIT_RETENTION_SECONDS = 90 * 24 * 60 * 60
const RAW_ERROR_RETENTION_SECONDS = 30 * 24 * 60 * 60
const MAX_RAW_JSON_BYTES = 320_000
const workflowSequences = new Map<string, { sequence: number; expiresAt: number }>()
const oauthClientCache = new Map<string, { value: Record<string, any> | null; expiresAt: number }>()

export interface McpFailureDetails {
  code: string
  explanation: string
  retryable: boolean
  category: string
}

export async function recordMcpAudit(input: {
  principal: GhostMcpPrincipal
  tool: string
  status: GhostMcpAuditEvent['status']
  durationMs: number
  targetIds?: string[]
  changedFields?: string[]
  errorCode?: string
  errorExplanation?: string
  retryable?: boolean
  result?: any
  rawFailure?: unknown
  source?: string
  environment?: 'commercial' | 'govcloud' | 'unknown'
  client?: Partial<GhostMcpClientAttribution>
}): Promise<void> {
  try {
    const now = Date.now()
    const timestamp = new Date(now).toISOString()
    const eventId = randomUUID()
    const envelope = input.result?.structuredContent
    const metadata = envelope?.metadata || {}
    const data = envelope?.data
    const returnedFailure = extractMcpFailure(input.result)
    const failure = input.status === 'error' || input.status === 'denied'
      ? normalizeFailure({
          code: input.errorCode || returnedFailure?.code,
          explanation: input.errorExplanation || returnedFailure?.explanation,
          retryable: input.retryable ?? returnedFailure?.retryable
        })
      : undefined
    const resultCount = Array.isArray(data) ? data.length
      : Array.isArray(data?.records) ? data.records.length
        : Array.isArray(data?.results) ? data.results.length
          : Array.isArray(data?.entries) ? data.entries.length
            : undefined
    const correlationId = createHash('sha256')
      .update(`${input.principal.subject}\0${input.principal.clientId}\0${Math.floor(now / (30 * 60 * 1000))}`)
      .digest('hex').slice(0, 32)
    const sequence = nextWorkflowSequence(correlationId)
    const interactionType: GhostMcpAuditEvent['interactionType'] = input.tool.includes('evidence') ? 'evidence'
      : input.tool.includes('credential') ? 'credential'
        : input.tool.includes('docs.answer') || input.tool.includes('ai.') ? 'generation'
          : input.tool.includes('summary') || input.tool.includes('health') || input.tool.includes('remediation') ? 'analysis'
            : input.tool.includes('download') || input.tool.includes('outputs') ? 'output'
              : input.tool.includes('create') || input.tool.includes('update') || input.tool.includes('delete') ? 'write' : 'lookup'
    const [teamKeys, client] = await Promise.all([
      resolveTeamKeys(input.targetIds || []),
      resolveClientAttribution(input.principal.clientId, input.client)
    ])

    let rawErrorCaptured = false
    if (failure && input.rawFailure !== undefined && await isRawErrorCaptureEnabled()) {
      const rawRecord = prepareRawMcpErrorRecord({
        eventId,
        timestamp,
        tool: input.tool,
        principal: input.principal,
        client,
        errorCode: failure.code,
        rawFailure: input.rawFailure
      }, now)
      try {
        const rawConfig = getMcpRawErrorsTableConfig()
        await putItem(rawConfig.tableName, rawRecord, rawConfig.environment, rawConfig.accountId)
        rawErrorCaptured = true
      } catch (error) {
        logger.error('[MCP Audit] Failed to persist raw error context', error)
      }
    }

    const event: GhostMcpAuditEvent = {
      eventId,
      timestamp,
      subject: input.principal.subject,
      email: input.principal.email,
      displayName: input.principal.displayName,
      clientId: input.principal.clientId,
      client,
      tool: input.tool,
      scopes: input.principal.scopes,
      status: input.status,
      durationMs: Math.round(input.durationMs),
      // Keep normal analytics metadata-only; full failure context has separate access and retention.
      changedFields: input.changedFields,
      errorCode: failure?.code,
      errorExplanation: failure?.explanation,
      rawErrorCaptured,
      eventDate: timestamp.slice(0, 10),
      environment: input.environment || 'unknown',
      source: metadata.source || input.source,
      resultCount,
      serializedSizeBytes: envelope ? safeJsonSize(envelope) : 0,
      truncated: Boolean(metadata.truncated || metadata.nextCursor),
      fallback: Boolean(metadata.fallback),
      cacheHit: Boolean(metadata.cacheHit),
      warningCount: Array.isArray(metadata.warnings) ? metadata.warnings.length : 0,
      retryable: failure?.retryable || false,
      errorCategory: failure?.category,
      correlationId,
      toolSequence: sequence,
      targetCount: input.targetIds?.length || 0,
      teamKeys,
      interactionType,
      ttl: Math.floor(now / 1000) + AUDIT_RETENTION_SECONDS
    }
    const config = getMcpAuditTableConfig()
    await putItem(config.tableName, event, config.environment, config.accountId)
  } catch (error) {
    logger.error('[MCP Audit] Failed to persist audit event', error)
  }
}

export function extractMcpFailure(result: any): McpFailureDetails | undefined {
  if (!result?.isError) return undefined
  const error = result.structuredContent?.error || {}
  return normalizeFailure({
    code: error.code,
    explanation: error.message || result.content?.find((item: any) => item?.type === 'text')?.text,
    retryable: error.retryable
  })
}

function normalizeFailure(input: { code?: unknown; explanation?: unknown; retryable?: unknown }): McpFailureDetails {
  const code = typeof input.code === 'string' && input.code.trim() ? input.code.trim().slice(0, 128) : 'TOOL_ERROR'
  return {
    code,
    explanation: sanitizeErrorExplanation(input.explanation),
    retryable: Boolean(input.retryable),
    category: classifyErrorCategory(code)
  }
}

export function sanitizeErrorExplanation(value: unknown): string {
  const message = typeof value === 'string' && value.trim() ? value.trim() : 'The tool failed unexpectedly.'
  return message
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\b(AKIA|ASIA)[A-Z0-9]{16}\b/g, '[REDACTED_AWS_KEY]')
    .replace(/\b(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/\b(password|secret|token|api[_-]?key|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/([?&](?:code|token|key|secret|signature|password)=)[^&#\s]+/gi, '$1[REDACTED]')
    .slice(0, 1000)
}

const NEVER_CAPTURE_ARGUMENT = /(?:session[_-]?id|credential|access[_-]?key|secret|token|authorization|password|prompt|question|message|content|context|policy|report[_-]?config|payload)/i

function argumentShape(value: unknown): Record<string, unknown> {
  if (value === null) return { type: 'null' }
  if (Array.isArray(value)) return { type: 'array', length: value.length }
  if (typeof value === 'string') return { type: 'string', length: value.length }
  if (typeof value === 'object') return { type: 'object', keys: Object.keys(value as Record<string, unknown>).slice(0, 50), keyCount: Object.keys(value as Record<string, unknown>).length }
  return { type: typeof value }
}

function safeDiagnosticValue(name: string, value: unknown, allowed: Set<string>): unknown {
  if (NEVER_CAPTURE_ARGUMENT.test(name) || !allowed.has(name)) return argumentShape(value)
  if (typeof value === 'string') return value.slice(0, 200)
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value) && value.length <= 20 && value.every(item => ['string', 'number', 'boolean'].includes(typeof item))) {
    return value.map(item => typeof item === 'string' ? item.slice(0, 100) : item)
  }
  return argumentShape(value)
}

/** Build failure diagnostics without retaining caller content or authorization material. */
export function prepareMcpDiagnosticFailure(
  args: unknown,
  failure: unknown,
  safeArgumentNames: string[] = []
): Record<string, unknown> {
  const values = args && typeof args === 'object' && !Array.isArray(args) ? args as Record<string, unknown> : {}
  const allowed = new Set(safeArgumentNames)
  const error = failure instanceof Error
    ? {
        name: failure.name,
        message: sanitizeErrorExplanation(failure.message),
        stack: sanitizeErrorExplanation(failure.stack).slice(0, 4000)
      }
    : {
        code: (failure as any)?.structuredContent?.error?.code || (failure as any)?.code,
        message: sanitizeErrorExplanation((failure as any)?.structuredContent?.error?.message || (failure as any)?.message)
      }
  return {
    arguments: Object.fromEntries(Object.entries(values).map(([name, value]) => [name, safeDiagnosticValue(name, value, allowed)])),
    error
  }
}

export function normalizeMcpClient(input: Partial<GhostMcpClientAttribution>): GhostMcpClientType {
  const text = [input.oauthClientName, input.oauthClientUri, input.oauthSoftwareId, input.mcpClientName, input.userAgent]
    .filter(Boolean).join(' ').toLowerCase()
  if (/claude[ /_-]*code/.test(text)) return 'claude_code'
  if (/chatgpt/.test(text)) return 'chatgpt'
  if (/codex/.test(text) && /desktop/.test(text)) return 'codex_desktop'
  if (/codex-mcp-client/.test(text)) return 'codex_cli'
  if (/codex/.test(text) && /\b(cli|command.line|terminal)\b/.test(text)) return 'codex_cli'
  if (/codex/.test(text)) return 'codex_unknown'
  return text ? 'other' : 'unknown'
}

export function prepareRawMcpErrorRecord(input: {
  eventId: string
  timestamp: string
  tool: string
  principal: GhostMcpPrincipal
  client: GhostMcpClientAttribution
  errorCode: string
  rawFailure: unknown
}, now = Date.now()): GhostMcpRawErrorRecord {
  const expiresAtMs = now + RAW_ERROR_RETENTION_SECONDS * 1000
  const fullJson = safeJsonStringify({
    eventId: input.eventId,
    timestamp: input.timestamp,
    tool: input.tool,
    principal: {
      subject: input.principal.subject,
      clientId: input.principal.clientId,
      scopes: input.principal.scopes
    },
    client: input.client,
    failure: input.rawFailure
  })
  const originalSizeBytes = Buffer.byteLength(fullJson, 'utf8')
  const truncated = originalSizeBytes > MAX_RAW_JSON_BYTES
  const preview = truncated ? Buffer.from(fullJson, 'utf8').subarray(0, MAX_RAW_JSON_BYTES).toString('utf8') : undefined
  const rawJson = truncated ? safeJsonStringify({ truncated: true, preview }) : fullJson
  return {
    eventId: input.eventId,
    timestamp: input.timestamp,
    expiresAt: new Date(expiresAtMs).toISOString(),
    ttl: Math.floor(expiresAtMs / 1000),
    tool: input.tool,
    subject: input.principal.subject,
    errorCode: input.errorCode,
    rawJson,
    truncated,
    originalSizeBytes,
    storedSizeBytes: Buffer.byteLength(rawJson, 'utf8')
  }
}

async function isRawErrorCaptureEnabled(): Promise<boolean> {
  const configured = await getConfigValue<boolean>('mcp.audit.rawErrors.enabled')
  return configured !== false
}

async function resolveClientAttribution(clientId: string, request: Partial<GhostMcpClientAttribution> = {}): Promise<GhostMcpClientAttribution> {
  const oauth = await loadOAuthClient(clientId)
  const attribution: Partial<GhostMcpClientAttribution> = {
    oauthClientName: oauth?.clientName || oauth?.client_name,
    oauthClientUri: oauth?.clientUri || oauth?.client_uri,
    oauthSoftwareId: oauth?.softwareId || oauth?.software_id,
    oauthSoftwareVersion: oauth?.softwareVersion || oauth?.software_version,
    ...request
  }
  return { ...attribution, clientType: normalizeMcpClient(attribution) }
}

async function loadOAuthClient(clientId: string): Promise<Record<string, any> | null> {
  const cached = oauthClientCache.get(clientId)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  try {
    const config = getOAuthTableConfig()
    const item = await getItem(config.tableName, { artifactId: `Client#${clientId}` }, config.environment, config.accountId) as { payload?: Record<string, any> } | null
    const value = item?.payload || null
    oauthClientCache.set(clientId, { value, expiresAt: Date.now() + 10 * 60 * 1000 })
    return value
  } catch {
    return null
  }
}

function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>()
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString()
    if (item instanceof Error) return Object.fromEntries(Object.getOwnPropertyNames(item).map(key => [key, (item as any)[key]]))
    if (item && typeof item === 'object') {
      if (seen.has(item)) return '[Circular]'
      seen.add(item)
    }
    return item
  }) || 'null'
}

function safeJsonSize(value: unknown): number {
  try {
    return Buffer.byteLength(safeJsonStringify(value), 'utf8')
  } catch {
    return 0
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
  if (value.includes('throttl') || value.includes('timeout') || /http_5\d\d/.test(value) || value.includes('unavailable')) return 'transient'
  if (value.includes('access') || value.includes('auth') || value.includes('denied')) return 'authorization'
  if (value.includes('not_found') || value.includes('invalid') || value.includes('ambiguous')) return 'validation'
  return 'internal'
}
