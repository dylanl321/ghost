/**
 * OAuth Administration — safe configuration & signing-key observation projection.
 *
 * Builds the allowlisted {@link OAuthConfiguration} projection for the current
 * deployment from the RUNNING provider/runtime configuration rather than
 * reinventing any values. Every source of truth here is an existing config
 * getter (`server/mcp/config.ts`, `server/kirocrew/config.ts`), the shared scope
 * constants, or the provider factory (`createGhostOAuthConfiguration` /
 * `getGhostPublicSigningKeyMetadata`) — so what the panel shows matches what the
 * provider actually enforces (Requirement 3.1).
 *
 * SAFETY (Requirement 3.2, 3.3, 3.4, 3.5, 15.6):
 *   - Each setting distinguishes `configured`, `effective`, and `observed`
 *     values with an explicit {@link OAuthProvenance}. A value we can only read
 *     from the running implementation is `effective`; a value we cannot
 *     positively determine stays `unknown` (never optimistically filled in).
 *   - Signing keys expose ONLY public JWK metadata (kid/kty/alg/use). Private
 *     parameters (d/p/q/dp/dq/qi/k), cookie keys, config secrets, and credential
 *     documents are never read here and are stripped again by the redactor.
 *   - Release SHA / pipeline ref / image digest / task revision, and signing-key
 *     rotation/expiry dates are reported as UNKNOWN when unavailable. A
 *     certificate-style expiry is NEVER inferred from a JWK (Requirement 15.6).
 *   - Every deployment-required setting is labelled `readOnly` — the panel
 *     offers no save/proposal/merge/deploy/quota-reset action for it.
 *   - `oauthAdminRedactor.redact()` is applied to the assembled projection as
 *     defence in depth before it leaves the service.
 *
 * The service performs NO durable I/O and never scans the provider artifact
 * table. It reads process configuration and the in-memory provider JWKS only,
 * so it is safe to call on any read path.
 */

import type {
  OAuthConfiguration,
  OAuthConfigurationValue,
  OAuthCoverageMetadata,
  OAuthDeploymentContext,
  OAuthProvenance,
  OAuthReleaseEvidence,
  OAuthSigningKeyMetadata
} from '#shared/types/oauth-administration'
import type { OAuthAdminRedactor } from './types'
import { oauthAdminRedactor } from './redactor'
import {
  getMcpResourceUrl,
  getOAuthAuthorizationTtlSeconds,
  getOAuthIssuer,
  useDurableOAuthStore
} from '../../config'
import { getKiroCrewResourceUrl } from '../../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../../kirocrew/types'
import { GHOST_MCP_SCOPES } from '../../types'
import {
  GHOST_REFRESH_TOKEN_ROTATION,
  getGhostPublicSigningKeyMetadata,
  type GhostSigningKeyObservation
} from '../provider'

/**
 * The fixed provider profile the running implementation enforces. These values
 * are hard-coded in `createGhostOAuthConfiguration()` (authorization code +
 * refresh, `none` client authentication, mandatory S256 PKCE, opaque access
 * tokens). Mirroring them here keeps the projection in lockstep with the
 * provider; a divergence is a bug in one of the two, not silently smoothed over.
 */
const PROVIDER_GRANT_TYPES = ['authorization_code', 'refresh_token'] as const
const PROVIDER_CLIENT_AUTH_METHODS = ['none'] as const
const PROVIDER_PKCE_METHODS = ['S256'] as const
const PROVIDER_ACCESS_TOKEN_TTL_SECONDS = 3600
const PROVIDER_ACCESS_TOKEN_FORMAT = 'opaque'

/** Default registration quota mirrored from the register route rate decision. */
const DEFAULT_REGISTRATION_LIMIT_PER_HOUR = 10
const REGISTRATION_WINDOW_SECONDS = 3600

/**
 * Build a read-only configuration value. Deployment-backed settings are always
 * `readOnly: true` (Requirement 3.5): the panel must never offer to edit them.
 */
function readOnlyValue<T>(
  provenance: OAuthProvenance,
  values: { configured?: T, effective?: T, observed?: T }
): OAuthConfigurationValue<T> {
  return { ...values, provenance, readOnly: true }
}

/** Format a TTL expressed in seconds as a safe, human-readable summary. */
function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 'unknown'
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const parts: string[] = []
  if (days) parts.push(`${days}d`)
  if (hours) parts.push(`${hours}h`)
  if (minutes) parts.push(`${minutes}m`)
  if (seconds && !days && !hours) parts.push(`${seconds}s`)
  return parts.length ? parts.join(' ') : `${totalSeconds}s`
}

