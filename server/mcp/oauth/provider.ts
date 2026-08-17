import { randomUUID } from 'node:crypto'
import { exportJWK, generateKeyPair, type JWK } from 'jose'
import Provider from 'oidc-provider'
import { logger } from '../../utils/logger'
import { getGhostBaseUrl, getMcpResourceUrl, getOAuthAuthorizationTtlSeconds, getOAuthCookieKeys, getOAuthIssuer, isProductionEnvironment, useDurableOAuthStore } from '../config'
import { GHOST_MCP_SCOPES } from '../types'
import { DynamoOidcAdapter } from './adapter'
import { deleteMcpGraphDelegation } from './delegated-graph'
import { getGhostMcpIdentity } from './identity'

let providerPromise: Promise<Provider> | undefined
export const GHOST_REFRESH_TOKEN_ROTATION = false

export type GhostRefreshFailureReason =
  | 'token_not_found'
  | 'token_expired'
  | 'token_reused'
  | 'grant_not_found'
  | 'grant_expired'
  | 'client_mismatch'
  | 'account_missing'
  | 'other'

interface RefreshTokenClient {
  applicationType?: string
  clientAuthMethod?: string
  grantTypeAllowed(grantType: string): boolean
}

export function shouldIssueGhostRefreshToken(client: RefreshTokenClient): boolean {
  return client.applicationType === 'native' &&
    client.clientAuthMethod === 'none' &&
    client.grantTypeAllowed('refresh_token')
}

export function classifyGhostRefreshFailure(error: { error_detail?: unknown; message?: unknown }): GhostRefreshFailureReason {
  const detail = String(error.error_detail || error.message || '').toLowerCase()
  if (detail.includes('refresh token not found')) return 'token_not_found'
  if (detail.includes('refresh token is expired')) return 'token_expired'
  if (detail.includes('refresh token already used') || detail.includes('already consumed')) return 'token_reused'
  if (detail.includes('grant not found')) return 'grant_not_found'
  if (detail.includes('grant is expired')) return 'grant_expired'
  if (detail.includes('client mismatch')) return 'client_mismatch'
  if (detail.includes('referenced account not found')) return 'account_missing'
  return 'other'
}

export function createGhostRefreshEvent(status: 'success' | 'failure', reason?: GhostRefreshFailureReason, timestamp = new Date().toISOString()) {
  return {
    type: 'mcp_oauth' as const,
    event: 'refresh' as const,
    timestamp,
    status,
    ...(reason ? { reason } : {})
  }
}

function recordRefreshEvent(status: 'success' | 'failure', reason?: GhostRefreshFailureReason): void {
  process.stdout.write(JSON.stringify(createGhostRefreshEvent(status, reason)) + '\n')
}

async function loadJwks(): Promise<{ keys: JWK[] }> {
  const configured = process.env.GHOST_OAUTH_JWKS_JSON
  if (configured) return JSON.parse(configured) as { keys: JWK[] }
  if (isProductionEnvironment()) throw new Error('GHOST_OAUTH_JWKS_JSON is required in production')

  const { privateKey } = await generateKeyPair('RS256', { extractable: true })
  const jwk = await exportJWK(privateKey)
  jwk.kid = randomUUID()
  jwk.alg = 'RS256'
  jwk.use = 'sig'
  logger.warn('[MCP OAuth] Using an ephemeral development signing key')
  return { keys: [jwk] }
}

