/**
 * OAuth Administration — idempotent issue aggregation and safe issue projections.
 *
 * Groups repeated OAuth failures into actionable {@link OAuthIssue}
 * investigations (design "Diagnostics, maintenance, and alerts" issue-
 * aggregation paragraph; design "OAuthIssueAlertService"; Requirements 10.1,
 * 10.2, 10.3, 10.4, 10.6).
 *
 * Behavioural contract:
 *   - Aggregation groups ONLY by deployment, stage, safe error code, known
 *     client/resource, and a fixed 15-minute window (Requirement 10.1). No other
 *     field participates in the group key.
 *   - Aggregation is IDEMPOTENT by event ID. Counts are recomputed
 *     deterministically from the DISTINCT event IDs that fall inside a group's
 *     window, so re-processing the same event (or the same window) yields
 *     identical counts and never double-counts (design "idempotent by event
 *     ID"). A prior projection's counts are never additively mutated — the
 *     window is recomputed from scratch.
 *   - Anonymous attempts (no observed subject) are kept DISTINCT from identified
 *     authenticated users (`anonymousCount` vs `identifiedCount`, Requirement
 *     10.3). Both are counted per distinct event, matching the total `count`.
 *   - Category classification (Requirement 10.4) maps stage + safe error
 *     evidence to one of the fixed categories; an unobserved client-side cause
 *     (a stage GHOST cannot itself observe, e.g. a browser callback) is marked
 *     `unverified`.
 *   - Recovery evidence (`verification`) is derived from OBSERVED evidence only;
 *     aggregation NEVER fabricates recovery and NEVER sets an administrator
 *     disposition (Requirement 10.6). A new issue starts `open` /
 *     `no-recovery-evidence`; an existing issue keeps its admin-owned
 *     disposition, owner, notes, and mitigation untouched (those are set by the
 *     operation service in task 11.2).
 *
 * The core grouping/classification is a PURE, unit-testable transform
 * ({@link aggregateIssueGroups}); the service wraps it with repository reads/
 * writes and applies the redactor to every persisted projection.
 */

import type {
  IsoDateTime,
  OAuthCoverageMetadata,
  OAuthCoverageState,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthIssue,
  OAuthIssueCategory,
  OAuthIssueSeverity,
  OAuthListQuery,
  OAuthStage,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminRedactor, OAuthAdminRepository } from './types'
import { getOAuthAdminRepository } from './index'
import { oauthAdminRedactor } from './redactor'
import { MAX_LIMIT } from './repository-support'

/** The fixed aggregation window: 15 minutes (design; Requirement 10.1). */
export const ISSUE_WINDOW_MS = 15 * 60 * 1000

/** A placeholder token used in the group key when a dimension was not observed. */
const UNOBSERVED = '-'

/**
 * The pure result of grouping a batch of events: one entry per distinct group.
 * Counts are derived from the DISTINCT event IDs in the window, so re-running
 * the transform over the same (or a superset) event set is idempotent.
 */
export interface OAuthIssueGroup {
  /** Stable opaque group id (deterministic from the group dimensions). */
  groupId: OpaqueReference
  /** Human-safe, deterministic group key describing the group dimensions. */
  groupKey: string
  stage: OAuthStage
  /** Safe error code, when one was observed. */
  errorCode?: string
  clientReference?: OpaqueReference
  resourceReference?: OpaqueReference
  windowStart: IsoDateTime
  windowEnd: IsoDateTime
  /** Distinct failing events contributing to this group. */
  count: number
  anonymousCount: number
  identifiedCount: number
  firstObservedAt: IsoDateTime
  lastObservedAt: IsoDateTime
  category: OAuthIssueCategory
  /** True when the classification reflects an unobserved client-side cause. */
  unverified: boolean
  severity: OAuthIssueSeverity
}

/**
 * Only failure-shaped outcomes contribute to an issue. A `success` event is
 * evidence of health, never a grouped failure (aggregation never fabricates a
 * problem from a healthy stage).
 */
function isFailureEvent(event: OAuthEvent): boolean {
  return event.outcome === 'failure' || event.outcome === 'denied'
}

/** Floor a timestamp to the start of its fixed 15-minute window. */
export function windowStartMsFor(timestampMs: number): number {
  return Math.floor(timestampMs / ISSUE_WINDOW_MS) * ISSUE_WINDOW_MS
}