/**
 * Project the safe public signing-key metadata into the DTO shape. Only the
 * public identification parameters are carried; rotation/expiry dates are left
 * absent (unknown) unless a deployment explicitly supplies them — a JWK alone
 * is never enough to infer an expiry (Requirement 15.6).
 */
function projectSigningKeys(observation: GhostSigningKeyObservation): OAuthSigningKeyMetadata[] {
  if (!observation.available) return []
  return observation.keys.map(key => ({
    keyId: key.kid || 'unknown',
    keyType: key.kty || 'unknown',
    algorithm: key.alg,
    use: key.use
    // rotatedAt / expiresAt intentionally omitted: unknown, never inferred.
  }))
}

/**
 * Release/pipeline/image/task evidence from the deployment environment. Every
 * field is optional and reported as UNKNOWN provenance when the deployment did
 * not inject it (Requirement 3.3). We only read explicit, safe reference
 * strings — never secrets.
 */
function projectReleaseEvidence(): OAuthReleaseEvidence {
  const releaseSha = process.env.GHOST_RELEASE_SHA || process.env.CI_COMMIT_SHA || undefined
  const pipelineReference = process.env.GHOST_PIPELINE_REFERENCE || process.env.CI_PIPELINE_ID || undefined
  const imageDigest = process.env.GHOST_IMAGE_DIGEST || undefined
  const taskRevision = process.env.GHOST_TASK_REVISION || process.env.ECS_TASK_REVISION || undefined
  const anyKnown = Boolean(releaseSha || pipelineReference || imageDigest || taskRevision)
  return {
    releaseSha,
    pipelineReference,
    imageDigest,
    taskRevision,
    // When the deployment injected any reference it is effective evidence;
    // otherwise all fields are unknown (never fabricated).
    provenance: anyKnown ? 'effective' : 'unknown'
  }
}

/**
 * Builds the safe effective OAuth configuration projection for the current
 * deployment. Reuses existing config getters and the provider factory profile;
 * applies the redactor as defence in depth.
 */
export class OAuthConfigurationService {
  private readonly redactor: OAuthAdminRedactor

  constructor(redactor: OAuthAdminRedactor = oauthAdminRedactor) {
    this.redactor = redactor
  }

