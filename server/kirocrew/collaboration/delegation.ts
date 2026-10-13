/**
 * Protected delegated Graph handling for current Team_Space membership.
 *
 * Feature: shared-investigations (task 2.2). Requirement 4.3 requires
 * Current_Membership to be resolved from the *current* Microsoft Entra group
 * object identifiers published for the Team_Space — never from a grant-time
 * group snapshot. GHOST already stores a `GhostMcpIdentity.groups` array that is
 * captured at token-grant time; collaboration authorization MUST NOT treat that
 * snapshot as authorization (design.md "Authorization": "Team membership uses
 * Entra group object identifiers, not names, email addresses, client claims, or
 * grant-time snapshots").
 *
 * This module owns only the delegation half of that check: it persists and
 * renews the minimal protected delegated Graph credential needed to ask Entra,
 * on demand, whether the stored Authenticated_Subject is currently a member of
 * the Team_Space's group object identifiers. The TeamSpaceAuthorizer (task 2.3)
 * consumes the delegated access token this module returns and performs the
 * bounded five-minute membership cache and the actual group query.
 *
 * It reuses GHOST's existing protected-delegation primitives (the KMS
 * secret-vault used by `server/mcp/oauth/delegated-graph.ts`) rather than adding
 * a parallel secret store, and it stores the credential under a
 * collaboration-specific key + encryption context so it is isolated from the MCP
 * delegated-Graph credential.
 *
 * Requirements 3.6, 3.7, 4.3, 4.4, 4.5, 4.6, 24.3.
 */

import { deleteItem, getItem, putItem } from '../../utils/dynamodb'
import { getOAuthTableConfig } from '../../mcp/config'
import { decryptMcpSecret, encryptMcpSecret, isMcpSecretVaultEnabled } from '../../mcp/secret-vault'

/**
 * The minimal protected delegation collaboration persists per subject. Only the
 * rotating refresh credential is durable; the short-lived access token is a
 * cached optimization renewed from it. No group snapshot is stored here: current
 * membership is always resolved live from Entra using this delegation.
 */
interface CollaborationGraphDelegation {
  /** Rotating delegated refresh credential. Never returned to callers. */
  refreshToken: string
  /** Cached short-lived delegated Graph access token, if still fresh. */
  accessToken?: string
  /** Epoch milliseconds when the cached access token expires. */
  accessTokenExpiresAt?: number
}

interface StoredCollaborationDelegation {
  ciphertext: string
  tenantId: string
  updatedAt: string
}

/**
 * The delegated refresh credential is kept only as long as GHOST's own MCP
 * delegation (90 days). Re-consent refreshes it; it is not authorization on its
 * own — every membership decision still queries Entra live.
 */
const COLLABORATION_GRAPH_DELEGATION_TTL_SECONDS = 90 * 24 * 60 * 60

/** Skew applied before an access token expires so a request never races expiry. */
const ACCESS_TOKEN_RENEWAL_SKEW_MS = 60_000

/**
 * Typed outcomes for resolving the protected delegation required to check
 * current membership. These map directly to Requirement 4.3-4.6 / 24.3 and to
 * the client-facing `reauth_required` vs. fail-closed distinction:
 *
 *  - `available`     — a current delegated Graph access token is ready; the
 *                      authorizer may perform the live membership query.
 *  - `missing`       — no delegation is persisted for this subject (collaboration
 *                      consent was never granted). Fail closed; the client
 *                      resolves this with `reauth_required` (Requirement 3.9).
 *  - `revoked`       — Entra rejected the refresh credential (invalid_grant /
 *                      interaction_required); the stored delegation was purged.
 *                      Fail closed; `reauth_required` (Requirement 3.9, 4.6).
 *  - `insufficient`  — the delegation exists but does not carry the Graph
 *                      permission needed to read directory membership. Fail
 *                      closed; `reauth_required` (Requirement 3.9).
 *  - `temporarily_unavailable` — the delegation is intact but Entra/KMS could
 *                      not be reached right now. This is retryable and, per
 *                      Requirement 4.5/24.3, still fails closed once the
 *                      membership cache lifetime is exceeded.
 *
 * None of these outcomes leaks the refresh credential, the access token, group
 * object identifiers, or storage detail (Requirement 3.10, 3.11, 24.2).
 */