export function createGhostOAuthConfiguration(input: {
  resource: string
  jwks: { keys: JWK[] }
  adapter?: any
  clients?: Array<Record<string, unknown>>
  findAccount?: (ctx: unknown, subject: string) => Promise<any>
  extraTokenClaims?: (ctx: unknown, token: { accountId?: string }) => Promise<Record<string, unknown>>
}): any {
  const { resource, jwks } = input
  const authorizationTtl = getOAuthAuthorizationTtlSeconds()
  return {
    adapter: input.adapter,
    clients: input.clients || [],
    jwks,
    cookies: {
      keys: getOAuthCookieKeys(),
      long: { httpOnly: true, sameSite: 'lax', secure: isProductionEnvironment(), signed: true },
      short: { httpOnly: true, sameSite: 'lax', secure: isProductionEnvironment(), signed: true }
    },
    claims: { openid: ['sub'], profile: ['name'], email: ['email'] },
    conformIdTokenClaims: false,
    responseTypes: ['code'],
    grantTypes: ['authorization_code', 'refresh_token'],
    clientAuthMethods: ['none'],
    pkce: { required: () => true, methods: ['S256'] },
    scopes: ['openid', 'offline_access', ...GHOST_MCP_SCOPES],
    // Codex omits prompt=consent, so explicitly issue refresh tokens to native public clients.
    issueRefreshToken: async (_ctx: unknown, client: RefreshTokenClient) => shouldIssueGhostRefreshToken(client),
    // A stable token avoids consuming the credential before Codex persists a rotated replacement.
    rotateRefreshToken: GHOST_REFRESH_TOKEN_ROTATION,
    features: {
      devInteractions: { enabled: false },
      registration: { enabled: true, initialAccessToken: false, issueRegistrationAccessToken: true },
      registrationManagement: { enabled: true, rotateRegistrationAccessToken: true },
      // GHOST supports registered clients only; this prevents URL-valued client IDs and outbound metadata fetches.
      clientIdMetadataDocument: { enabled: false },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => resource,
        useGrantedResource: async () => true,
        getResourceServerInfo: async (_ctx: unknown, requestedResource: string) => {
          if (requestedResource !== resource) throw new Error('Unknown OAuth resource')
          return { scope: GHOST_MCP_SCOPES.join(' '), audience: resource, accessTokenTTL: 3600, accessTokenFormat: 'opaque' }
        }
      },
      userinfo: { enabled: false },
      introspection: { enabled: false },
      revocation: { enabled: true }
    },
    routes: {
      authorization: '/oauth/authorize', token: '/oauth/token', registration: '/oauth/register',
      jwks: '/oauth/jwks', revocation: '/oauth/revoke'
    },
    interactions: { url: (_ctx: unknown, interaction: { uid: string }) => `/oauth/consent/${interaction.uid}` },
    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 600,
      Grant: authorizationTtl,
      Interaction: 600,
      RefreshToken: authorizationTtl,
      Session: 8 * 60 * 60
    },
    findAccount: input.findAccount || (async (_ctx: unknown, subject: string) => {
      const identity = await getGhostMcpIdentity(subject)
      if (!identity) return undefined
      return { accountId: identity.subject, claims: async () => ({ sub: identity.subject, name: identity.displayName, email: identity.email }) }
    }),
    extraTokenClaims: input.extraTokenClaims || (async (_ctx: unknown, token: { accountId?: string }) => {
      if (!token.accountId) return {}
      const identity = await getGhostMcpIdentity(token.accountId)
      return identity ? { oid: identity.oid, email: identity.email, name: identity.displayName, tid: identity.tenantId } : {}
    })
  }
}

export function attachGhostOAuthEvents(provider: Provider): void {
  provider.on('server_error', (_ctx: unknown, error: Error) => logger.error('[MCP OAuth] Provider error', error))
  provider.on('grant.success', (ctx: any) => {
    if (ctx.oidc?.params?.grant_type === 'refresh_token') recordRefreshEvent('success')
  })
  provider.on('grant.error', (ctx: any, error: Error & { error_detail?: unknown }) => {
    if (ctx.oidc?.params?.grant_type === 'refresh_token') recordRefreshEvent('failure', classifyGhostRefreshFailure(error))
  })
  provider.on('grant.destroyed', (grant: { accountId?: string }) => {
    if (grant.accountId) {
      void deleteMcpGraphDelegation(grant.accountId).catch(error => logger.error('[MCP Graph] Failed to remove delegated token after grant revocation', error))
    }
  })
}

async function createProvider(): Promise<Provider> {
  const issuer = getOAuthIssuer()
  const resource = getMcpResourceUrl().href
  const jwks = await loadJwks()
  const configuration = createGhostOAuthConfiguration({
    resource,
    jwks,
    adapter: useDurableOAuthStore() ? DynamoOidcAdapter : undefined,
  })

  const provider = new Provider(issuer, configuration)
  provider.proxy = true
  attachGhostOAuthEvents(provider)
  logger.info('[MCP OAuth] Provider initialized', { issuer, resource, authorizationTtlSeconds: getOAuthAuthorizationTtlSeconds(), baseUrl: getGhostBaseUrl().origin })
  return provider
}

export function getOAuthProvider(): Promise<Provider> {
  providerPromise ||= createProvider()
  return providerPromise
}