  /**
   * Build the {@link OAuthConfiguration} projection. Async only because the
   * provider signing-key metadata is read from the (possibly lazily generated)
   * JWKS. All other values are synchronous reads of runtime configuration.
   *
   * @param ctx server-resolved deployment context (never caller-supplied)
   * @param now evaluation clock for `collectedAt`; injected for deterministic tests
   */
  async buildConfiguration(
    ctx: OAuthDeploymentContext,
    now: Date = new Date()
  ): Promise<OAuthConfiguration> {
    const issuer = getOAuthIssuer()
    const mcpResource = getMcpResourceUrl().href
    const kiroCrewResource = getKiroCrewResourceUrl().href

    // The provider derives its supported scope set as the union of every
    // resource's scopes plus `openid` and `offline_access` (see
    // createGhostOAuthConfiguration). Mirror that derivation rather than
    // hard-coding a divergent list.
    const resourceScopes = [...new Set([...GHOST_MCP_SCOPES, ...KIROCREW_SCOPES])]
    const supportedScopes = [...new Set(['openid', 'offline_access', ...resourceScopes])]

    const authorizationTtlSeconds = getOAuthAuthorizationTtlSeconds()
    const durable = useDurableOAuthStore()
    const signingObservation = await getGhostPublicSigningKeyMetadata()
    const registrationLimit = Number(
      process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || DEFAULT_REGISTRATION_LIMIT_PER_HOUR
    )

    // Endpoints are derived from the issuer + the fixed provider route table.
    const publicEndpoints = [
      `${issuer}/oauth/authorize`,
      `${issuer}/oauth/token`,
      `${issuer}/oauth/register`,
      `${issuer}/oauth/jwks`,
      `${issuer}/oauth/revoke`
    ]

    const issuerConfigured = Boolean(process.env.GHOST_OAUTH_ISSUER)
    const registrationLimitConfigured = Boolean(process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR)
    const ttlConfigured = Boolean(process.env.GHOST_OAUTH_AUTHORIZATION_TTL_DAYS)

    const metadata: OAuthCoverageMetadata = {
      // Configuration is read directly from the running implementation, so
      // coverage is complete and availability follows whether we could read the
      // signing keys. Freshness is `fresh` because it reflects the live process.
      coverage: 'complete',
      freshness: 'fresh',
      availability: signingObservation.available ? 'available' : 'unavailable',
      collectedAt: now.toISOString()
    }

    const configuration: OAuthConfiguration = {
      deployment: ctx.environment,

      // Issuer: `effective` when a deployment set GHOST_OAUTH_ISSUER, otherwise
      // it is the configured base-URL origin.
      issuer: readOnlyValue<string>(issuerConfigured ? 'effective' : 'configured', {
        configured: issuer,
        effective: issuer
      }),

      // Approved public endpoints derive from the issuer + fixed route table.
      publicEndpoints: readOnlyValue<string[]>('effective', {
        configured: publicEndpoints,
        effective: publicEndpoints
      }),

      // Two configured resources: MCP and Kiro Crew.
      resources: readOnlyValue<string[]>('effective', {
        configured: [mcpResource, kiroCrewResource],
        effective: [mcpResource, kiroCrewResource]
      }),

      // Supported scopes are the provider's derived union.
      scopes: readOnlyValue<string[]>('effective', {
        configured: supportedScopes,
        effective: supportedScopes
      }),

      // Grant types, client auth methods, and PKCE are fixed provider policy.
      grantTypes: readOnlyValue<string[]>('effective', {
        configured: [...PROVIDER_GRANT_TYPES],
        effective: [...PROVIDER_GRANT_TYPES]
      }),
      clientAuthMethods: readOnlyValue<string[]>('effective', {
        configured: [...PROVIDER_CLIENT_AUTH_METHODS],
        effective: [...PROVIDER_CLIENT_AUTH_METHODS]
      }),
      pkce: readOnlyValue<string[]>('effective', {
        configured: [...PROVIDER_PKCE_METHODS],
        effective: [...PROVIDER_PKCE_METHODS]
      }),

      // Dynamic registration is enabled with registration access tokens.
      registrationPolicy: readOnlyValue<string>('effective', {
        configured: 'dynamic-registration-enabled',
        effective: 'dynamic-registration-enabled; native public clients (auth_method=none)'
      }),

      // Token lifetimes: access token TTL is fixed provider policy; format opaque.
      tokenLifetimes: readOnlyValue<string>('effective', {
        configured: `access-token ${formatSeconds(PROVIDER_ACCESS_TOKEN_TTL_SECONDS)} (${PROVIDER_ACCESS_TOKEN_FORMAT})`,
        effective: `access-token ${formatSeconds(PROVIDER_ACCESS_TOKEN_TTL_SECONDS)} (${PROVIDER_ACCESS_TOKEN_FORMAT})`
      }),

      // Grant/refresh lifetime is deployment-configurable via the authorization TTL.
      grantLifetimes: readOnlyValue<string>(ttlConfigured ? 'effective' : 'configured', {
        configured: `grant/refresh ${formatSeconds(authorizationTtlSeconds)}`,
        effective: `grant/refresh ${formatSeconds(authorizationTtlSeconds)}`
      }),

      // Refresh rotation is disabled for native public clients (stable token).
      refreshRotation: readOnlyValue<boolean>('effective', {
        configured: GHOST_REFRESH_TOKEN_ROTATION,
        effective: GHOST_REFRESH_TOKEN_ROTATION
      }),

      // Registration quota: limit is configured, the window is fixed.
      quotas: readOnlyValue<string>(registrationLimitConfigured ? 'effective' : 'configured', {
        configured: `registration ${registrationLimit}/${formatSeconds(REGISTRATION_WINDOW_SECONDS)} per network source`,
        effective: `registration ${registrationLimit}/${formatSeconds(REGISTRATION_WINDOW_SECONDS)} per network source`
      }),

      // Durability: whether the durable provider/quota store is in effect.
      durability: readOnlyValue<string>('observed', {
        observed: durable ? 'durable (DynamoDB provider store)' : 'in-memory (local/development)'
      }),

      signingKeys: projectSigningKeys(signingObservation),
      releaseEvidence: projectReleaseEvidence(),
      metadata
    }

    // Defence in depth: strip any denylisted field that might have slipped into
    // a value before the projection is returned/persisted (Requirement 3.4).
    return this.redactor.redact(configuration)
  }
}

/** Shared singleton configuration service for server request paths. */
export const oauthConfigurationService = new OAuthConfigurationService()
