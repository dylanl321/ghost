/**
 * OAuth Administration — pure always-present application-status projector.
 *
 * Projects an always-present {@link OAuthApplicationStatus} for each of the two
 * well-known deployment applications (MCP and Kiro Crew) regardless of recent
 * event traffic (Requirements 3.1, 3.2). It mirrors the pure-transform contract
 * of {@link projectStageHealth} in `health-projector.ts`: it is a deterministic
 * function over (config, client projections, live grants, coverage, clock) with
 * NO I/O, so it is property-testable.
 *
 * Behavioural contract:
 *   - Status is composed from THREE truth sources, none of which is recent-event
 *     presence (Requirement 3.2):
 *       1. Configuration truth — the resource URL and supported scope set for
 *          the application (from `getSupportedResourcesAndScopes()` / the
 *          resource-URL accessors, supplied by the caller as `config`).
 *       2. Provider/projection truth — the seeded Client projection matched to
 *          the application's resource by advertised/permitted resource or scope.
 *       3. Grant truth — the count of live (non-expired, non-tombstoned) Grant
 *          projections for the resource, giving a "live grant count" and "last
 *          observed use" independent of any short health window.
 *   - A correctly configured client with zero live grants is `no-activity`
 *     (benign), NEVER `misconfigured` (Requirement 3.4).
 *   - `misconfigured` (actionable) is reported ONLY on genuine resource/scope
 *     divergence between the matched client and the configured expectation
 *     (Requirement 3.6).
 *   - While backfill coverage is `partial`/`rebuilding`/`unavailable` the status
 *     is `unknown` with a "reconcile in progress" hint — never a confident
 *     `not-registered`/`registered` (Requirement 3.8).
 *   - Every projection is labelled with coverage and freshness, and the status
 *     is NEVER an authorization or enforcement input (Requirement 3.10).
 */

import type {
  IsoDateTime,
  OAuthApplicationDetail,
  OAuthApplicationLabel,
  OAuthApplicationStatus,
  OAuthApplicationStatusState,
  OAuthCoverageState,
  OAuthFreshness,
  OAuthGrantSummary
} from '#shared/types/oauth-administration'

/**
 * Configuration truth for a single well-known deployment application. Composed
 * by the caller from `getSupportedResourcesAndScopes()` and the resource-URL
 * accessors so the projector stays a pure transform (no runtime-config reads).
 */
export interface OAuthApplicationConfig {
  /** Which well-known deployment application this describes. */
  application: OAuthApplicationLabel
  /** Public resource URL the application is keyed to (e.g. the MCP resource). */
  resource: string
  /** Public scopes the deployment configuration expects for this application. */
  expectedScopes: string[]
}

/** Options bounding a single application-status projection pass. */
export interface ApplicationStatusProjectionOptions {
  /** Evaluation clock; defaults to `Date.now()`. Injected for deterministic tests. */
  now?: number
  /** Freshness horizon in milliseconds; defaults to {@link DEFAULT_APPLICATION_STATUS_HORIZON_MS}. */
  freshnessHorizonMs?: number
}

/**
 * How recent the newest evidence for an application must be for its projection
 * to read as `fresh`. Older evidence is `stale`. Matches the health projector's
 * default window so the two areas agree on what "recent" means.
 */
export const DEFAULT_APPLICATION_STATUS_HORIZON_MS = 15 * 60 * 1000

/** Coverage states in which a definite registration state cannot be asserted. */
function isCoverageIncomplete(coverage: OAuthCoverageState): boolean {
  return coverage !== 'complete'
}

function isFiniteTime(iso: IsoDateTime | undefined): boolean {
  if (!iso) return false
  return Number.isFinite(new Date(iso).getTime())
}

function timeOf(iso: IsoDateTime | undefined): number | undefined {
  if (!isFiniteTime(iso)) return undefined
  return new Date(iso as string).getTime()
}

/**
 * Classify the freshness of an application from the newest evidence time.
 * Absent or unparseable evidence is `unknown` (never `fresh`).
 */
function classifyFreshness(newest: IsoDateTime | undefined, now: number, horizonMs: number): OAuthFreshness {
  const at = timeOf(newest)
  if (at === undefined) return 'unknown'
  const age = now - at
  if (!Number.isFinite(age)) return 'unknown'
  return age <= horizonMs ? 'fresh' : 'stale'
}

