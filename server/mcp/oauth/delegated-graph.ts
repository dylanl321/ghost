import type { H3Event } from 'h3'
import { deleteItem, getItem, putItem } from '../../utils/dynamodb'
import { logger } from '../../utils/logger'
import { getOAuthTableConfig } from '../config'
import { decryptMcpSecret, encryptMcpSecret, isMcpSecretVaultEnabled } from '../secret-vault'
import type { GhostMcpPrincipal } from '../types'

interface StoredGraphDelegation {
  ciphertext: string
  tenantId: string
  updatedAt: string
}

interface GraphTokenBundle {
  refreshToken: string
  accessToken?: string
  accessTokenExpiresAt?: number
}

const GRAPH_DELEGATION_TTL_SECONDS = 90 * 24 * 60 * 60

function artifactKey(subject: string) {
  return { artifactId: `GraphDelegation#${subject}` }
}

function encryptionContext(subject: string) {
  return { purpose: 'ghost-mcp-graph-refresh', subject }
}

export function isMcpGraphDelegationEnabled(): boolean {
  return isMcpSecretVaultEnabled()
}

async function saveGraphTokenBundle(subject: string, tenantId: string, bundle: GraphTokenBundle): Promise<boolean> {
  if (!isMcpSecretVaultEnabled()) {
    logger.warn('[MCP Graph] Delegated token storage is disabled because no KMS key is configured')
    return false
  }

  const config = getOAuthTableConfig()
  const now = new Date().toISOString()
  await putItem(config.tableName, {
    ...artifactKey(subject),
    model: 'GraphDelegation',
    payload: {
      ciphertext: await encryptMcpSecret(JSON.stringify(bundle), encryptionContext(subject)),
      tenantId,
      updatedAt: now
    },
    ttl: Math.floor(Date.now() / 1000) + GRAPH_DELEGATION_TTL_SECONDS
  }, config.environment, config.accountId)
  return true
}

export async function saveMcpGraphDelegation(subject: string, tenantId: string, refreshToken: string): Promise<boolean> {
  return saveGraphTokenBundle(subject, tenantId, { refreshToken })
}

export async function deleteMcpGraphDelegation(subject: string): Promise<void> {
  const config = getOAuthTableConfig()
  await deleteItem(config.tableName, artifactKey(subject), config.environment, config.accountId)
}

async function loadMcpGraphDelegation(subject: string): Promise<{ bundle: GraphTokenBundle; tenantId: string } | null> {
  if (!isMcpSecretVaultEnabled()) return null

  const config = getOAuthTableConfig()
  const item = await getItem(config.tableName, artifactKey(subject), config.environment, config.accountId) as {
    payload?: StoredGraphDelegation
  } | null
  if (!item?.payload?.ciphertext) return null

  const plaintext = await decryptMcpSecret(item.payload.ciphertext, encryptionContext(subject))
  return {
    bundle: JSON.parse(plaintext) as GraphTokenBundle,
    tenantId: item.payload.tenantId
  }
}

function graphReauthenticationError(message = 'Sign in to GHOST again to renew Microsoft Graph access.'): Error {
  const error = new Error(message)
  error.name = 'GRAPH_REAUTH_REQUIRED'
  return error
}

async function refreshGraphAccessToken(principal: GhostMcpPrincipal): Promise<string> {
  const delegation = await loadMcpGraphDelegation(principal.subject)
  if (!delegation) throw graphReauthenticationError()
  if (delegation.bundle.accessToken && (delegation.bundle.accessTokenExpiresAt || 0) > Date.now() + 60_000) {
    return delegation.bundle.accessToken
  }

  const clientId = process.env.ENTRA_CLIENT_ID || process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_ID
  const clientSecret = process.env.ENTRA_CLIENT_SECRET || process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('Entra application credentials are not configured.')

  const loginBase = process.env.ENTRA_LOGIN_BASE_URL || 'https://login.microsoftonline.us'
  const response = await fetch(`${loginBase}/${delegation.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: delegation.bundle.refreshToken
    })
  })
  const token = await response.json() as {
    access_token?: string
    refresh_token?: string
    expires_in?: number
    error?: string
    error_description?: string
  }
  if (!response.ok || !token.access_token) {
    if (token.error === 'invalid_grant' || token.error === 'interaction_required') {
      await deleteMcpGraphDelegation(principal.subject)
      throw graphReauthenticationError(token.error_description)
    }
    const error = new Error(`Microsoft Graph token refresh failed: ${token.error || `HTTP ${response.status}`}`)
    error.name = 'GRAPH_TOKEN_REFRESH_FAILED'
    throw error
  }

  await saveGraphTokenBundle(principal.subject, delegation.tenantId, {
    refreshToken: token.refresh_token || delegation.bundle.refreshToken,
    accessToken: token.access_token,
    accessTokenExpiresAt: Date.now() + (token.expires_in || 3600) * 1000
  })
  return token.access_token
}

export async function createMcpDelegatedGraphEvent(principal: GhostMcpPrincipal): Promise<H3Event> {
  const accessToken = await refreshGraphAccessToken(principal)
  return {
    node: { req: { headers: { authorization: `Bearer ${accessToken}` } } },
    context: { datasetExportService: true, mcpDelegatedGraph: true }
  } as unknown as H3Event
}
