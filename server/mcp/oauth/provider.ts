import { randomUUID } from 'node:crypto'
import { exportJWK, generateKeyPair, type JWK } from 'jose'
import Provider from 'oidc-provider'
import { logger } from '../../utils/logger'
import { getKiroCrewResourceUrl } from '../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../kirocrew/types'
import { getGhostBaseUrl, getMcpResourceUrl, getOAuthAuthorizationTtlSeconds, getOAuthCookieKeys, getOAuthIssuer, isProductionEnvironment, useDurableOAuthStore } from '../config'
import { GHOST_MCP_SCOPES } from '../types'
import { DynamoOidcAdapter } from './adapter'
import { handleMcpGrantDestroyed } from './graph-delegation-cleanup'
import { getGhostMcpIdentity } from './identity'
import { findGrantPointer } from './grant-pointer'
import { getOAuthStageInstrumentation, safeProviderErrorCode } from './admin/stage-instrumentation'
import { readManagedPolicy } from './admin/managed-policy-service'
import { evaluateBoundary, isGrantRevoked } from './admin/lifecycle-enforcement'

let providerPromise: Promise<Provider> | undefined
export const GHOST_REFRESH_TOKEN_ROTATION = false

export interface GhostOAuthResource {
  resource: string
  scopes: readonly string[]
}

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

/**
 * The safe, low-cardinality error code for the PRIMARY mcp_oauth refresh event.
 * ONLY the OAuth protocol `error` field (e.g. `invalid_grant`) is ever read —
 * never the free-form `message` or `error_detail`. Those can embed token or
 * identity material that survives {@link safeProviderErrorCode}'s sanitization
 * as a bare alphanumeric token (e.g. `bearer token=AAAA…` → `bearertokenAAAA…`),
 * so they must not reach it. Returns undefined when the provider exposed no
 * protocol `error` field, so the refresh event omits errorCode entirely.
 */
export function refreshErrorCode(error: { error?: unknown } | undefined): string | undefined {
  // Hand safeProviderErrorCode ONLY the protocol `error` field so its message
  // fallback can never fire. A malformed `error` value is still sanitized and
  // bounded by safeProviderErrorCode.
  return safeProviderErrorCode({ error: typeof error?.error === 'string' ? error.error : undefined })
}

export function createGhostRefreshEvent(status: 'success' | 'failure', reason?: GhostRefreshFailureReason, timestamp = new Date().toISOString(), errorCode?: string) {
  return {
    type: 'mcp_oauth' as const,
    event: 'refresh' as const,
    timestamp,
    status,
    ...(reason ? { reason } : {}),
    // Already-sanitized, low-cardinality provider error code (e.g. `invalid_grant`).
    // Additive only: never tokens, raw descriptions, identity, headers, or stacks.
    ...(errorCode ? { errorCode } : {})
  }
}

export function grantIncludesMcpResource(
  grant: { resources?: Record<string, string> },
  mcpResource = getMcpResourceUrl().href
): boolean {
  return Object.hasOwn(grant.resources || {}, mcpResource)
}