/**
 * Stages GHOST cannot itself observe server-side — a failure classified from one
 * of these reflects an unobserved client-side cause and is marked `unverified`
 * (Requirement 10.4). The browser callback and any local installer step happen
 * outside the server, so their "failure" is inferred, not observed.
 */
const CLIENT_SIDE_STAGES: ReadonlySet<OAuthStage> = new Set<OAuthStage>([
  // A browser callback / redirect landing is not observed by the server.
  'authorization'
])

/**
 * Map a failing event's stage + safe error evidence to a fixed issue category
 * (Requirement 10.4). Pure and deterministic. Error-code hints refine the
 * stage-derived default (e.g. an `invalid_redirect_uri` on authorization is a
 * metadata/redirect problem, a PKCE/state failure is `pkce-state`).
 */
export function classifyIssueCategory(
  stage: OAuthStage,
  errorCode?: string,
  errorCategory?: string
): OAuthIssueCategory {
  const hint = `${errorCode ?? ''} ${errorCategory ?? ''}`.toLowerCase()

  // Transport/TLS problems can surface on any stage; check the evidence first.
  if (/\btls\b|\bssl\b|certificate|handshake|transport/.test(hint)) return 'transport-tls'
  if (/redirect|metadata|invalid_redirect/.test(hint)) return 'metadata-redirect'
  if (/pkce|code_challenge|code_verifier|\bstate\b|csrf/.test(hint)) return 'pkce-state'
  if (/issuer|audience|\baud\b|\biss\b/.test(hint)) return 'issuer-audience'
  if (/quota|rate|throttl|429|too_many/.test(hint)) return 'quota'
  if (/consent|access_denied|denied/.test(hint)) return 'consent'
  if (/storage|permission|dynamo|persist/.test(hint)) return 'storage-permission'
  if (/profile|crew/.test(hint)) return 'profile'

  // Fall back to a stage-derived category when the error evidence is generic.
  switch (stage) {
    case 'protected-resource-discovery':
    case 'authorization-server-discovery':
      return 'discovery'
    case 'registration':
      return 'quota'
    case 'authorization':
      return 'callback'
    case 'consent':
      return 'consent'
    case 'token-exchange':
    case 'refresh':
    case 'revocation':
      return 'grant'
    case 'provider-storage':
      return 'storage-permission'
    case 'crew-profile-retrieval':
      return 'profile'
    case 'protected-resource-verification':
      return 'issuer-audience'
    case 'website-session':
    default:
      return 'discovery'
  }
}

/**
 * Derive a severity from the distinct failure count and stage. Deterministic:
 * the same window always yields the same severity. Storage/permission failures
 * escalate faster because they affect every attempt on the deployment.
 */
function deriveSeverity(count: number, stage: OAuthStage): OAuthIssueSeverity {
  const storageWeighted = stage === 'provider-storage'
  if (count >= (storageWeighted ? 3 : 20)) return 'critical'
  if (count >= (storageWeighted ? 2 : 10)) return 'high'
  if (count >= (storageWeighted ? 1 : 3)) return 'medium'
  return 'low'
}

/**
 * Deterministically derive a stable opaque group id from the (already
 * non-secret) group dimensions. The same dimensions always hash to the same id,
 * so re-aggregation upserts the SAME issue row rather than creating a duplicate
 * (idempotency by group; design "keyed by group").
 */
function deriveGroupId(deploymentId: string, groupKey: string): OpaqueReference {
  let hash = 5381
  const material = `${deploymentId}|${groupKey}`
  for (let i = 0; i < material.length; i++) {
    hash = ((hash << 5) + hash + material.charCodeAt(i)) >>> 0
  }
  return `issue_${hash.toString(36)}`
}

/**
 * Build the deterministic, human-safe group key from the fixed dimensions
 * (Requirement 10.1). ONLY deployment, stage, safe error code, known client,
 * known resource, and the 15-minute window boundary participate. A missing
 * dimension uses a fixed placeholder so absence is itself stable.
 */
function buildGroupKey(
  deploymentId: string,
  stage: OAuthStage,
  errorCode: string | undefined,
  clientReference: string | undefined,
  resourceReference: string | undefined,
  windowStartMs: number
): string {
  return [
    deploymentId,
    stage,
    errorCode || UNOBSERVED,
    clientReference || UNOBSERVED,
    resourceReference || UNOBSERVED,
    new Date(windowStartMs).toISOString()
  ].join('|')
}

