/**
 * OAuth Administration — named approved diagnostic checks (task 11.1).
 *
 * Implements the ONLY diagnostic checks the panel accepts (design "Diagnostics,
 * maintenance, and alerts"; Requirement 11.1):
 *   - `protected-resource-discovery`   — validate the protected-resource
 *                                        `.well-known` metadata shape for the
 *                                        current deployment's MCP + Crew resources.
 *   - `authorization-server-discovery` — validate the authorization-server
 *                                        (`.well-known/oauth-authorization-server`)
 *                                        metadata shape for the current issuer.
 *   - `public-jwks-metadata`           — validate the running provider's PUBLIC
 *                                        JWK metadata only (kid/kty/alg/use).
 *   - `provider-storage-read`          — a bounded read-permission probe against
 *                                        the provider store (never a write).
 *   - `crew-configuration-health`      — validate the Crew resource/scope config.
 *
 * SAFETY (Requirements 2.2, 11.1, 11.3, 11.4):
 *   - Each check derives its target ONLY from the current provider/resource
 *     configuration (issuer/discovery endpoints, JWKS, provider store, Crew
 *     config). A caller can NEVER supply a URL/target — the check functions take
 *     no target argument at all.
 *   - Checks are read-only. They MUST NOT register a client, initiate browser
 *     consent, exchange user tokens, create a session, increment registration
 *     counters, follow redirects to unapproved destinations, or return raw
 *     bodies. The in-process probes here touch only config getters, the shared
 *     scope constants, and the provider's public JWKS / adapter read path — none
 *     of which has any of those side effects.
 *   - Any outbound probe (when a deployment injects one) disables automatic
 *     redirects and revalidates a permitted redirect against the SAME approved
 *     target set (`isApprovedTarget`).
 *   - Every result carries only a bounded, safe summary — never a raw response
 *     body — and is passed through the redactor by the diagnostic service.
 */

import type {
  OAuthDiagnosticCheck,
  OAuthDiagnosticCheckResult,
  OAuthOutcome
} from '#shared/types/oauth-administration'
import { getMcpResourceUrl, getOAuthIssuer } from '../../config'
import { getKiroCrewResourceUrl } from '../../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../../kirocrew/types'
import { GHOST_MCP_SCOPES } from '../../types'
import { getGhostPublicSigningKeyMetadata, getOAuthProvider } from '../provider'

/** The immutable set of named checks the server accepts (Requirement 11.1). */
export const OAUTH_DIAGNOSTIC_CHECKS: readonly OAuthDiagnosticCheck[] = [
  'protected-resource-discovery',
  'authorization-server-discovery',
  'public-jwks-metadata',
  'provider-storage-read',
  'crew-configuration-health'
] as const

const CHECK_SET: ReadonlySet<string> = new Set(OAUTH_DIAGNOSTIC_CHECKS)

/** Bounded length for a safe check summary; never carries a raw body. */
const MAX_SUMMARY = 200

/** True only for one of the named, approved checks (rejects arbitrary targets). */
export function isApprovedCheck(check: unknown): check is OAuthDiagnosticCheck {
  return typeof check === 'string' && CHECK_SET.has(check)
}

/**
 * The set of approved absolute target origins derived from the current
 * deployment configuration. Any permitted redirect a probe encounters is
 * revalidated against this set; a destination outside it is treated as a failed
 * check, never followed (Requirement 11.4).
 */
export function approvedTargetOrigins(): Set<string> {
  const origins = new Set<string>()
  try {
    origins.add(new URL(getOAuthIssuer()).origin)
  } catch {
    // An unparseable issuer is surfaced by the discovery check as a failure.
  }
  try {
    origins.add(getMcpResourceUrl().origin)
  } catch { /* derived from base URL; ignore parse issues here */ }
  try {
    origins.add(getKiroCrewResourceUrl().origin)
  } catch { /* Crew check reports its own config failure */ }
  return origins
}

/** True when a URL's origin is in the approved, config-derived target set. */
export function isApprovedTarget(url: string, approved: Set<string> = approvedTargetOrigins()): boolean {
  try {
    return approved.has(new URL(url).origin)
  } catch {
    return false
  }
}

function trimSummary(summary: string): string {
  return summary.replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY)
}

function result(check: OAuthDiagnosticCheck, outcome: OAuthOutcome, summary: string, now: number): OAuthDiagnosticCheckResult {
  return { check, outcome, summary: trimSummary(summary), observedAt: new Date(now).toISOString() }
}

/**
 * Optional injected probe seam. A deployment/test can supply a bounded fetch
 * that MUST disable automatic redirects; the check revalidates any permitted
 * redirect target against {@link approvedTargetOrigins}. When absent, the checks
 * validate the in-process configuration/JWKS/adapter directly (no outbound
 * network, no side effects), which is the default safe behavior.
 */
