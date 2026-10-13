/**
 * OAuth Administration — read-only projection query service.
 *
 * The single read surface the `/api/admin/oauth` routes call for every
 * non-mutating view: overview, configuration, applications (+detail), attempts
 * (+detail), grants, issues (+detail), limits, and audit (design "Observation
 * and query flow", "Proposed API contract"; Requirements 2.1, 3.1, 5.1, 5.3,
 * 5.5, 5.6, 8.1, 10.1, 12.1, 16.3, 16.5, 17.4).
 *
 * Behavioural contract:
 *   - Every query is bound to the resolved {@link OAuthAdminAccessContext}
 *     (server-derived deployment + opaque actor + capabilities). A caller can
 *     never select another deployment's storage, and identity-bearing filters/
 *     fields (`subject`, grant subject display) are only honoured when the
 *     activity capability is held (Requirement 8.1 / 17.4).
 *   - Only the documented filters are accepted: `from`, `to`, `clientId`,
 *     `subject`, `resource`, `outcome`, `stage`, `diagnosticReference`, `limit`,
 *     `order`, `cursor`. Anything else on the request is dropped before it
 *     reaches the repository. Ranges default to 24h and cap at 90 days; `limit`
 *     caps at 100 (default 50) — all enforced by `repository-support`.
 *   - Totals are nullable and never invented. A page is only `totalIsExact`
 *     when it is PROVABLY complete: coverage is `complete`, there is no next
 *     page, and this is the first page (no inbound cursor). Otherwise `total`
 *     stays `null` and `totalIsExact` stays `false`.
 *   - Each page issues a signed `nextCursor` via the codec, bound to this
 *     deployment/actor/capability/query/order, when (and only when) more rows
 *     remain. A tampered or cross-scope cursor fails closed.
 *   - Overview projects INDEPENDENT per-stage health over a bounded recent
 *     event window; when the events query is unavailable it projects explicit
 *     unavailable health rather than a healthy/zero state (Requirement 2.1).
 *   - `applicationDetail` reconciles the projection with authoritative provider
 *     state and exposes freshness/coverage; the LIST never scans provider
 *     artifacts per request (Requirement 5.3, 5.5, 5.6).
 *
 * The service performs read-only, indexed, bounded repository access plus the
 * pure health/attempt projectors and the (non-mutating) configuration and quota
 * services. It never writes, mutates, or scans provider artifacts from a LIST.
 */

