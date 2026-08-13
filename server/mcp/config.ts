import { randomBytes } from 'node:crypto'

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

export function isProductionEnvironment(): boolean {
  return ['production', 'prod'].includes((process.env.NODE_ENV || '').toLowerCase())
}

export function getGhostBaseUrl(): URL {
  const configured = process.env.GHOST_MCP_BASE_URL || process.env.NUXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const url = new URL(configured)
  url.pathname = '/'
  url.search = ''
  url.hash = ''
  return url
}

export function getMcpResourceUrl(): URL {
  return new URL('/mcp', getGhostBaseUrl())
}

export function getOAuthIssuer(): string {
  return (process.env.GHOST_OAUTH_ISSUER || getGhostBaseUrl().origin).replace(/\/$/, '')
}

export function getAllowedMcpHosts(): string[] {
  const configured = (process.env.GHOST_MCP_ALLOWED_HOSTS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return [...new Set([getGhostBaseUrl().hostname, ...configured, ...(!isProductionEnvironment() ? LOCAL_HOSTS : [])])]
}

export function getAllowedMcpOrigins(): string[] {
  const configured = (process.env.GHOST_MCP_ALLOWED_ORIGINS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => new URL(value).hostname)
  return [...new Set([getGhostBaseUrl().hostname, ...configured, ...(!isProductionEnvironment() ? LOCAL_HOSTS : [])])]
}

export function getOAuthCookieKeys(): string[] {
  const keys = (process.env.GHOST_OAUTH_COOKIE_KEYS || process.env.NUXT_OIDC_SESSION_SECRET || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length >= 32)

  if (keys.length > 0) return keys
  if (isProductionEnvironment()) throw new Error('GHOST_OAUTH_COOKIE_KEYS must contain at least one 32-character key')
  return [randomBytes(32).toString('hex')]
}

export function getRequestStateKey(): string {
  const key = process.env.GHOST_MCP_REQUEST_STATE_KEY || process.env.NUXT_OIDC_SESSION_SECRET
  if (key && Buffer.byteLength(key) >= 32) return key
  if (isProductionEnvironment()) throw new Error('GHOST_MCP_REQUEST_STATE_KEY must be at least 32 bytes')
  return 'ghost-mcp-development-request-state-key-change-me'
}

export function getOAuthTableConfig() {
  return {
    tableName: process.env.GHOST_OAUTH_TABLE_NAME || 'ghost-oauth-artifacts',
    environment: (process.env.GHOST_OAUTH_TABLE_ENVIRONMENT || 'govcloud') as 'commercial' | 'govcloud',
    accountId: process.env.AWS_DEPLOYMENT_ACCOUNT_ID || undefined
  }
}

export function useDurableOAuthStore(): boolean {
  return isProductionEnvironment() || Boolean(process.env.GHOST_OAUTH_TABLE_NAME)
}

export function getMcpAuditTableConfig() {
  return {
    tableName: process.env.GHOST_MCP_AUDIT_TABLE_NAME || 'ghost-mcp-audit',
    environment: (process.env.GHOST_MCP_AUDIT_TABLE_ENVIRONMENT || 'govcloud') as 'commercial' | 'govcloud',
    accountId: process.env.AWS_DEPLOYMENT_ACCOUNT_ID || undefined
  }
}

export function getMcpEvidenceTableConfig() {
  return {
    tableName: process.env.GHOST_MCP_EVIDENCE_TABLE_NAME || 'ghost-mcp-evidence',
    environment: (process.env.GHOST_MCP_EVIDENCE_TABLE_ENVIRONMENT || 'govcloud') as 'commercial' | 'govcloud',
    accountId: process.env.AWS_DEPLOYMENT_ACCOUNT_ID || undefined
  }
}

export function getMcpUsageDailyTableConfig() {
  return {
    tableName: process.env.GHOST_MCP_USAGE_DAILY_TABLE_NAME || 'ghost-mcp-usage-daily',
    environment: (process.env.GHOST_MCP_USAGE_DAILY_TABLE_ENVIRONMENT || 'govcloud') as 'commercial' | 'govcloud',
    accountId: process.env.AWS_DEPLOYMENT_ACCOUNT_ID || undefined
  }
}
