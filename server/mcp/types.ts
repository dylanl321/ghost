import type { AuthInfo } from '@modelcontextprotocol/server'

export const GHOST_MCP_SCOPES = [
  'ghost.read',
  'ghost.ai.invoke',
  'ghost.collaborate',
  'ghost.credentials.issue'
] as const

export type GhostMcpScope = typeof GHOST_MCP_SCOPES[number]

export interface GhostMcpIdentity {
  subject: string
  oid: string
  tenantId: string
  email: string
  displayName: string
  groups: string[]
  roles: string[]
  createdAt: string
  updatedAt: string
}

export interface GhostMcpPrincipal extends GhostMcpIdentity {
  clientId: string
  scopes: GhostMcpScope[]
}

export interface GhostMcpAuthInfo extends AuthInfo {
  extra: {
    principal: GhostMcpPrincipal
  }
}

export interface GhostToolMetadata {
  asOf: string
  source: string
  warnings?: string[]
  nextCursor?: string
}

export interface GhostToolEnvelope<T> {
  data: T
  metadata: GhostToolMetadata
}

export interface GhostMcpAuditEvent {
  eventId: string
  timestamp: string
  subject: string
  email: string
  clientId: string
  tool: string
  scopes: string[]
  status: 'success' | 'error' | 'denied' | 'confirmation_required'
  durationMs: number
  targetIds?: string[]
  changedFields?: string[]
  errorCode?: string
  eventDate?: string
  environment?: 'commercial' | 'govcloud' | 'unknown'
  source?: string
  resultCount?: number
  serializedSizeBytes?: number
  truncated?: boolean
  fallback?: boolean
  cacheHit?: boolean
  warningCount?: number
  retryable?: boolean
  errorCategory?: string
  correlationId?: string
  toolSequence?: number
  targetCount?: number
  teamKeys?: string[]
  interactionType?: 'lookup' | 'analysis' | 'generation' | 'credential' | 'evidence' | 'output' | 'write'
  ttl: number
}