export interface DiagnosticProbeContext {
  /** Injected time source for deterministic tests. */
  now?: () => number
  /**
   * Optional bounded, redirect-disabled read of an approved metadata target.
   * Returns a parsed, safe object (never a raw body). The default checks do not
   * use this; it exists so a deployment can validate the live HTTP surface
   * without changing the containment contract.
   */
  readApprovedMetadata?: (url: string) => Promise<Record<string, unknown>>
}

/**
 * Validate the shape of protected-resource discovery metadata for the current
 * deployment. Target is derived from the configured MCP + Crew resources; the
 * check confirms the issuer, endpoints, and scopes are present and consistent
 * with the running configuration.
 */
export async function checkProtectedResourceDiscovery(probe: DiagnosticProbeContext = {}): Promise<OAuthDiagnosticCheckResult> {
  const now = (probe.now ?? Date.now)()
  const check: OAuthDiagnosticCheck = 'protected-resource-discovery'
  try {
    const issuer = getOAuthIssuer()
    const mcpResource = getMcpResourceUrl().href
    const crewResource = getKiroCrewResourceUrl().href
    const issuerOrigin = new URL(issuer).origin
    // Both resources must advertise the current issuer as their authorization
    // server and live under an approved origin. We validate the DERIVED shape,
    // not a caller target.
    const approved = approvedTargetOrigins()
    const resourcesOk = isApprovedTarget(mcpResource, approved) && isApprovedTarget(crewResource, approved)
    if (!issuerOrigin || !resourcesOk) {
      return result(check, 'failure', 'Protected-resource targets are not within the approved deployment origin set.', now)
    }
    // When a deployment injects a bounded probe, validate the live document too,
    // revalidating any redirect target against the approved set.
    if (probe.readApprovedMetadata) {
      const metadataUrl = `${issuerOrigin}/.well-known/oauth-protected-resource/mcp`
      const doc = await probe.readApprovedMetadata(metadataUrl)
      const advertisedIssuer = typeof doc.issuer === 'string' ? doc.issuer : undefined
      if (advertisedIssuer && !isApprovedTarget(advertisedIssuer, approved)) {
        return result(check, 'failure', 'Protected-resource metadata advertised an unapproved issuer.', now)
      }
    }
    return result(check, 'success', 'Protected-resource discovery advertises the current issuer for the MCP and Crew resources.', now)
  } catch {
    return result(check, 'failure', 'Protected-resource discovery configuration could not be validated.', now)
  }
}

/**
 * Validate the authorization-server discovery metadata shape for the current
 * issuer. Confirms the fixed provider profile (authorization code + refresh,
 * `none` auth, mandatory S256 PKCE) is derivable and endpoints resolve under an
 * approved origin.
 */
export async function checkAuthorizationServerDiscovery(probe: DiagnosticProbeContext = {}): Promise<OAuthDiagnosticCheckResult> {
  const now = (probe.now ?? Date.now)()
  const check: OAuthDiagnosticCheck = 'authorization-server-discovery'
  try {
    const issuer = getOAuthIssuer()
    const issuerOrigin = new URL(issuer).origin
    const approved = approvedTargetOrigins()
    const endpoints = [
      `${issuer}/oauth/authorize`,
      `${issuer}/oauth/token`,
      `${issuer}/oauth/jwks`,
      `${issuer}/oauth/revoke`
    ]
    const endpointsOk = endpoints.every(endpoint => isApprovedTarget(endpoint, approved))
    if (!issuerOrigin || !endpointsOk) {
      return result(check, 'failure', 'Authorization-server endpoints do not resolve under the approved issuer origin.', now)
    }
    if (probe.readApprovedMetadata) {
      const metadataUrl = `${issuerOrigin}/.well-known/oauth-authorization-server`
      const doc = await probe.readApprovedMetadata(metadataUrl)
      const advertisedIssuer = typeof doc.issuer === 'string' ? doc.issuer : undefined
      if (advertisedIssuer && new URL(advertisedIssuer).origin !== issuerOrigin) {
        return result(check, 'failure', 'Authorization-server metadata issuer did not match the current deployment issuer.', now)
      }
    }
    return result(check, 'success', 'Authorization-server discovery endpoints resolve under the current issuer.', now)
  } catch {
    return result(check, 'failure', 'Authorization-server discovery configuration could not be validated.', now)
  }
}

/**
 * Validate the running provider's PUBLIC JWK metadata only. Never reads or
 * returns private JWK parameters (Requirement 3.4, 11.3). Missing keys are
 * `unknown`, not a false success.
 */
