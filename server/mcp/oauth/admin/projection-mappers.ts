/**
 * OAuth Administration — pure provider→projection mappers.
 *
 * Pure functions that translate a raw provider artifact payload into an
 * allowlisted projection DTO. Kept separate from the service so they can be
 * unit/property tested without DynamoDB or the provider.
 *
 * SAFETY (Requirement 5.4 / 16.2, design "projection/backfill consistency
 * model"): mappers read only non-secret metadata and NEVER carry through a
 * client secret, registration access token, authorization code, or any
 * credential. They do not infer historical timestamps or fabricate activity —
 * an unknown timestamp stays absent rather than being invented. The redactor is
 * still applied to the result as defence in depth by the service.
 */

import type {
  IsoDateTime,
  OAuthApplicationDetail,
  OAuthApplicationOwnership,
  OAuthCoverageMetadata,
  OAuthDeploymentContext,
  OAuthGrantSummary
} from '#shared/types/oauth-administration'
import type { OAuthProviderArtifact } from './types'

/** Read a string field from an untyped payload, when present and non-empty. */
function readString(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Read a string-array field from an untyped payload, dropping non-strings. */
function readStringArray(payload: Record<string, unknown>, key: string): string[] {
  const value = payload[key]
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

/** Convert an epoch-seconds field to an ISO timestamp, when it is a finite number. */
function epochSecondsToIso(payload: Record<string, unknown>, key: string): IsoDateTime | undefined {
  const value = payload[key]
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return new Date(value * 1000).toISOString()
}

/** Whether any registered redirect URI is a native loopback address. */
export function redirectsAllowLoopback(redirectUris: string[]): boolean {
  return redirectUris.some((uri) => {
    try {
      const { hostname } = new URL(uri)
      return hostname === '127.0.0.1' || hostname === '::1' || hostname === 'localhost'
    } catch {
      return false
    }
  })
}

/**
 * A newly seeded projection is derived entirely from observed provider state,
 * so its coverage is `complete` and freshness `fresh` at collection time. The
 * availability is `available` because the provider record was read.
 */
function seedMetadata(collectedAt: IsoDateTime): OAuthCoverageMetadata {
  return { coverage: 'complete', freshness: 'fresh', availability: 'available', collectedAt }
}

/**
 * Map a provider `Client` artifact to a safe application detail projection.
 *
 * A dynamically registered client that carries no administrator policy metadata
 * is classified `unassigned` and its origin is `dynamic` (Requirement 5.2); the
 * backfill never claims it is approved, inactive, or blocked. Only native public
 * clients are represented, matching the provider profile.
 */
export function mapClientArtifact(
  ctx: OAuthDeploymentContext,
  artifact: OAuthProviderArtifact,
  collectedAt: IsoDateTime
): OAuthApplicationDetail {
  const payload = artifact.payload
  const redirectUris = readStringArray(payload, 'redirect_uris')
  const scope = readString(payload, 'scope')
  const permittedScopes = scope ? scope.split(' ').filter(Boolean) : readStringArray(payload, 'scope')
  const ownership: OAuthApplicationOwnership = {}

  return {
    clientId: artifact.id,
    name: readString(payload, 'client_name'),
    type: 'native-public',
    // A backfilled client has no administrator policy metadata yet, so it is a
    // dynamic, unassigned registration until explicitly adopted (task 8.1).
    origin: 'dynamic',
    ownership,
    lifecycle: 'unassigned',
    // Provider metadata does not carry a reliable creation timestamp; leave it
    // absent rather than inventing one (Requirement 5.4).
    createdAt: undefined,
    observedUse: undefined,
    redirectPolicy: {
      redirectUris,
      allowsLoopback: redirectsAllowLoopback(redirectUris)
    },
    permittedResources: [],
    permittedScopes,
    // Revision anchors optimistic concurrency for later edits; the collection
    // time is a stable, observed value (never a fabricated version).
    revision: collectedAt,
    updatedAt: collectedAt,
    metadata: seedMetadata(collectedAt)
  }
}

/**
 * Map a provider `Grant` artifact to a safe grant summary projection.
 *
 * Requested and consented scopes are kept distinct; the subject display is
 * omitted (it requires the activity capability and is added by a capability-
 * gated read path, not the maintenance backfill). Absent timestamps stay
 * absent rather than being inferred.
 */
export function mapGrantArtifact(
  _ctx: OAuthDeploymentContext,
  artifact: OAuthProviderArtifact,
  collectedAt: IsoDateTime
): OAuthGrantSummary {
  const payload = artifact.payload
  const scope = readString(payload, 'scope')
  const consentedScopes = scope ? scope.split(' ').filter(Boolean) : readStringArray(payload, 'scope')
  const resources = payload.resources && typeof payload.resources === 'object' && !Array.isArray(payload.resources)
    ? Object.keys(payload.resources as Record<string, unknown>)
    : []

  return {
    grantReference: artifact.id,
    clientReference: readString(payload, 'clientId') || readString(payload, 'client_id') || 'unknown',
    // Subject display requires the activity capability; the backfill stores only
    // the opaque subject reference.
    subjectReference: readString(payload, 'accountId'),
    // The provider grant records only the consented scope set. Requested scopes
    // are an attempt-time observation the backfill does not have, so it stays
    // empty rather than duplicating consented scopes as "requested".
    requestedScopes: [],
    consentedScopes,
    resource: resources[0],
    consentedAt: epochSecondsToIso(payload, 'iat'),
    expiresAt: epochSecondsToIso(payload, 'exp'),
    lastObservedRefreshAt: undefined,
    metadata: seedMetadata(collectedAt)
  }
}