function recordRefreshEvent(status: 'success' | 'failure', reason?: GhostRefreshFailureReason, errorCode?: string): void {
  process.stdout.write(JSON.stringify(createGhostRefreshEvent(status, reason, undefined, errorCode)) + '\n')
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

/**
 * Safe, public-only signing-key metadata for a single JWK. Exposes ONLY the
 * public identification parameters (`kid`, `kty`, `alg`, `use`) — NEVER the
 * private parameters (`d`, `p`, `q`, `dp`, `dq`, `qi`, `k`) or any symmetric
 * key material (Requirement 3.4). This is the shape the OAuth-administration
 * configuration projection consumes so it never touches a private key value.
 */
export interface GhostPublicSigningKeyMetadata {
  kid?: string
  kty?: string
  alg?: string
  use?: string
}

/**
 * The public signing-key observation used by the OAuth administration
 * configuration projection. `source` distinguishes a configured JWKS
 * (`GHOST_OAUTH_JWKS_JSON`) from an ephemeral development key that the provider
 * generated at boot, and `available` is false when no key material could be
 * read at all — in which case the projection reports signing keys as unknown
 * rather than inventing metadata.
 *
 * SAFETY: rotation/expiry dates are intentionally NOT derived here. A JWK
 * carries no certificate-style validity window, so signing-key dates remain
 * unknown unless a deployment explicitly supplies them (Requirement 15.6).
 */
export interface GhostSigningKeyObservation {
  available: boolean
  source: 'configured' | 'ephemeral-development' | 'unavailable'
  keys: GhostPublicSigningKeyMetadata[]
}

/**
 * Project the running provider's JWKS down to safe public metadata only. Reads
 * the same key material the provider is initialized with (`loadJwks`), then
 * strips every field except the public identification parameters. Never throws
 * to a caller: an unreadable/unavailable key set is reported as
 * `available: false` so the administration surface can label signing keys
 * unknown (Requirements 2.5, 3.3, 3.4).
 */
export async function getGhostPublicSigningKeyMetadata(): Promise<GhostSigningKeyObservation> {
  const hasConfiguredJwks = Boolean(process.env.GHOST_OAUTH_JWKS_JSON)
  try {
    const jwks = await loadJwks()
    const keys = (jwks.keys || []).map<GhostPublicSigningKeyMetadata>(key => ({
      // Only public identification parameters are copied out; the private
      // parameters (d/p/q/dp/dq/qi/k) present on the source JWK are never read.
      kid: typeof key.kid === 'string' ? key.kid : undefined,
      kty: typeof key.kty === 'string' ? key.kty : undefined,
      alg: typeof key.alg === 'string' ? key.alg : undefined,
      use: typeof key.use === 'string' ? key.use : undefined
    }))
    return {
      available: keys.length > 0,
      source: hasConfiguredJwks ? 'configured' : 'ephemeral-development',
      keys
    }
  } catch {
    // A missing/invalid JWKS in production (or any read failure) is surfaced as
    // unavailable rather than propagated — the projection stays safe and labels
    // signing keys unknown.
    return { available: false, source: 'unavailable', keys: [] }
  }
}

/**
 * Minimal shape of the OIDC `Grant` model instance the reuse gate inspects.
 * Only the safe references it needs to re-check policy are read.
 */
interface ReusableGrant {
  jti: string
  accountId?: string
  clientId?: string
  /** Consented resource scopes keyed by resource URL, e.g. `{ '<mcp>': 'a b' }`. */
  resources?: Record<string, string>
}

/**
 * Consent-once grant reuse (pure SSO).
 *
 * `oidc-provider`'s default `loadExistingGrant` reuses a grant only when it is
 * already bound to the current OIDC session or carried on the in-flight
 * interaction result. Because Codex starts a fresh browser context per
 * `codex mcp login`, that binding is absent and the user is prompted for
 * consent every time. This helper additionally consults the durable
 * `(subject, clientId)` grant pointer so a previously approved grant is reused
 * across sessions — approve once, then sign in silently.
 *
 * SAFETY — reuse is GATED, never blind (this is why it is not just the default):
 *   - A reused grant is still subject to the managed-lifecycle matrix. If the
 *     client has since been BLOCKED or RETIRED, {@link evaluateBoundary} denies
 *     and we return `undefined` so the normal consent boundary runs its own
 *     (also-denying) enforcement instead of silently resuming.
 *   - A grant under a revocation marker ({@link isGrantRevoked}) is never
 *     reused; the user must re-consent (which mints a fresh grant).
 *   - Account/client identity on the found grant must match the current
 *     request, or it is ignored (the provider also re-checks this).
 * A `null` managed policy (unmanaged dynamic client) is always allowed, so
 * unmanaged clients get consent-once with no behavior change.
 */
export async function loadReusableGhostGrant(ctx: any): Promise<unknown> {
  const provider = ctx?.oidc?.provider
  const account = ctx?.oidc?.account
  const client = ctx?.oidc?.client
  if (!provider || !account?.accountId || !client?.clientId) return undefined

  // 1. Resolve a candidate grant id: the default sources first (in-flight
  //    consent result, then this session's association), then the durable
  //    cross-session pointer for this (subject, client) pair.
  const sessionGrantId = ctx.oidc.result?.consent?.grantId
    || ctx.oidc.session?.grantIdFor?.(client.clientId)
  const grantId = sessionGrantId || await findGrantPointer(account.accountId, client.clientId)
  if (!grantId) return undefined

  const grant = await provider.Grant.find(grantId) as ReusableGrant | undefined
  if (!grant) return undefined

  // 2. Identity must match the current request. The provider re-checks this
  //    too, but we fail closed here rather than hand back a mismatched grant.
  if (grant.accountId !== account.accountId || grant.clientId !== client.clientId) return undefined

  // 3. A revoked grant is never silently reused (task 9 fence).
  if (await isGrantRevoked(grant.jti)) return undefined

  // 4. The managed lifecycle/policy must still permit this client. A blocked or
  //    retired managed client must not resume silently; returning `undefined`
  //    routes it back through the consent boundary, which denies it there.
  const managedPolicy = typeof client.metadata === 'function'
    ? readManagedPolicy(client.metadata() as Record<string, unknown>)
    : null
  if (managedPolicy) {
    const decision = evaluateBoundary(managedPolicy, 'authorize')
    if (!decision.allowed) return undefined
  }

  return grant
}

export function createGhostOAuthConfiguration(input: {
  resource?: string
  resources?: GhostOAuthResource[]
  jwks: { keys: JWK[] }
  adapter?: any
  clients?: Array<Record<string, unknown>>
  findAccount?: (ctx: unknown, subject: string) => Promise<any>
  extraTokenClaims?: (ctx: unknown, token: { accountId?: string }) => Promise<Record<string, unknown>>
}): any {
  const { jwks } = input
  const resources = input.resources?.length
    ? input.resources
    : [{ resource: String(input.resource), scopes: GHOST_MCP_SCOPES }]
  const resourceByUrl = new Map(resources.map(definition => [definition.resource, definition]))
  const defaultResource = resources[0]!.resource
  const supportedScopes = [...new Set(resources.flatMap(definition => [...definition.scopes]))]
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
    scopes: ['openid', 'offline_access', ...supportedScopes],
    // Consent-once (pure SSO): reuse a previously approved grant across sessions
    // for the same (subject, client) so native clients are not re-prompted every
    // sign-in. Reuse is gated on managed lifecycle + grant revocation, so a
    // blocked/retired client or a revoked grant still re-consents (see
    // loadReusableGhostGrant).
    loadExistingGrant: loadReusableGhostGrant,
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
        defaultResource: async () => defaultResource,
        useGrantedResource: async () => true,
        getResourceServerInfo: async (_ctx: unknown, requestedResource: string) => {
          const definition = resourceByUrl.get(requestedResource)
          if (!definition) throw new Error('Unknown OAuth resource')
          return {
            scope: definition.scopes.join(' '),
            audience: definition.resource,
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
  // Fire-and-forget OAuth-administration telemetry. Every `record*` call below
  // returns synchronously and schedules its own background write; none of them
  // may delay or fail OAuth traffic (Requirements 2.3, 4.1, 4.6, 18.3). The
  // existing refresh alarm (`recordRefreshEvent`) keeps its OWN counting and is
  // never touched by this instrumentation, so a refresh event is never counted
  // twice (Requirement 4.7).
  const telemetry = getOAuthStageInstrumentation()

  provider.on('server_error', (ctx: any, error: Error) => {
    logger.error('[MCP OAuth] Provider error', error)
    // A provider-internal fault is a storage/processing boundary observation.
    telemetry.recordProviderEvent('provider-storage', 'failure', ctx, { error: error as any })
  })

  // Authorization-server / protected-resource discovery only emits on failure;
  // discovery success is observed at the metadata route wrappers.
  provider.on('discovery.error', (ctx: any, error: Error) => {
    telemetry.recordProviderEvent('authorization-server-discovery', 'failure', ctx, { error: error as any })
  })

  // Authorization endpoint. Client is bound here, but no subject reference is
  // emitted (the authenticated subject is captured at the consent boundary).
  provider.on('authorization.success', (ctx: any) => {
    telemetry.recordProviderEvent('authorization', 'success', ctx, { includeClient: true, includeResource: true })
  })
  provider.on('authorization.error', (ctx: any, error: Error) => {
    telemetry.recordProviderEvent('authorization', 'failure', ctx, { error: error as any, includeClient: true, includeResource: true })
  })

  // Dynamic client registration (a pre-login stage: no subject/client-owner).
  provider.on('registration_create.success', (ctx: any) => {
    telemetry.recordProviderEvent('registration', 'success', ctx)
  })
  provider.on('registration_create.error', (ctx: any, error: Error) => {
    telemetry.recordProviderEvent('registration', 'failure', ctx, { error: error as any })
  })

  provider.on('grant.success', (ctx: any) => {
    const isRefresh = ctx.oidc?.params?.grant_type === 'refresh_token'
    // Preserve the existing refresh alarm exactly — its own counter is separate.
    if (isRefresh) recordRefreshEvent('success')
    // Admin telemetry: token/code exchange vs refresh are distinct stages.
    telemetry.recordProviderEvent(isRefresh ? 'refresh' : 'token-exchange', 'success', ctx, { includeClient: true, includeResource: true })
  })
  provider.on('grant.error', (ctx: any, error: Error & { error_detail?: unknown; error?: unknown }) => {
    const isRefresh = ctx.oidc?.params?.grant_type === 'refresh_token'
    if (isRefresh) recordRefreshEvent('failure', classifyGhostRefreshFailure(error), refreshErrorCode(error))
    telemetry.recordProviderEvent(isRefresh ? 'refresh' : 'token-exchange', 'failure', ctx, { error: error as any, includeClient: true, includeResource: true })
  })

  // Token revocation endpoint (client-authenticated; no subject reference).
  provider.on('revocation.error', (ctx: any, error: Error) => {
    telemetry.recordProviderEvent('revocation', 'failure', ctx, { error: error as any, includeClient: true })
  })
  provider.on('grant.revoked', (ctx: any) => {
    telemetry.recordProviderEvent('revocation', 'success', ctx, { includeClient: true })
  })

  provider.on('grant.destroyed', (grant: { accountId?: string; jti?: string; resources?: Record<string, string> }) => {
    // Provider-storage observation for a destroyed grant artifact. The grant is
    // a model instance (not a ctx); only its safe presence is recorded.
    telemetry.record({ stage: 'provider-storage', outcome: 'success' })
    if (grant.accountId && grantIncludesMcpResource(grant)) {
      // Task 9.3: the shared per-subject Graph delegation is NOT deleted
      // unconditionally. Instead, determine authoritatively (under a per-user
      // fence, bounded and read-only) whether this was the user's LAST live MCP
      // grant. Another live grant preserves the delegation; uncertain coverage
      // preserves + schedules reconciliation; only a confirmed last live grant
      // permits cleanup (Req 9.3, 9.5, 18.2).
      void handleMcpGrantDestroyed(grant.accountId, grant.jti).catch(error =>
        logger.error('[MCP Graph] Last-grant delegation cleanup failed', error))
    }
  })
}

async function createProvider(): Promise<Provider> {
  const issuer = getOAuthIssuer()
  const mcpResource = getMcpResourceUrl().href
  const kiroCrewResource = getKiroCrewResourceUrl().href
  const jwks = await loadJwks()
  const configuration = createGhostOAuthConfiguration({
    resources: [
      { resource: mcpResource, scopes: GHOST_MCP_SCOPES },
      { resource: kiroCrewResource, scopes: KIROCREW_SCOPES }
    ],
    jwks,
    adapter: useDurableOAuthStore() ? DynamoOidcAdapter : undefined,
  })

  const provider = new Provider(issuer, configuration)
  provider.proxy = true
  attachGhostOAuthEvents(provider)
  logger.info('[Ghost OAuth] Provider initialized', {
    issuer,
    resources: [mcpResource, kiroCrewResource],
    authorizationTtlSeconds: getOAuthAuthorizationTtlSeconds(),
    baseUrl: getGhostBaseUrl().origin
  })
  return provider
}

export function getOAuthProvider(): Promise<Provider> {
  providerPromise ||= createProvider()
  return providerPromise
}
