import { randomUUID } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { exportJWK, generateKeyPair, type JWK } from 'jose'
import Provider from 'oidc-provider'
import { logger } from '../../utils/logger'
import { getGhostBaseUrl, getMcpResourceUrl, getOAuthCookieKeys, getOAuthIssuer, isProductionEnvironment, useDurableOAuthStore } from '../config'
import { GHOST_MCP_SCOPES } from '../types'
import { DynamoOidcAdapter } from './adapter'
import { deleteMcpGraphDelegation } from './delegated-graph'
import { getGhostMcpIdentity } from './identity'

let providerPromise: Promise<Provider> | undefined
export const GHOST_REFRESH_TOKEN_ROTATION = false

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

function isPrivateAddress(address: string): boolean {
  if (address === '::1' || address === '0:0:0:0:0:0:0:1') return true
  if (address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe8') || address.startsWith('fe9') || address.startsWith('fea') || address.startsWith('feb')) return true
  if (!isIP(address)) return true
  const octets = address.split('.').map(Number)
  if (octets.length !== 4) return false
  return octets[0] === 10 || octets[0] === 127 || octets[0] === 0 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
}

async function isSafeClientMetadataUrl(clientId: string): Promise<boolean> {
  const url = new URL(clientId)
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) return false
  if (['localhost', 'localhost.localdomain'].includes(url.hostname.toLowerCase())) return false
  const addresses = await lookup(url.hostname, { all: true, verbatim: true })
  return addresses.length > 0 && addresses.every(result => !isPrivateAddress(result.address))
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

async function createProvider(): Promise<Provider> {
  const issuer = getOAuthIssuer()
  const resource = getMcpResourceUrl().href
  const jwks = await loadJwks()
  const configuration: any = {
    adapter: useDurableOAuthStore() ? DynamoOidcAdapter : undefined,
    clients: [],
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
    // Codex uses the MCP consent screen without sending OIDC prompt=consent, which
    // makes oidc-provider strip offline_access before its default refresh policy.
    issueRefreshToken: async (_ctx: unknown, client: RefreshTokenClient) => shouldIssueGhostRefreshToken(client),
    // Codex stores MCP credentials locally. A rotating token is consumed before
    // the client has durably saved its replacement, making startup retries fail
    // if that persistence step is interrupted. Keep the 30-day token stable.
    rotateRefreshToken: GHOST_REFRESH_TOKEN_ROTATION,
    features: {
      devInteractions: { enabled: false },
      registration: {
        enabled: true,
        initialAccessToken: false,
        issueRegistrationAccessToken: true
      },
      registrationManagement: { enabled: true, rotateRegistrationAccessToken: true },
      clientIdMetadataDocument: {
        enabled: true,
        ack: 'draft-02',
        allowFetch: async (_ctx: unknown, clientId: string) => isSafeClientMetadataUrl(clientId),
        allowClient: async () => true,
        cacheDuration: { min: 30, max: 3600 }
      },
      resourceIndicators: {
        enabled: true,
        defaultResource: async () => resource,
        useGrantedResource: async () => true,
        getResourceServerInfo: async (_ctx: unknown, requestedResource: string) => {
          if (requestedResource !== resource) throw new Error('Unknown OAuth resource')
          return {
            scope: GHOST_MCP_SCOPES.join(' '),
            audience: resource,
            accessTokenTTL: 3600,
            accessTokenFormat: 'opaque'
          }
        }
      },
      userinfo: { enabled: false },
      introspection: { enabled: false },
      revocation: { enabled: true }
    },
    routes: {
      authorization: '/oauth/authorize',
      token: '/oauth/token',
      registration: '/oauth/register',
      jwks: '/oauth/jwks',
      revocation: '/oauth/revoke'
    },
    interactions: {
      url: (_ctx: unknown, interaction: { uid: string }) => `/oauth/consent/${interaction.uid}`
    },
    ttl: {
      AccessToken: 3600,
      AuthorizationCode: 600,
      Grant: 30 * 24 * 60 * 60,
      Interaction: 600,
      RefreshToken: 30 * 24 * 60 * 60,
      Session: 8 * 60 * 60
    },
    findAccount: async (_ctx: unknown, subject: string) => {
      const identity = await getGhostMcpIdentity(subject)
      if (!identity) return undefined
      return {
        accountId: identity.subject,
        claims: async () => ({ sub: identity.subject, name: identity.displayName, email: identity.email })
      }
    },
    extraTokenClaims: async (_ctx: unknown, token: { accountId?: string }) => {
      if (!token.accountId) return {}
      const identity = await getGhostMcpIdentity(token.accountId)
      return identity ? { oid: identity.oid, email: identity.email, name: identity.displayName, tid: identity.tenantId } : {}
    }
  }

  const provider = new Provider(issuer, configuration)
  provider.proxy = true
  provider.on('server_error', (_ctx: unknown, error: Error) => logger.error('[MCP OAuth] Provider error', error))
  provider.on('grant.success', (ctx: any) => {
    if (ctx.oidc?.params?.grant_type === 'refresh_token') {
      logger.info('[MCP OAuth] Refresh grant succeeded', { clientId: ctx.oidc.client?.clientId })
    }
  })
  provider.on('grant.error', (ctx: any, error: Error) => {
    logger.warn('[MCP OAuth] Refresh grant failed', {
      grantType: ctx.oidc?.params?.grant_type,
      clientId: ctx.oidc?.client?.clientId,
      error: error.name,
      message: error.message
    })
  })
  provider.on('grant.destroyed', (grant: { accountId?: string }) => {
    if (grant.accountId) {
      void deleteMcpGraphDelegation(grant.accountId).catch(error => {
        logger.error('[MCP Graph] Failed to remove delegated token after grant revocation', error)
      })
    }
  })
  logger.info('[MCP OAuth] Provider initialized', { issuer, resource, baseUrl: getGhostBaseUrl().origin })
  return provider
}

export function getOAuthProvider(): Promise<Provider> {
  providerPromise ||= createProvider()
  return providerPromise
}
