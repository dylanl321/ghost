/**
 * GHOST_Token_Identity_Path adapter for collaboration.
 *
 * Feature: shared-investigations (task 2.1). Collaboration receives the bearer
 * value as an Opaque_Access_Token and passes it UNCHANGED to GHOST's existing
 * token-to-identity path, backed by `provider.AccessToken.find()` (or the
 * repository-equivalent adapter). That existing path alone validates token
 * format and authenticity and loads the stored Authenticated_Subject plus the
 * returned authorization context.
 *
 * This adapter deliberately does NOT decode the token, verify a JWT signature,
 * interpret claims, or derive identity from bearer contents or client actor
 * fields (Requirements 3.12, 3.13, 4.1, 24.25). It exposes only the stored
 * Tenant/object identity and the returned resource audience + granted scopes
 * needed by `CollaborationTokenAuthorizer`.
 */

import { getGhostMcpIdentity } from '../../mcp/oauth/identity'
import { getOAuthProvider } from '../../mcp/oauth/provider'
import type { AuthenticatedSubject, ValidatedTokenContext } from './types'

/**
 * Result of resolving an Opaque_Access_Token. `null` means the existing identity
 * path rejected or could not resolve the token; callers translate that into a
 * non-disclosing `reauth_required` without probing which precondition failed.
 */
export type TokenIdentityResult = ValidatedTokenContext | null

/**
 * The narrow view of GHOST's stored access token that collaboration consumes.
 * It matches the shape returned by `provider.AccessToken.find()` and used by the
 * existing `requireKiroCrewToken` path. Collaboration reads only these returned
 * fields; it never parses the raw bearer string.
 */
interface StoredAccessToken {
  accountId?: string
  clientId?: string
  exp?: number
  aud?: string | string[]
  scope?: string
}

/**
 * The stored identity fields collaboration needs. Matches `GhostMcpIdentity`
 * (`oid` is the Microsoft Entra object identifier; `tenantId` is the Entra
 * tenant). Presentation fields (email/displayName) are intentionally excluded:
 * they are snapshots, never authorization keys.
 */
interface StoredIdentity {
  oid: string
  tenantId: string
}

/**
 * Seam for the existing GHOST_Token_Identity_Path so tests can supply a stored
 * token + identity without standing up the OIDC provider. Production wiring uses
 * `defaultGhostTokenIdentityPath`, which is exactly the primitives the existing
 * config path (`requireKiroCrewToken`) already uses.
 */
export interface GhostTokenIdentityPath {
  /** Look up a stored access token by its opaque value. */
  findAccessToken(opaqueToken: string): Promise<StoredAccessToken | null | undefined>
  /** Load the stored identity for a resolved account/subject. */
  findIdentity(subject: string): Promise<StoredIdentity | null | undefined>
  /** Current server time in epoch seconds (injectable for expiry tests). */
  now(): number
}

export const defaultGhostTokenIdentityPath: GhostTokenIdentityPath = {
  async findAccessToken(opaqueToken: string) {
    const provider = await getOAuthProvider()
    return provider.AccessToken.find(opaqueToken) as Promise<StoredAccessToken | null | undefined>
  },
  async findIdentity(subject: string) {
    return getGhostMcpIdentity(subject)
  },
  now() {
    return Math.floor(Date.now() / 1000)
  }
}

function normalizeAudience(aud: StoredAccessToken['aud']): string[] {
  if (!aud) return []
  return (Array.isArray(aud) ? aud : [aud]).filter((value): value is string => Boolean(value))
}

function parseScopes(scope: StoredAccessToken['scope']): Set<string> {
  return new Set(String(scope || '').split(' ').filter(Boolean))
}

/**
 * Resolve an Opaque_Access_Token through the existing GHOST_Token_Identity_Path.
 *
 * The `opaqueToken` is forwarded byte-for-byte to `findAccessToken`; this module
 * performs no format, signature, issuer, expiry-claim, or identity-claim
 * interpretation of its own. It only enforces the invariants the existing path
 * already returns (a resolvable account/client and a non-past `exp`), then loads
 * the stored identity. On any failure it returns `null` so the caller emits a
 * single non-disclosing outcome.
 */
export async function resolveCollaborationToken(
  opaqueToken: string,
  path: GhostTokenIdentityPath = defaultGhostTokenIdentityPath
): Promise<TokenIdentityResult> {
  const accessToken = await path.findAccessToken(opaqueToken)
  if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp) return null
  if (accessToken.exp <= path.now()) return null

  const audiences = normalizeAudience(accessToken.aud)
  if (audiences.length === 0) return null

  const identity = await path.findIdentity(accessToken.accountId)
  if (!identity?.oid || !identity.tenantId) return null

  const subject: AuthenticatedSubject = { tenantId: identity.tenantId, entraObjectId: identity.oid }
  return {
    subject,
    // A stored token has exactly one Crew resource audience; collaboration
    // enforces the required audience in the authorizer. When the identity path
    // returns multiple, the required-audience check still selects the Crew one.
    resourceAudience: audiences[0]!,
    tokenScopes: parseScopes(accessToken.scope)
  }
}

/** Exposed for the authorizer/tests that must verify all returned audiences. */
export async function resolveCollaborationTokenWithAudiences(
  opaqueToken: string,
  path: GhostTokenIdentityPath = defaultGhostTokenIdentityPath
): Promise<{ context: ValidatedTokenContext; audiences: string[] } | null> {
  const accessToken = await path.findAccessToken(opaqueToken)
  if (!accessToken?.accountId || !accessToken.clientId || !accessToken.exp) return null
  if (accessToken.exp <= path.now()) return null

  const audiences = normalizeAudience(accessToken.aud)
  if (audiences.length === 0) return null

  const identity = await path.findIdentity(accessToken.accountId)
  if (!identity?.oid || !identity.tenantId) return null

  return {
    context: {
      subject: { tenantId: identity.tenantId, entraObjectId: identity.oid },
      resourceAudience: audiences[0]!,
      tokenScopes: parseScopes(accessToken.scope)
    },
    audiences
  }
}