export type CollaborationDelegationStatus =
  | 'available'
  | 'missing'
  | 'revoked'
  | 'insufficient'
  | 'temporarily_unavailable'

export interface CollaborationDelegationAvailable {
  readonly status: 'available'
  /**
   * A current delegated Graph access token the authorizer uses to query live
   * membership. Callers must not persist or log this value.
   */
  readonly accessToken: string
  readonly tenantId: string
  /** Epoch milliseconds when this access token expires. */
  readonly expiresAt: number
}

export interface CollaborationDelegationUnavailable {
  readonly status: Exclude<CollaborationDelegationStatus, 'available'>
  /** Whether a later retry could succeed without new user consent. */
  readonly retryable: boolean
}

export type CollaborationDelegationResult =
  | CollaborationDelegationAvailable
  | CollaborationDelegationUnavailable

function available(
  accessToken: string,
  tenantId: string,
  expiresAt: number
): CollaborationDelegationAvailable {
  return { status: 'available', accessToken, tenantId, expiresAt }
}

function unavailable(
  status: Exclude<CollaborationDelegationStatus, 'available'>
): CollaborationDelegationUnavailable {
  // Only a transient failure is worth retrying without new consent. Missing,
  // revoked, and insufficient all require re-authorization first.
  return { status, retryable: status === 'temporarily_unavailable' }
}

function artifactKey(subject: string) {
  return { artifactId: `CollaborationGraphDelegation#${subject}` }
}

function encryptionContext(subject: string) {
  return { purpose: 'kirocrew-collaboration-graph-membership', subject }
}

/**
 * The encrypted-at-rest delegation record and its tenant, as loaded from the
 * durable store. Mirrors the persisted `StoredCollaborationDelegation` shape but
 * carries the already-decrypted delegation the runtime works with.
 */
export interface LoadedCollaborationDelegation {
  readonly delegation: CollaborationGraphDelegation
  readonly tenantId: string
}

/**
 * Durable persistence seam for the protected delegation. Production wiring uses
 * the KMS secret-vault + DynamoDB store; tests supply an in-memory store so every
 * typed outcome is exercised without real AWS. `load` returning `null` means no
 * delegation is persisted (`missing`); a thrown error means the store was
 * unreachable (`temporarily_unavailable`).
 */
export interface CollaborationGraphDelegationStore {
  load(subject: string): Promise<LoadedCollaborationDelegation | null>
  save(subject: string, tenantId: string, delegation: CollaborationGraphDelegation): Promise<boolean>
  remove(subject: string): Promise<void>
}

/**
 * Seam over the Entra token endpoint, durable store, and server clock so the
 * authorizer tests can drive every typed outcome without a real directory or
 * AWS. Production wiring uses `defaultCollaborationGraphDelegationRuntime`.
 */
export interface CollaborationGraphDelegationRuntime {
  /**
   * Exchange the rotating refresh credential for a delegated Graph access token.
   * Mirrors the existing MCP delegated-Graph refresh call. Returns the raw Entra
   * token response; this module classifies it into a typed outcome.
   */
  exchangeRefreshToken(input: {
    tenantId: string
    refreshToken: string
  }): Promise<EntraTokenResponse>
  /** Durable delegation store (KMS + DynamoDB in production). */
  store: CollaborationGraphDelegationStore
  now(): number
}

/**
 * The subset of the Entra token response this module interprets. Membership
 * requires the directory read permission; if the returned scope lacks it the
 * delegation is `insufficient`.
 */
export interface EntraTokenResponse {
  ok: boolean
  status: number
  access_token?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  error?: string
  error_description?: string
}