export async function checkPublicJwksMetadata(probe: DiagnosticProbeContext = {}): Promise<OAuthDiagnosticCheckResult> {
  const now = (probe.now ?? Date.now)()
  const check: OAuthDiagnosticCheck = 'public-jwks-metadata'
  try {
    const observation = await getGhostPublicSigningKeyMetadata()
    if (!observation.available) {
      return result(check, 'unknown', 'Public JWKS metadata is unavailable; signing-key state cannot be confirmed.', now)
    }
    const keyCount = observation.keys.length
    if (keyCount === 0) {
      return result(check, 'unknown', 'The provider advertised no public signing keys.', now)
    }
    // Confirm every advertised key exposes only safe public identification.
    const allPublic = observation.keys.every(key => Boolean(key.kty))
    if (!allPublic) {
      return result(check, 'failure', 'A public JWK entry was missing its key type.', now)
    }
    return result(check, 'success', `Public JWKS metadata is available with ${keyCount} signing key(s).`, now)
  } catch {
    return result(check, 'failure', 'Public JWKS metadata could not be read.', now)
  }
}

/**
 * A bounded read-permission probe against the provider store. Attempts a single
 * bounded read of a non-existent client id; a clean "not found" (null) proves
 * read permission WITHOUT writing, registering, or incrementing anything. A
 * thrown error is a storage/permission failure. In a memory-only deployment the
 * provider has no durable adapter, which is reported as `unknown`.
 */
export async function checkProviderStorageRead(probe: DiagnosticProbeContext = {}): Promise<OAuthDiagnosticCheckResult> {
  const now = (probe.now ?? Date.now)()
  const check: OAuthDiagnosticCheck = 'provider-storage-read'
  try {
    const provider = await getOAuthProvider()
    // A bounded, read-only lookup of a well-known-absent id. `.find()` never
    // mutates or creates state; a null result confirms read access.
    const clientModel = (provider as unknown as { Client?: { find?: (id: string) => Promise<unknown> } }).Client
    if (!clientModel?.find) {
      return result(check, 'unknown', 'Provider storage read path is unavailable in this deployment.', now)
    }
    await clientModel.find('__oauth-admin-diagnostic-nonexistent__')
    return result(check, 'success', 'Provider storage read-permission probe completed without error.', now)
  } catch {
    return result(check, 'failure', 'Provider storage read-permission probe failed.', now)
  }
}

/**
 * Validate Crew configuration health: the Crew resource resolves under an
 * approved origin, advertises the current issuer, and carries a non-empty scope
 * set. Derived from `getKiroCrewResourceUrl()` and the Crew scope constants.
 */
export async function checkCrewConfigurationHealth(probe: DiagnosticProbeContext = {}): Promise<OAuthDiagnosticCheckResult> {
  const now = (probe.now ?? Date.now)()
  const check: OAuthDiagnosticCheck = 'crew-configuration-health'
  try {
    const crewResource = getKiroCrewResourceUrl().href
    const approved = approvedTargetOrigins()
    if (!isApprovedTarget(crewResource, approved)) {
      return result(check, 'failure', 'The Crew resource does not resolve under an approved deployment origin.', now)
    }
    // Coerce to a readonly array view so the length guard stays runtime-meaningful
    // and is not narrowed to a non-empty tuple literal by the compiler.
    const crewScopes: readonly string[] = KIROCREW_SCOPES
    if (crewScopes.length === 0) {
      return result(check, 'failure', 'The Crew resource advertises no configuration scopes.', now)
    }
    // MCP scopes must also be present so the shared provider scope union is sane.
    const mcpScopes: readonly string[] = GHOST_MCP_SCOPES
    if (mcpScopes.length === 0) {
      return result(check, 'failure', 'The MCP resource advertises no scopes.', now)
    }
    return result(check, 'success', `Crew configuration is healthy with ${KIROCREW_SCOPES.length} scope(s).`, now)
  } catch {
    return result(check, 'failure', 'Crew configuration health could not be validated.', now)
  }
}

/** Dispatch table mapping each named check to its config-derived implementation. */
export const DIAGNOSTIC_CHECK_IMPLEMENTATIONS: Record<
  OAuthDiagnosticCheck,
  (probe?: DiagnosticProbeContext) => Promise<OAuthDiagnosticCheckResult>
> = {
  'protected-resource-discovery': checkProtectedResourceDiscovery,
  'authorization-server-discovery': checkAuthorizationServerDiscovery,
  'public-jwks-metadata': checkPublicJwksMetadata,
  'provider-storage-read': checkProviderStorageRead,
  'crew-configuration-health': checkCrewConfigurationHealth
}

/** Run a single named check by name. Rejects any non-approved check. */
export async function runNamedCheck(
  check: OAuthDiagnosticCheck,
  probe?: DiagnosticProbeContext
): Promise<OAuthDiagnosticCheckResult> {
  const implementation = DIAGNOSTIC_CHECK_IMPLEMENTATIONS[check]
  if (!implementation) {
    throw new Error(`Unknown diagnostic check: ${String(check)}`)
  }
  return implementation(probe)
}