interface MutableGroup {
  group: OAuthIssueGroup
  /** Distinct event IDs seen for this group — the idempotency membership set. */
  seen: Set<string>
  firstMs: number
  lastMs: number
}

/**
 * PURE grouping/classification transform. Groups the failing events in the
 * batch by the fixed dimensions and recomputes counts from the DISTINCT event
 * IDs in each group. Passing the same event ID twice (or the same batch twice)
 * yields identical groups and counts — the transform is naturally idempotent.
 *
 * Non-failure events and events missing a stage are ignored. The transform
 * performs no I/O and never mutates the events it reads.
 */
export function aggregateIssueGroups(
  ctx: OAuthDeploymentContext,
  events: readonly OAuthEvent[]
): OAuthIssueGroup[] {
  const groups = new Map<string, MutableGroup>()

  for (const event of events) {
    if (!isFailureEvent(event)) continue
    const ts = new Date(event.timestamp).getTime()
    if (!Number.isFinite(ts)) continue

    const windowStartMs = windowStartMsFor(ts)
    const groupKey = buildGroupKey(
      ctx.deploymentId,
      event.stage,
      event.errorCode,
      event.clientReference,
      event.resourceReference,
      windowStartMs
    )

    let bucket = groups.get(groupKey)
    if (!bucket) {
      const category = classifyIssueCategory(event.stage, event.errorCode, event.errorCategory)
      bucket = {
        seen: new Set<string>(),
        firstMs: ts,
        lastMs: ts,
        group: {
          groupId: deriveGroupId(ctx.deploymentId, groupKey),
          groupKey,
          stage: event.stage,
          errorCode: event.errorCode,
          clientReference: event.clientReference,
          resourceReference: event.resourceReference,
          windowStart: new Date(windowStartMs).toISOString(),
          windowEnd: new Date(windowStartMs + ISSUE_WINDOW_MS).toISOString(),
          count: 0,
          anonymousCount: 0,
          identifiedCount: 0,
          firstObservedAt: event.timestamp,
          lastObservedAt: event.timestamp,
          category,
          unverified: CLIENT_SIDE_STAGES.has(event.stage),
          severity: 'low'
        }
      }
      groups.set(groupKey, bucket)
    }

    // Idempotency: a repeated event ID never increments a count again.
    if (bucket.seen.has(event.eventId)) continue
    bucket.seen.add(event.eventId)

    bucket.group.count += 1
    // Anonymous (no observed subject) stays distinct from identified users.
    if (event.subjectReference) bucket.group.identifiedCount += 1
    else bucket.group.anonymousCount += 1

    if (ts < bucket.firstMs) {
      bucket.firstMs = ts
      bucket.group.firstObservedAt = event.timestamp
    }
    if (ts > bucket.lastMs) {
      bucket.lastMs = ts
      bucket.group.lastObservedAt = event.timestamp
    }
  }

  // Finalize severity now that the distinct count is known.
  const result: OAuthIssueGroup[] = []
  for (const { group } of groups.values()) {
    group.severity = deriveSeverity(group.count, group.stage)
    result.push(group)
  }
  return result
}

/**
 * Options bounding a single aggregation run that reads a window from the
 * repository.
 */
export interface OAuthIssueAggregationOptions {
  /** Inclusive window start; defaults to `windowMs` before `now`. */
  from?: IsoDateTime
  /** Inclusive window end; defaults to `now`. */
  to?: IsoDateTime
  /** Injected clock for deterministic tests. */
  now?: number
}

/** Outcome of an aggregation run. */
export interface OAuthIssueAggregationResult {
  /** Number of distinct issue groups projected in this run. */
  groups: number
  /** Number of failing events considered. */
  events: number
  /** Coverage of the event window this run read. */
  coverage: OAuthCoverageState
}

/**
 * Idempotent issue aggregation service. Reads a bounded window of events (or
 * accepts an explicit batch), computes safe issue groups with the pure
 * transform, and upserts one redacted {@link OAuthIssue} projection per group.
 * The read-only issue projection is served by the query service, which reads
 * exactly these rows.
 */
export class OAuthIssueAggregationService {
  constructor(
    private readonly repository: OAuthAdminRepository = getOAuthAdminRepository(),
    private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor
  ) {}