/** The resources a client projection advertises: its permitted resources. */
function clientAdvertisedResources(client: OAuthApplicationDetail): string[] {
  return Array.isArray(client.permittedResources) ? client.permittedResources : []
}

/** The scopes a client projection advertises: its permitted scopes. */
function clientAdvertisedScopes(client: OAuthApplicationDetail): string[] {
  return Array.isArray(client.permittedScopes) ? client.permittedScopes : []
}

/**
 * Decide whether a client projection is the one advertising a given resource.
 *
 * A backfilled dynamic client carries its advertised scopes but not always a
 * resource (resources are per-request indicators, not stable client metadata —
 * see `mapClientArtifact`). So a client matches a resource when EITHER:
 *   - it explicitly permits/advertises that resource URL, OR
 *   - it advertises at least one of the resource's expected scopes (the scope
 *     set is resource-specific, so a scope overlap is a reliable resource match).
 */
function clientMatchesResource(client: OAuthApplicationDetail, config: OAuthApplicationConfig): boolean {
  const advertisedResources = clientAdvertisedResources(client)
  if (advertisedResources.includes(config.resource)) return true
  const advertisedScopes = new Set(clientAdvertisedScopes(client))
  return config.expectedScopes.some(scope => advertisedScopes.has(scope))
}

/**
 * A grant projection is "live" for a resource when it is not expired at the
 * evaluation clock, not tombstoned, and consented to that resource. Absent
 * `expiresAt` is treated as non-expiring (still live). Tombstoning is surfaced
 * by the repository dropping tombstoned rows, but a defensive check is kept
 * here so the projector never counts an explicitly tombstoned grant.
 */
function isLiveGrantForResource(grant: OAuthGrantSummary, resource: string, now: number): boolean {
  if ((grant as { tombstoned?: boolean }).tombstoned === true) return false
  if (grant.resource !== undefined && grant.resource !== resource) return false
  const expiresAt = timeOf(grant.expiresAt)
  if (expiresAt !== undefined && expiresAt <= now) return false
  return true
}

/**
 * Whether the matched client's approved resources/scopes diverge from the
 * deployment's expectation for the application. Divergence is a scope the
 * client advertises that is NOT in the supported set, or an advertised resource
 * that is NOT the expected resource. A client advertising a SUBSET of the
 * expected scopes (or none of the optional ones) is NOT misconfigured — only a
 * genuine out-of-set advertisement is actionable (Requirement 3.6).
 */
function isMisconfigured(
  client: OAuthApplicationDetail,
  config: OAuthApplicationConfig,
  supportedResources: string[],
  supportedScopes: string[]
): boolean {
  const advertisedScopes = clientAdvertisedScopes(client)
  const scopeDivergence = advertisedScopes.some(scope => !supportedScopes.includes(scope))
  const advertisedResources = clientAdvertisedResources(client)
  const resourceDivergence = advertisedResources.some(resource => !supportedResources.includes(resource))
  return scopeDivergence || resourceDivergence
}

/** The newest observed-use time from the matched client and its live grants. */
function newestObservedUse(
  client: OAuthApplicationDetail | undefined,
  liveGrants: OAuthGrantSummary[]
): IsoDateTime | undefined {
  let newest: number | undefined
  let newestIso: IsoDateTime | undefined

  const consider = (iso: IsoDateTime | undefined): void => {
    const at = timeOf(iso)
    if (at === undefined) return
    if (newest === undefined || at > newest) {
      newest = at
      newestIso = iso
    }
  }

  consider(client?.observedUse?.lastObservedAt)
  for (const grant of liveGrants) {
    consider(grant.lastObservedRefreshAt)
    consider(grant.consentedAt)
  }
  return newestIso
}

/** A safe, human-readable next action for an application status. */
function nextActionFor(status: OAuthApplicationStatusState): string | undefined {
  switch (status) {
    case 'unknown':
      return 'Inventory reconcile is in progress; the application status cannot be asserted yet.'
    case 'misconfigured':
      return 'Review the client\'s approved resources and scopes; they diverge from the deployment\'s supported set.'
    case 'not-registered':
      return 'No provider client advertises this resource yet; register the application to enable it.'
    default:
      return undefined
  }
}

/**
 * Project a single application's status from configuration truth, the matched
 * client projection, its live grants, and coverage.
 */