/**
 * The delegated Graph permission required to read a subject's current group
 * membership. Without it the delegation cannot answer membership and is treated
 * as `insufficient` rather than silently allowing access.
 */
export const REQUIRED_GRAPH_MEMBERSHIP_SCOPE = 'GroupMember.Read.All'

function entraLoginBaseUrl(): string {
  return process.env.ENTRA_LOGIN_BASE_URL || 'https://login.microsoftonline.us'
}

function entraAppCredentials(): { clientId: string; clientSecret: string } | null {
  const clientId = process.env.ENTRA_CLIENT_ID || process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_ID
  const clientSecret =
    process.env.ENTRA_CLIENT_SECRET || process.env.NUXT_OIDC_PROVIDERS_ENTRA_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

/** Production durable store: KMS-encrypted delegation records in DynamoDB. */
export const defaultCollaborationGraphDelegationStore: CollaborationGraphDelegationStore = {
  load: loadDelegation,
  save: saveDelegation,
  remove: deleteCollaborationGraphDelegation
}

export const defaultCollaborationGraphDelegationRuntime: CollaborationGraphDelegationRuntime = {
  store: defaultCollaborationGraphDelegationStore,
  async exchangeRefreshToken({ tenantId, refreshToken }) {
    const credentials = entraAppCredentials()
    if (!credentials) {
      // Missing application credentials is an environment fault, not a user
      // consent problem: treat it as transient so the authorizer fails closed
      // without forcing a pointless re-authentication.
      return { ok: false, status: 0, error: 'app_credentials_unconfigured' }
    }
    const response = await fetch(`${entraLoginBaseUrl()}/${tenantId}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        scope: `openid offline_access ${REQUIRED_GRAPH_MEMBERSHIP_SCOPE}`
      })
    })
    const body = (await response.json().catch(() => ({}))) as Omit<EntraTokenResponse, 'ok' | 'status'>
    return { ok: response.ok, status: response.status, ...body }
  },
  now() {
    return Date.now()
  }
}

/**
 * True when collaboration can persist protected delegation at all. Delegation is
 * stored KMS-encrypted; without the secret vault we never persist a plaintext
 * refresh credential (Requirement 3.10, mirrors `isMcpGraphDelegationEnabled`).
 */
export function isCollaborationGraphDelegationEnabled(): boolean {
  return isMcpSecretVaultEnabled()
}

async function saveDelegation(
  subject: string,
  tenantId: string,
  delegation: CollaborationGraphDelegation
): Promise<boolean> {
  if (!isMcpSecretVaultEnabled()) return false
  const config = getOAuthTableConfig()
  await putItem(
    config.tableName,
    {
      ...artifactKey(subject),
      model: 'CollaborationGraphDelegation',
      payload: {
        ciphertext: await encryptMcpSecret(JSON.stringify(delegation), encryptionContext(subject)),
        tenantId,
        updatedAt: new Date().toISOString()
      } satisfies StoredCollaborationDelegation,
      ttl: Math.floor(Date.now() / 1000) + COLLABORATION_GRAPH_DELEGATION_TTL_SECONDS
    },
    config.environment,
    config.accountId
  )
  return true
}

/**
 * Persist (or replace) the protected delegated Graph refresh credential for a
 * subject. Called during collaboration enablement / consent. Only the refresh
 * credential is stored; no group snapshot is retained (Requirement 4.3, 24.3).
 * Returns `false` when no secret vault is configured, in which case the
 * credential is intentionally not persisted in plaintext.
 */
export async function saveCollaborationGraphDelegation(
  subject: string,
  tenantId: string,
  refreshToken: string
): Promise<boolean> {
  return saveDelegation(subject, tenantId, { refreshToken })
}

/** Remove a subject's delegation (on revocation or explicit sign-out). */
export async function deleteCollaborationGraphDelegation(subject: string): Promise<void> {
  const config = getOAuthTableConfig()
  await deleteItem(config.tableName, artifactKey(subject), config.environment, config.accountId)
}

async function loadDelegation(
  subject: string
): Promise<{ delegation: CollaborationGraphDelegation; tenantId: string } | null> {
  if (!isMcpSecretVaultEnabled()) return null
  const config = getOAuthTableConfig()
  const item = (await getItem(
    config.tableName,
    artifactKey(subject),
    config.environment,
    config.accountId
  )) as { payload?: StoredCollaborationDelegation } | null
  if (!item?.payload?.ciphertext) return null
  const plaintext = await decryptMcpSecret(item.payload.ciphertext, encryptionContext(subject))
  return {
    delegation: JSON.parse(plaintext) as CollaborationGraphDelegation,
    tenantId: item.payload.tenantId
  }
}

function scopeIncludesMembershipPermission(scope: string | undefined): boolean {
  if (!scope) return false
  return scope
    .split(' ')
    .some((granted) => granted.toLowerCase().endsWith(REQUIRED_GRAPH_MEMBERSHIP_SCOPE.toLowerCase()))
}

/**
 * Resolve the protected delegation required to check current membership for a
 * subject, renewing the short-lived delegated Graph access token when needed.
 *
 * This is the ONLY membership-authorization input this module exposes. It never
 * returns, and callers must never fall back to, a grant-time group snapshot
 * (Requirement 4.3, 24.3). The caller (TeamSpaceAuthorizer) uses the returned
 * access token to query Entra for the *current* group object identifiers.
 *
 * Every failure is a typed non-`available` outcome; nothing here throws for an
 * expected authorization condition, so the authorizer can fail closed uniformly.
 */
export async function resolveCollaborationGraphDelegation(
  subject: string,
  runtime: CollaborationGraphDelegationRuntime = defaultCollaborationGraphDelegationRuntime
): Promise<CollaborationDelegationResult> {
  let loaded: LoadedCollaborationDelegation | null
  try {
    loaded = await runtime.store.load(subject)
  } catch {
    // The credential is persisted but KMS/DynamoDB could not be reached to read
    // it. This is transient, not a consent problem — fail closed, allow retry.
    return unavailable('temporarily_unavailable')
  }

  if (!loaded) return unavailable('missing')

  const { delegation, tenantId } = loaded
  const now = runtime.now()

  // Reuse a still-fresh cached access token rather than renewing every check.
  if (delegation.accessToken && (delegation.accessTokenExpiresAt || 0) > now + ACCESS_TOKEN_RENEWAL_SKEW_MS) {
    return available(delegation.accessToken, tenantId, delegation.accessTokenExpiresAt!)
  }

  let token: EntraTokenResponse
  try {
    token = await runtime.exchangeRefreshToken({ tenantId, refreshToken: delegation.refreshToken })
  } catch {
    return unavailable('temporarily_unavailable')
  }

  if (!token.ok || !token.access_token) {
    // A rejected refresh credential is a revocation: purge it so the next check
    // reports `missing`/`revoked` rather than retrying a dead grant.
    if (token.error === 'invalid_grant' || token.error === 'interaction_required') {
      try {
        await runtime.store.remove(subject)
      } catch {
        // Best-effort purge; the outcome is still `revoked`.
      }
      return unavailable('revoked')
    }
    // Any other non-success (network, 5xx, unconfigured app) is transient.
    return unavailable('temporarily_unavailable')
  }

  // A successful refresh that does not carry the directory read permission
  // cannot answer membership: treat it as insufficient, not as access.
  if (!scopeIncludesMembershipPermission(token.scope)) {
    return unavailable('insufficient')
  }

  const expiresAt = now + (token.expires_in || 3600) * 1000
  try {
    await runtime.store.save(subject, tenantId, {
      refreshToken: token.refresh_token || delegation.refreshToken,
      accessToken: token.access_token,
      accessTokenExpiresAt: expiresAt
    })
  } catch {
    // Persisting the rotated credential failed; the access token we just
    // obtained is still usable for this request, so proceed with it.
  }

  return available(token.access_token, tenantId, expiresAt)
}