  /**
   * Aggregate the failing events in a bounded window into issue projections.
   * Reads the window from the repository (indexed, bounded), then upserts one
   * projection per group. Re-running over the same window yields identical
   * counts and upserts the same rows (idempotent).
   */
  async aggregateWindow(
    ctx: OAuthDeploymentContext,
    options: OAuthIssueAggregationOptions = {}
  ): Promise<OAuthIssueAggregationResult> {
    const now = options.now ?? Date.now()
    const to = options.to ?? new Date(now).toISOString()
    const from = options.from ?? new Date(now - ISSUE_WINDOW_MS).toISOString()

    const query: OAuthListQuery = { from, to, limit: MAX_LIMIT, order: 'asc' }
    const page = await this.repository.queryEvents(ctx, query)

    const groups = aggregateIssueGroups(ctx, page.items)
    const failingEvents = page.items.filter(isFailureEvent).length

    for (const group of groups) {
      await this.persistGroup(ctx, group, page.page.coverage)
    }

    return {
      groups: groups.length,
      events: failingEvents,
      coverage: page.page.coverage
    }
  }

  /**
   * Aggregate an explicit batch of events (e.g. a just-collected set) into issue
   * projections. Same idempotent semantics as {@link aggregateWindow}, but the
   * caller supplies the events. Coverage of a supplied batch is reported as
   * `partial` because the batch is not a full window read.
   */
  async aggregateBatch(
    ctx: OAuthDeploymentContext,
    events: readonly OAuthEvent[]
  ): Promise<OAuthIssueAggregationResult> {
    const groups = aggregateIssueGroups(ctx, events)
    for (const group of groups) {
      await this.persistGroup(ctx, group, 'partial')
    }
    return {
      groups: groups.length,
      events: events.filter(isFailureEvent).length,
      coverage: 'partial'
    }
  }

  /**
   * Upsert a single group's projection. The recomputed evidence (counts,
   * window, first/last observed, severity, category, verification) OVERWRITES
   * the observed fields so re-aggregation is idempotent, while the administrator-
   * owned fields (disposition, owner, notes, mitigation) are PRESERVED from any
   * existing projection — aggregation never fabricates recovery or a disposition
   * (Requirement 10.6). The projection is redacted before it is persisted.
   */
  private async persistGroup(
    ctx: OAuthDeploymentContext,
    group: OAuthIssueGroup,
    coverage: OAuthCoverageState
  ): Promise<void> {
    const existing = await this.repository.getIssue(ctx, group.groupId)

    const metadata: OAuthCoverageMetadata = {
      coverage,
      freshness: 'fresh',
      availability: coverage === 'unavailable' ? 'unavailable' : 'available',
      collectedAt: new Date().toISOString(),
      windowStart: group.windowStart,
      windowEnd: group.windowEnd
    }

    const issue: OAuthIssue = {
      groupId: group.groupId,
      groupKey: group.groupKey,
      windowStart: group.windowStart,
      windowEnd: group.windowEnd,
      count: group.count,
      firstObservedAt: group.firstObservedAt,
      lastObservedAt: group.lastObservedAt,
      anonymousCount: group.anonymousCount,
      identifiedCount: group.identifiedCount,
      severity: group.severity,
      category: group.category,
      unverified: group.unverified,
      // Administrator-owned fields are preserved from the existing projection;
      // aggregation never invents them (Requirement 10.6, task 11.2).
      owner: existing?.owner,
      notes: existing?.notes,
      mitigation: existing?.mitigation,
      disposition: existing?.disposition ?? 'open',
      // Recovery evidence is derived from observed evidence only; a fresh
      // aggregation has no recovery evidence, so a new issue is
      // `no-recovery-evidence` and an existing one keeps its evidence-derived
      // value. Aggregation NEVER upgrades this to `observed-recovery`.
      verification: existing?.verification === 'observed-recovery'
        ? 'observed-recovery'
        : existing?.verification ?? 'no-recovery-evidence',
      revision: existing?.revision ?? '1',
      metadata
    }

    await this.repository.upsertIssue(ctx, this.redactor.redact(issue))
  }
}

/**
 * Shared aggregation service for maintenance/collection paths, constructed
 * lazily so the repository factory in `./index` is resolved on first use rather
 * than at module load (avoids an import cycle with the barrel).
 */
let sharedAggregationService: OAuthIssueAggregationService | undefined

/** Resolve the shared {@link OAuthIssueAggregationService} for the deployment. */
export function getOAuthIssueAggregationService(): OAuthIssueAggregationService {
  if (!sharedAggregationService) sharedAggregationService = new OAuthIssueAggregationService()
  return sharedAggregationService
}