function projectApplication(
  config: OAuthApplicationConfig,
  clients: OAuthApplicationDetail[],
  grants: OAuthGrantSummary[],
  coverage: OAuthCoverageState,
  supportedResources: string[],
  supportedScopes: string[],
  now: number,
  freshnessHorizonMs: number
): OAuthApplicationStatus {
  // Match the provider client projection(s) that advertise this resource.
  const matched = clients.find(client => clientMatchesResource(client, config))

  // Count live grants for the resource (grant truth, independent of any window).
  const liveGrants = grants.filter(grant => isLiveGrantForResource(grant, config.resource, now))
  const liveGrantCount = liveGrants.length

  const approvedResources = matched ? clientAdvertisedResources(matched) : []
  const approvedScopes = matched ? clientAdvertisedScopes(matched) : []
  const lastObservedUse = newestObservedUse(matched, liveGrants)
  const collectedAt = matched?.metadata?.collectedAt

  // Coverage honesty: while the backfill has not reached `complete`, we cannot
  // assert a definite registration state. Report `unknown` with a reconcile hint
  // rather than a misleading `not-registered`/`registered` (Requirement 3.8).
  let status: OAuthApplicationStatusState
  if (isCoverageIncomplete(coverage)) {
    status = 'unknown'
  } else if (!matched) {
    // Configuration is present but no provider client advertises the resource.
    status = 'not-registered'
  } else if (isMisconfigured(matched, config, supportedResources, supportedScopes)) {
    // A client exists but its approved resources/scopes diverge — actionable.
    status = 'misconfigured'
  } else if (liveGrantCount > 0 || lastObservedUse !== undefined) {
    // Registered, correctly configured, and in use.
    status = 'active'
  } else {
    // Registered and correctly configured, but no live grants / no observed use.
    // Benign — explicitly NOT misconfigured (Requirement 3.4).
    status = 'no-activity'
  }

  // Freshness reflects how recent the underlying evidence is. When coverage is
  // incomplete the evidence cannot be trusted as current, so freshness is
  // `unknown`; otherwise it is derived from the newest observed evidence.
  const freshness = isCoverageIncomplete(coverage)
    ? 'unknown'
    : classifyFreshness(lastObservedUse ?? collectedAt, now, freshnessHorizonMs)

  return {
    application: config.application,
    resource: config.resource,
    status,
    approvedResources,
    approvedScopes,
    expectedResources: [config.resource],
    expectedScopes: config.expectedScopes,
    liveGrantCount,
    lastObservedUse,
    clientReference: matched?.clientId,
    coverage,
    freshness,
    collectedAt,
    nextAction: nextActionFor(status)
  }
}

/**
 * Project the always-present MCP + Kiro Crew application statuses.
 *
 * A PURE transform: given the deployment's per-application configuration truth,
 * the seeded Client projections, the live Grant projections, the backfill
 * coverage, and an evaluation clock, it returns one {@link OAuthApplicationStatus}
 * per configured application — always, regardless of event traffic. Performs no
 * I/O and never mutates its inputs, so it is deterministic and property-testable.
 *
 * @param configs     per-application configuration truth (MCP + Kiro Crew),
 *   composed by the caller from `getSupportedResourcesAndScopes()`.
 * @param clients     the seeded Client projections (already deployment-scoped
 *   and tombstone-filtered by the repository query).
 * @param grants      the Grant projections (already deployment-scoped and
 *   tombstone-filtered by the repository query).
 * @param coverage    the backfill checkpoint coverage backing this projection.
 * @param options     evaluation clock and freshness horizon.
 */
export function projectApplicationStatus(
  configs: OAuthApplicationConfig[],
  clients: OAuthApplicationDetail[],
  grants: OAuthGrantSummary[],
  coverage: OAuthCoverageState,
  options?: ApplicationStatusProjectionOptions
): OAuthApplicationStatus[] {
  const now = options?.now ?? Date.now()
  const freshnessHorizonMs = options?.freshnessHorizonMs ?? DEFAULT_APPLICATION_STATUS_HORIZON_MS

  // The deployment's full supported set is the union across all configured
  // applications; divergence is measured against this set (Requirement 3.6).
  const supportedResources = [...new Set(configs.map(config => config.resource))]
  const supportedScopes = [...new Set(configs.flatMap(config => config.expectedScopes))]

  return configs.map(config =>
    projectApplication(
      config,
      clients,
      grants,
      coverage,
      supportedResources,
      supportedScopes,
      now,
      freshnessHorizonMs
    )
  )
}