import type {
  OAuthApplicationDetail,
  OAuthApplicationStatus,
  OAuthApplicationSummary,
  OAuthAuditRecord,
  OAuthCapability,
  OAuthConfiguration,
  OAuthCoverageState,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthGrantSummary,
  OAuthIssue,
  OAuthListQuery,
  OAuthObservation,
  OAuthPagedResult,
  OAuthQuotaObservation,
  OpaqueReference
} from '#shared/types/oauth-administration'
import { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
import type {
  OAuthAdminAccessContext,
  OAuthAdminCursorCodec,
  OAuthAdminRepository,
  OAuthProjectionService
} from './types'
import { getOAuthAdminRepository } from './index'
import { oauthAdminCursorCodec, cursorBindingFor, decodeBoundCursor, issueBoundCursor, type CursorBinding } from './cursor-codec'
import { oauthAdminErrors } from './access-service'
import { MAX_LIMIT, resolveLimit } from './repository-support'
import { projectStageHealth, projectUnavailableHealth, DEFAULT_FRESHNESS_HORIZON_MS, type HealthProjectionOptions } from './health-projector'
import { assembleAttempts, type OAuthAttempt } from './attempt-assembler'
import { oauthConfigurationService, type OAuthConfigurationService } from './configuration-service'
import { oauthQuotaService, type OAuthQuotaService, type QuotaObservationRequest } from './quota-service'
import { getOAuthProjectionService } from './projection-service'
import { OAuthReadAuditWriter } from './read-audit'
import {
  projectApplicationStatus,
  type OAuthApplicationConfig,
  type ApplicationStatusProjectionOptions
} from './application-status-projector'
import { getMcpResourceUrl } from '../../config'
import { GHOST_MCP_SCOPES } from '../../types'
import { getKiroCrewResourceUrl } from '../../../kirocrew/config'
import { KIROCREW_SCOPES } from '../../../kirocrew/types'

/**
 * The DEFAULT recent-event window (ms) the Overview health cards project over
 * when no bounded window is supplied. A caller (the `/overview` route) passes an
 * allowlisted window (`1h`/`24h`/`7d`) through {@link OverviewOptions.windowMs};
 * this constant is only the fallback (Requirement 4.3).
 */
const DEFAULT_OVERVIEW_WINDOW_MS = 60 * 60 * 1000

/** Default registration quota mirrored from the register route rate decision. */
const DEFAULT_REGISTRATION_LIMIT_PER_HOUR = 10
const REGISTRATION_WINDOW_SECONDS = 3600
/**
 * A server-selected, KNOWN pseudonymous quota reference. The limits view reads a
 * stable well-known bucket (the aggregate registration source) rather than
 * accepting a caller-supplied key, so no probing of arbitrary buckets is
 * possible (design "Proposed API contract" — `GET /limits`).
 */
const REGISTRATION_QUOTA_KEY = 'oauth:dynamic-registration:aggregate'

/**
 * The identity-bearing filter fields. They are only honoured when the caller
 * holds `oauth.activity.view`; otherwise they are stripped so a
 * configuration-only viewer cannot query by subject (Requirement 8.1 / 17.4).
 */
const IDENTITY_FILTER_FIELDS = ['subject'] as const

/**
 * A page enriched by the query service: the repository page plus the signed
 * `nextCursor` (when more rows remain) and the exact-total decision.
 */
type EnrichedPage<T> = OAuthPagedResult<T>

/**
 * Options bounding a single {@link OAuthQueryService.overview} projection.
 *
 * Extends {@link HealthProjectionOptions} with a bounded observation `windowMs`.
 * The `/overview` route maps its allowlisted `window` query (`1h`/`24h`/`7d`) to
 * a window-ms and passes it here. When `windowMs` is supplied, the freshness
 * horizon is DERIVED from it so it never exceeds the selected window; when it is
 * absent the window falls back to {@link DEFAULT_OVERVIEW_WINDOW_MS} and the
 * horizon to {@link DEFAULT_FRESHNESS_HORIZON_MS} (Requirement 4.3).
 */
export interface OverviewOptions extends HealthProjectionOptions {
  /**
   * The bounded recent-event window in milliseconds. Defaults to
   * {@link DEFAULT_OVERVIEW_WINDOW_MS} when absent. The route is responsible for
   * mapping only allowlisted window tokens to a value here.
   */
  windowMs?: number
}

/**
 * Read-only OAuth administration query service. Constructed with injectable
 * dependencies so tests can supply an in-memory repository and a deterministic
 * clock without a live DynamoDB.
 */
export class OAuthQueryService {
  private readonly readAudit: OAuthReadAuditWriter

  constructor(
    private readonly repository: OAuthAdminRepository = getOAuthAdminRepository(),
    private readonly codec: OAuthAdminCursorCodec = oauthAdminCursorCodec,
    private readonly configurationService: OAuthConfigurationService = oauthConfigurationService,
    private readonly quotaService: OAuthQuotaService = oauthQuotaService,
    private readonly projectionService: OAuthProjectionService = getOAuthProjectionService(),
    readAudit?: OAuthReadAuditWriter
  ) {
    // The restricted-read audit writer shares the same repository so a read of
    // identity-bearing/restricted data records a safe, bounded `read` audit
    // (Requirement 13.6). Non-restricted config/overview/inventory/limits reads
    // deliberately do NOT audit.
    this.readAudit = readAudit ?? new OAuthReadAuditWriter(this.repository)
  }

  // --- Overview -----------------------------------------------------------

  /**
   * Independent per-stage health over a bounded recent event window. When the
   * events query is unavailable, explicit unavailable health is projected — an
   * absent/failed query is NEVER converted into a healthy or zero-failure state
   * (Requirement 2.1 / 16.5).
   *
   * The observation window is bounded by {@link OverviewOptions.windowMs} (the
   * route maps its allowlisted `1h`/`24h`/`7d` value here) and defaults to
   * {@link DEFAULT_OVERVIEW_WINDOW_MS} when absent. The freshness horizon is
   * DERIVED from the selected window so it never exceeds it: when a window is
   * supplied the horizon equals the window (recent-but-not-most-recent activity
   * reads fresh/stale over the chosen range rather than collapsing to unknown),
   * and when no window is supplied the horizon falls back to
   * {@link DEFAULT_FRESHNESS_HORIZON_MS}. An explicit `freshnessHorizonMs` is
   * still honoured but is always clamped to the window so the horizon can never
   * exceed the selected window (Requirement 4.3). This threading changes no
   * projector logic — absence is still never healthy and a stale all-success
   * stage is still never healthy.
   */
  async overview(
    access: OAuthAdminAccessContext,
    options?: OverviewOptions
  ): Promise<OAuthObservation[]> {
    const ctx = access.deployment
    const now = options?.now ?? Date.now()
    const windowMs = options?.windowMs ?? DEFAULT_OVERVIEW_WINDOW_MS
    const freshnessHorizonMs = this.resolveFreshnessHorizon(options, windowMs)
    const source = options?.source
    const windowQuery: OAuthListQuery = {
      from: new Date(now - windowMs).toISOString(),
      to: new Date(now).toISOString(),
      // A generous but bounded page so the health projection sees the window's
      // events; the repository still caps this at 100.
      limit: MAX_LIMIT,
      order: 'desc'
    }
    try {
      const page = await this.repository.queryEvents(ctx, this.sanitizeQuery(windowQuery, access))
      // A partial/rebuilding/unavailable coverage cannot be reported as healthy.
      if (page.page.coverage === 'unavailable') {
        return projectUnavailableHealth(ctx, { now, freshnessHorizonMs, source }, page.page.coverage)
      }
      return projectStageHealth(ctx, page.items, { now, freshnessHorizonMs, source })
    } catch {
      // The events query itself failed: surface explicit unavailable health.
      return projectUnavailableHealth(ctx, { now, freshnessHorizonMs, source })
    }
  }

  /**
   * Derive the freshness horizon for an overview projection from the selected
   * window so it can NEVER exceed that window (Requirement 4.3):
   *   - When a bounded `windowMs` is supplied, the horizon equals that window
   *     (so activity anywhere in the chosen range reads fresh/stale rather than
   *     collapsing to unknown).
   *   - When no window is supplied, the horizon falls back to
   *     {@link DEFAULT_FRESHNESS_HORIZON_MS}, preserving the original behaviour.
   *   - An explicit `freshnessHorizonMs` is honoured but always clamped to the
   *     window so the horizon still cannot exceed the selected window.
   */
  private resolveFreshnessHorizon(options: OverviewOptions | undefined, windowMs: number): number {
    const derivedDefault = options?.windowMs !== undefined ? windowMs : DEFAULT_FRESHNESS_HORIZON_MS
    const requested = options?.freshnessHorizonMs ?? derivedDefault
    return Math.min(requested, windowMs)
  }

  // --- Configuration ------------------------------------------------------

  /** Safe effective configuration projection (delegates to the config service). */
  async configuration(access: OAuthAdminAccessContext, now?: Date): Promise<OAuthConfiguration> {
    return this.configurationService.buildConfiguration(access.deployment, now)
  }

  // --- Applications (inventory) -------------------------------------------

  /**
   * Cursor-paginated application inventory. Uses the repository's indexed query
   * only — it NEVER scans provider artifacts per request (Requirement 5.5).
   */
  async applications(
    access: OAuthAdminAccessContext,
    query: OAuthListQuery
  ): Promise<EnrichedPage<OAuthApplicationSummary>> {
    return this.paged(
      access,
      OAUTH_CAPABILITIES.CONFIGURATION_VIEW,
      query,
      (ctx, effective) => this.repository.queryApplications(ctx, effective)
    )
  }

  /**
   * Provider-reconciled application detail. Reconciles the projection against
   * authoritative provider state (repairing divergence or tombstoning a removed
   * record) before returning, so the detail reflects the provider truth and
   * exposes the projection's freshness/coverage (Requirement 5.3, 5.6). Detail
   * reconciliation is the ONLY read path allowed to touch the provider, and it
   * does so for a single client — never a scan.
   */
  async applicationDetail(
    access: OAuthAdminAccessContext,
    clientId: OpaqueReference
  ): Promise<OAuthApplicationDetail> {
    const ctx = access.deployment
    // Reconcile the single client against the provider before reading. This is
    // a targeted single-artifact read, not a scan.
    await this.projectionService.reconcileClient(ctx, clientId)
    const detail = await this.repository.getApplication(ctx, clientId)
    if (!detail) {
      throw oauthAdminErrors.notFound({ message: 'Application not found in this deployment' })
    }
    return detail
  }

  /**
   * Always-present MCP + Kiro Crew application status (Requirements 3.1, 3.2,
   * 3.9). Resolves three truth sources — configuration (the well-known MCP and
   * Kiro Crew resource URLs and their supported scopes), provider/projection
   * (the seeded Client projections read from the projection store), and grant
   * truth (the live Grant projections) — plus the backfill checkpoint coverage,
   * and delegates the classification to the pure {@link projectApplicationStatus}
   * projector.
   *
   * SAFETY: this read never scans the provider on a request hot path — it only
   * reads the already-seeded projections and the durable checkpoint. The single
   * per-detail `reconcileClient` allowance (used by {@link applicationDetail})
   * is the only per-request provider read and is NOT invoked here (Requirement
   * 3.2 / 3.9; parent invariant preserved).
   */
  async applicationsHealth(
    access: OAuthAdminAccessContext,
    options?: ApplicationStatusProjectionOptions
  ): Promise<OAuthApplicationStatus[]> {
    const ctx = access.deployment

    // 1. Configuration truth for the two well-known applications, composed from
    //    the same runtime accessors the provider was built from.
    const configs = this.resolveApplicationConfigs()

    // 2. Provider/projection truth: the seeded Client projections. The summary
    //    query is indexed and bounded; the projector needs the detail shape
    //    (permitted resources/scopes, observed use), so each summary is resolved
    //    to its stored detail. This reads only the projection store — never the
    //    provider artifact table.
    const clients = await this.resolveClientProjections(ctx)

    // 3. Grant truth: the live (non-expired, non-tombstoned) Grant projections.
    const grants = await this.resolveGrantProjections(ctx)

    // 4. Coverage from the durable backfill checkpoint; when no checkpoint
    //    exists yet the inventory has never been seeded, so coverage is
    //    `unavailable` (the projector then reports `unknown` with a reconcile
    //    hint rather than a misleading `not-registered`).
    const coverage = await this.resolveBackfillCoverage(ctx)

    return projectApplicationStatus(configs, clients, grants, coverage, options)
  }

  // --- Attempts (activity) ------------------------------------------------

  /**
   * Bounded, filtered activity assembled into evidence-only attempts. Requires
   * the activity capability. The attempts are assembled over the queried event
   * page; the cursor pages the underlying events.
   */
  async attempts(
    access: OAuthAdminAccessContext,
    query: OAuthListQuery
  ): Promise<{ attempts: OAuthAttempt[], page: OAuthPagedResult<OAuthEvent>['page'] }> {
    this.requireCapability(access, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    const events = await this.paged(
      access,
      OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      (ctx, effective) => this.repository.queryEvents(ctx, effective)
    )
    const attempts = assembleAttempts(access.deployment, events.items)
    // Restricted DATA ACCESS audit (Req 13.6): one bounded, safe record per
    // read of identity-bearing activity — never the raw filter values.
    await this.readAudit.writeReadAudit(access, {
      resource: 'attempts',
      capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      returned: attempts.length
    })
    return { attempts, page: events.page }
  }

  /**
   * Detail for a single attempt: the events sharing a supported correlation
   * reference, assembled into one attempt. Requires the activity capability.
   * Returns `null` when no events carry the reference in the window.
   */
  async attemptDetail(
    access: OAuthAdminAccessContext,
    correlationReference: OpaqueReference,
    query: OAuthListQuery = {}
  ): Promise<OAuthAttempt | null> {
    this.requireCapability(access, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    const ctx = access.deployment
    // Diagnostic reference is a documented filter; a correlation/reference id is
    // matched in the assembler. Query a bounded window of events and assemble.
    const effective = this.sanitizeQuery({ ...query, limit: MAX_LIMIT }, access)
    const page = await this.repository.queryEvents(ctx, effective)
    const relevant = page.items.filter(event =>
      event.correlationReference === correlationReference
      || event.referenceId === correlationReference
      || event.diagnosticReference === correlationReference)
    if (relevant.length === 0) return null
    const [attempt] = assembleAttempts(ctx, relevant)
    // Restricted DATA ACCESS audit (Req 13.6): reading a single attempt's
    // identity-bearing timeline is a restricted read.
    await this.readAudit.writeReadAudit(access, {
      resource: 'attempt',
      capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      targetReference: correlationReference,
      returned: attempt ? 1 : 0
    })
    return attempt ?? null
  }

  // --- Grants -------------------------------------------------------------

  /**
   * Cursor-paginated grant summaries. Requires the activity capability because
   * grants carry identity-bearing references; the subject display is only
   * present when the activity capability is held (the repository projection
   * already gates `subjectDisplay`).
   */
  async grants(
    access: OAuthAdminAccessContext,
    query: OAuthListQuery
  ): Promise<EnrichedPage<OAuthGrantSummary>> {
    this.requireCapability(access, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    const result = await this.paged(
      access,
      OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      (ctx, effective) => this.repository.queryGrants(ctx, effective)
    )
    // Restricted DATA ACCESS audit (Req 13.6): grants carry identity-bearing
    // subject references.
    await this.readAudit.writeReadAudit(access, {
      resource: 'grants',
      capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      returned: result.items.length
    })
    return result
  }

  // --- Issues -------------------------------------------------------------

  /** Cursor-paginated safe issue investigations. Requires the activity capability. */
  async issues(
    access: OAuthAdminAccessContext,
    query: OAuthListQuery
  ): Promise<EnrichedPage<OAuthIssue>> {
    this.requireCapability(access, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    return this.paged(
      access,
      OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      (ctx, effective) => this.repository.queryIssues(ctx, effective)
    )
  }

  /** Detail for a single issue group. Requires the activity capability. */
  async issueDetail(access: OAuthAdminAccessContext, groupId: OpaqueReference): Promise<OAuthIssue> {
    this.requireCapability(access, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    const issue = await this.repository.getIssue(access.deployment, groupId)
    if (!issue) throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment' })
    // Restricted DATA ACCESS audit (Req 13.6): issue detail exposes affected
    // identities and investigation notes.
    await this.readAudit.writeReadAudit(access, {
      resource: 'issue',
      capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      targetReference: groupId,
      returned: 1
    })
    return issue
  }

  // --- Limits -------------------------------------------------------------

  /**
   * Non-mutating quota observation for a server-selected KNOWN pseudonymous
   * quota reference (the aggregate registration bucket). The reader never
   * invokes a mutating rate-decision path and always reports the configured
   * limit even when usage is unavailable (Requirement 12.1).
   */
  async limits(access: OAuthAdminAccessContext, now?: number): Promise<OAuthQuotaObservation> {
    const registrationLimit = Number(
      process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR || DEFAULT_REGISTRATION_LIMIT_PER_HOUR
    )
    const request: QuotaObservationRequest = {
      key: REGISTRATION_QUOTA_KEY,
      limit: Number.isFinite(registrationLimit) && registrationLimit > 0
        ? registrationLimit
        : DEFAULT_REGISTRATION_LIMIT_PER_HOUR,
      windowSeconds: REGISTRATION_WINDOW_SECONDS,
      source: 'dynamic-registration'
    }
    return this.quotaService.observe(access.deployment, request, now)
  }

  // --- Audit --------------------------------------------------------------

  /**
   * Cursor-paginated audit history. Requires the activity capability (the audit
   * read capability per the design's `GET /audit` contract).
   */
  async audit(
    access: OAuthAdminAccessContext,
    query: OAuthListQuery
  ): Promise<EnrichedPage<OAuthAuditRecord>> {
    this.requireCapability(access, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    const result = await this.paged(
      access,
      OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      (ctx, effective) => this.repository.queryAuditRecords(ctx, effective)
    )
    // Restricted DATA ACCESS audit (Req 13.6): reading the audit trail is
    // itself a restricted read. Recorded AFTER the page is produced so the
    // returned page never includes this read's own record; the record's stable
    // `read:audit` referenceId keeps the trail self-describing without a loop.
    await this.readAudit.writeReadAudit(access, {
      resource: 'audit',
      capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
      query,
      returned: result.items.length
    })
    return result
  }

  // --- Shared paging machinery -------------------------------------------

  /**
   * Run a repository list query under cursor-bound paging. Strips undocumented
   * and unauthorized filters, decodes/validates an inbound cursor against the
   * caller's binding, resolves the continuation offset, fetches a bounded slice
   * from the repository, and issues a signed `nextCursor` when more rows remain.
   *
   * The continuation `position` is an opaque numeric offset into the ordered
   * result. Because the repository orders deterministically for a given query,
   * an offset is a stable continuation: page N requests `offset + limit` rows
   * (bounded to the 100 cap) and returns the `[offset, offset + limit)` slice.
   */
  private async paged<T>(
    access: OAuthAdminAccessContext,
    capability: OAuthCapability,
    query: OAuthListQuery,
    run: (ctx: OAuthDeploymentContext, effective: OAuthListQuery) => Promise<OAuthPagedResult<T>>
  ): Promise<EnrichedPage<T>> {
    const ctx = access.deployment
    const requestedLimit = resolveLimit(query.limit)
    const sanitized = this.sanitizeQuery(query, access)
    const binding = cursorBindingFor(ctx, access.actor, capability, sanitized)

    // Resolve the continuation offset from a validated inbound cursor.
    const offset = query.cursor ? this.resolveCursorOffset(query.cursor, binding) : 0

    // Request enough rows to cover the offset plus this page, bounded by the
    // repository's hard 100 cap. When the offset already reaches the cap there
    // is no further page to serve from the projection.
    const fetchLimit = Math.min(MAX_LIMIT, offset + requestedLimit)
    const effective: OAuthListQuery = { ...sanitized, limit: fetchLimit }
    const result = await run(ctx, effective)

    const sliced = result.items.slice(offset, offset + requestedLimit)
    const consumed = offset + sliced.length
    // More rows remain when the repository saw more than we consumed, or it
    // reported an unbounded `hasMore` beyond the fetched window.
    const hasMore = result.page.hasMore || result.items.length > consumed
    const nextOffset = consumed

    const nextCursor = hasMore && nextOffset < MAX_LIMIT
      ? issueBoundCursor(this.codec, binding, String(nextOffset))
      : null

    // A total is only PROVABLY exact on a fully-covered, single, complete page
    // (no inbound cursor, no next page). Otherwise it stays null/false — never
    // invented (Requirement 5.1 / 16.3 / 17.4).
    const isFirstPage = !query.cursor
    const provablyComplete = isFirstPage && !hasMore && result.page.coverage === 'complete'
    const total = provablyComplete ? sliced.length : null
    const totalIsExact = provablyComplete

    return {
      items: sliced,
      page: {
        ...result.page,
        limit: requestedLimit,
        returned: sliced.length,
        hasMore,
        nextCursor,
        total,
        totalIsExact
      }
    }
  }

  /**
   * Decode and validate an inbound cursor against the caller's binding, then
   * parse its opaque position into a non-negative offset. A malformed offset is
   * a rejected cursor (fail closed).
   */
  private resolveCursorOffset(cursor: string, binding: CursorBinding): number {
    const claims = decodeBoundCursor(this.codec, cursor, binding)
    const offset = Number(claims.position)
    if (!Number.isInteger(offset) || offset < 0 || offset > MAX_LIMIT) {
      throw oauthAdminErrors.conflict({
        message: 'Cursor position is invalid',
        data: { reason: 'CURSOR_REJECTED' }
      })
    }
    return offset
  }

  /**
   * Produce the effective query the repository sees: ONLY the documented filter
   * fields survive, and identity-bearing filters are dropped unless the caller
   * holds the activity capability. `limit`/`order`/window bounding are applied
   * by `repository-support` downstream; `cursor` is consumed by the service and
   * never forwarded to the repository.
   */
  private sanitizeQuery(query: OAuthListQuery, access: OAuthAdminAccessContext): OAuthListQuery {
    const hasActivity = access.capabilities.includes(OAUTH_CAPABILITIES.ACTIVITY_VIEW)
    const effective: OAuthListQuery = {}

    // Window + non-identity filters are always allowed.
    if (query.from !== undefined) effective.from = query.from
    if (query.to !== undefined) effective.to = query.to
    if (query.clientId) effective.clientId = query.clientId
    if (query.resource) effective.resource = query.resource
    if (query.outcome) effective.outcome = query.outcome
    if (query.stage) effective.stage = query.stage
    if (query.diagnosticReference) effective.diagnosticReference = query.diagnosticReference
    if (query.order) effective.order = query.order
    if (query.limit !== undefined) effective.limit = query.limit

    // Identity-bearing filters require the activity capability (Requirement 8.1).
    for (const field of IDENTITY_FILTER_FIELDS) {
      const value = query[field]
      if (value && hasActivity) effective[field] = value
    }

    return effective
  }

  // --- Application-status resolution helpers ------------------------------

  /**
   * Compose the per-application configuration truth for the two well-known
   * deployment applications from the same runtime accessors the provider was
   * built from. `openid`/`offline_access` are the base OIDC scopes every
   * application supports; the resource-specific scopes are unioned on top so
   * each application's `expectedScopes` reflects the deployment's real
   * configuration rather than a hard-coded list.
   */
  private resolveApplicationConfigs(): OAuthApplicationConfig[] {
    const baseScopes = ['openid', 'offline_access']
    return [
      {
        application: 'mcp',
        resource: getMcpResourceUrl().href,
        expectedScopes: [...new Set([...baseScopes, ...GHOST_MCP_SCOPES])]
      },
      {
        application: 'kiro-crew',
        resource: getKiroCrewResourceUrl().href,
        expectedScopes: [...new Set([...baseScopes, ...KIROCREW_SCOPES])]
      }
    ]
  }

  /**
   * Resolve the seeded Client projections to the detail shape the status
   * projector needs. Reads a bounded page of application summaries from the
   * indexed projection query, then loads each stored detail. This touches ONLY
   * the projection store; it never scans the provider artifact table and never
   * invokes the per-detail `reconcileClient` allowance.
   */
  private async resolveClientProjections(ctx: OAuthDeploymentContext): Promise<OAuthApplicationDetail[]> {
    const page = await this.repository.queryApplications(ctx, { limit: MAX_LIMIT, order: 'desc' })
    const details = await Promise.all(
      page.items.map(summary => this.repository.getApplication(ctx, summary.clientId))
    )
    return details.filter((detail): detail is OAuthApplicationDetail => detail !== null)
  }

  /**
   * Resolve the live Grant projections used for grant-truth. Reads a bounded
   * page from the indexed projection query; expiry/tombstone filtering is
   * applied by the pure projector so grant liveness stays deterministic.
   */
  private async resolveGrantProjections(ctx: OAuthDeploymentContext): Promise<OAuthGrantSummary[]> {
    const page = await this.repository.queryGrants(ctx, { limit: MAX_LIMIT, order: 'desc' })
    return page.items
  }

  /**
   * Read the backfill checkpoint coverage. A missing checkpoint means the
   * inventory has never been seeded, so coverage is `unavailable` and the
   * projector reports `unknown` rather than a confident registration state
   * (Requirement 3.8).
   */
  private async resolveBackfillCoverage(ctx: OAuthDeploymentContext): Promise<OAuthCoverageState> {
    const checkpoint = await this.repository.getCheckpoint(ctx, 'checkpoints')
    return checkpoint?.coverage ?? 'unavailable'
  }

  /** Throw a typed 403 when the access context lacks the given capability. */
  private requireCapability(access: OAuthAdminAccessContext, capability: OAuthCapability): void {
    if (!access.capabilities.includes(capability)) {
      throw oauthAdminErrors.forbidden({
        message: 'Missing required OAuth administration capability',
        data: { capability }
      })
    }
  }
}

/**
 * Shared query service for server read paths, constructed lazily so the
 * repository/projection factories in `./index` are resolved on first use rather
 * than at module load (avoids an import cycle with the barrel).
 */
let sharedQueryService: OAuthQueryService | undefined

/** Resolve the shared {@link OAuthQueryService} for the current deployment. */
export function getOAuthQueryService(): OAuthQueryService {
  if (!sharedQueryService) sharedQueryService = new OAuthQueryService()
  return sharedQueryService
}
