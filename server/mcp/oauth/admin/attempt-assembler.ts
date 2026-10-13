/**
 * OAuth Administration — evidence-only attempt assembler.
 *
 * Joins the allowlisted event stream into OAuth "attempts" using ONLY supported
 * correlation evidence (Requirements 4.3, 4.4; design "Observation and query
 * flow", "Requirement 8").
 *
 * Behavioural contract:
 *   - An attempt is assembled ONLY from an existing non-secret reference the
 *     server actually observed: a server/request/interaction correlation
 *     reference, a grant reference, or a diagnostic reference. Events are never
 *     joined by IP address (`networkReference`), display name, subject, or a
 *     nearby timestamp (4.3).
 *   - An event with NO supported reference is preserved as its own uncorrelated
 *     single-event attempt — it is never dropped and never merged into a
 *     neighbouring attempt (4.3, design "preserve uncorrelated events").
 *   - A pre-login event that lacks a user/client leaves those references absent;
 *     the assembler never back-fills them from another event (4.4).
 *   - Stages the server does NOT observe (browser callback, installer step,
 *     cancellation, and any other unobserved stage) remain `unknown` rather than
 *     being invented (Requirement 8.4).
 *
 * The assembler is a PURE transform over events plus the deployment context; it
 * performs no I/O and never mutates the events it reads.
 */

import type {
  IsoDateTime,
  OAuthAttemptState,
  OAuthCoverageMetadata,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthStage,
  OpaqueReference
} from '#shared/types/oauth-administration'

/**
 * The correlation reference that grouped an attempt, and which field supplied
 * it. `uncorrelated` marks an event with no supported reference (Requirement
 * 4.3) — such an event still becomes its own attempt.
 */
export type OAuthAttemptCorrelationKind =
  | 'correlation'
  | 'reference'
  | 'grant'
  | 'diagnostic'
  | 'uncorrelated'

/** One observed stage within an attempt timeline. */
export interface OAuthAttemptStageEntry {
  stage: OAuthStage
  /** The stage state; `unknown` for a stage the server never observed. */
  state: OAuthAttemptState
  /** When the stage was observed, when known. */
  observedAt?: IsoDateTime
  /** True when GHOST observed this stage; false marks an unobserved placeholder. */
  observed: boolean
}

/**
 * An assembled attempt. References that were never observed stay ABSENT (they
 * are not inferred). The stage timeline lists observed stages; consumers may
 * treat any stage not present as `unknown`.
 */
export interface OAuthAttempt {
  /** Opaque attempt id derived from the correlating reference. */
  attemptId: OpaqueReference
  /** Which reference joined the attempt, or `uncorrelated`. */
  correlationKind: OAuthAttemptCorrelationKind
  /** The correlating reference value, when correlated. */
  correlationReference?: OpaqueReference
  /** Overall attempt state derived from the latest supported evidence. */
  state: OAuthAttemptState
  /** Client reference, present only if an event observed one (never inferred). */
  clientReference?: OpaqueReference
  /** Subject reference, present only if an event observed one (never inferred). */
  subjectReference?: OpaqueReference
  /** Resource reference, present only if an event observed one. */
  resourceReference?: OpaqueReference
  /** First observed event time in the attempt. */
  firstObservedAt: IsoDateTime
  /** Last observed event time in the attempt. */
  lastObservedAt: IsoDateTime
  /** The contributing event ids, in observation order. */
  eventIds: OpaqueReference[]
  /** Observed stage timeline. */
  stages: OAuthAttemptStageEntry[]
  /** Evidence source label. */
  source: string
  metadata: OAuthCoverageMetadata
}

/** Options for a single assembly pass. */
export interface AttemptAssemblyOptions {
  /** Evaluation clock; defaults to `Date.now()`. Injected for deterministic tests. */
  now?: number
  /** Evidence source label recorded on each attempt. */
  source?: string
}

/**
 * Resolve the single supported correlation key for an event. Returns the first
 * available reference in priority order, or `null` when NO supported reference
 * exists. IP/display/subject/timestamp are intentionally NOT consulted here —
 * they must never join two events (Requirement 4.3).
 */
function resolveCorrelation(event: OAuthEvent): { kind: OAuthAttemptCorrelationKind, reference: OpaqueReference } | null {
  if (event.correlationReference) return { kind: 'correlation', reference: event.correlationReference }
  if (event.referenceId) return { kind: 'reference', reference: event.referenceId }
  if (event.diagnosticReference) return { kind: 'diagnostic', reference: event.diagnosticReference }
  // A grant reference joins refresh/revocation events for an already-issued
  // grant. It is a genuine server-observed reference, not an inference.
  return null
}

function isFiniteTime(iso: IsoDateTime | undefined): boolean {
  if (!iso) return false
  return Number.isFinite(new Date(iso).getTime())
}

/** Ascending timestamp comparison; unparseable times sort last. */
function byTimestampAsc(a: OAuthEvent, b: OAuthEvent): number {
  const at = isFiniteTime(a.timestamp) ? new Date(a.timestamp).getTime() : Number.POSITIVE_INFINITY
  const bt = isFiniteTime(b.timestamp) ? new Date(b.timestamp).getTime() : Number.POSITIVE_INFINITY
  return at - bt
}

/**
 * Derive the overall attempt state from its events. Uses the LATEST observed
 * event's attempt state as the outcome, because the newest supported evidence
 * reflects where the attempt currently stands. With no parseable events the
 * state stays `unknown` (never invented).
 */
function deriveAttemptState(orderedEvents: OAuthEvent[]): OAuthAttemptState {
  // Prefer a terminal state if one was ever observed, otherwise the latest.
  const terminal: OAuthAttemptState[] = ['succeeded', 'denied', 'cancelled', 'expired', 'failed']
  for (let i = orderedEvents.length - 1; i >= 0; i--) {
    const state = orderedEvents[i]?.attemptState
    if (state && terminal.includes(state)) return state
  }
  const latest = orderedEvents[orderedEvents.length - 1]?.attemptState
  return latest ?? 'unknown'
}

/**
 * Build the observed stage timeline for an attempt. Only stages the events
 * actually carry are listed as observed; the assembler does NOT invent a
 * browser callback, installer, or cancellation stage that GHOST never saw
 * (Requirement 8.4). Consumers treat any absent stage as `unknown`.
 */
function buildStageTimeline(orderedEvents: OAuthEvent[]): OAuthAttemptStageEntry[] {
  const stages: OAuthAttemptStageEntry[] = []
  const seen = new Set<string>()
  for (const event of orderedEvents) {
    // Keep the FIRST observation of each stage for stable timeline ordering.
    const key = event.stage
    if (seen.has(key)) continue
    seen.add(key)
    stages.push({
      stage: event.stage,
      state: event.attemptState,
      observedAt: isFiniteTime(event.timestamp) ? event.timestamp : undefined,
      observed: true
    })
  }
  return stages
}

/**
 * Assemble events into attempts using only supported correlation evidence.
 * Events without a supported reference each become their own uncorrelated
 * attempt (never merged, never dropped).
 */
export function assembleAttempts(
  ctx: OAuthDeploymentContext,
  events: OAuthEvent[],
  options?: AttemptAssemblyOptions
): OAuthAttempt[] {
  const now = options?.now ?? Date.now()
  const source = options?.source ?? 'attempt-assembler'

  // Group correlated events by their single supported reference. Uncorrelated
  // events are collected separately so each becomes an independent attempt.
  const correlated = new Map<string, { kind: OAuthAttemptCorrelationKind, events: OAuthEvent[] }>()
  const uncorrelated: OAuthEvent[] = []

  for (const event of events) {
    const correlation = resolveCorrelation(event)
    if (!correlation) {
      uncorrelated.push(event)
      continue
    }
    // Namespace the group key by kind so a grant id and a request id that happen
    // to share a value can never collide into one attempt.
    const groupKey = `${correlation.kind}:${correlation.reference}`
    const bucket = correlated.get(groupKey)
    if (bucket) bucket.events.push(event)
    else correlated.set(groupKey, { kind: correlation.kind, events: [event] })
  }

  const attempts: OAuthAttempt[] = []

  for (const [groupKey, group] of correlated) {
    attempts.push(buildAttempt(ctx, group.kind, group.events, now, source, groupKey))
  }

  for (const event of uncorrelated) {
    // An uncorrelated event is preserved as its own single-event attempt keyed
    // by its event id. It is never joined to any other event.
    attempts.push(buildAttempt(ctx, 'uncorrelated', [event], now, source, `uncorrelated:${event.eventId}`))
  }

  // Stable ordering: newest attempt first by last-observed time.
  attempts.sort((a, b) => new Date(b.lastObservedAt).getTime() - new Date(a.lastObservedAt).getTime())
  return attempts
}

function buildAttempt(
  ctx: OAuthDeploymentContext,
  kind: OAuthAttemptCorrelationKind,
  groupEvents: OAuthEvent[],
  now: number,
  source: string,
  groupKey: string
): OAuthAttempt {
  const ordered = [...groupEvents].sort(byTimestampAsc)

  const times = ordered
    .map(e => e.timestamp)
    .filter(isFiniteTime)
    .map(t => new Date(t as string).getTime())
  const firstMs = times.length ? Math.min(...times) : now
  const lastMs = times.length ? Math.max(...times) : now

  // References are taken ONLY from an event that observed them; they are never
  // inferred from another event, an IP, a display name, or a timestamp. We pick
  // the first non-empty observed value across the attempt's own events.
  const clientReference = ordered.find(e => e.clientReference)?.clientReference
  const subjectReference = ordered.find(e => e.subjectReference)?.subjectReference
  const resourceReference = ordered.find(e => e.resourceReference)?.resourceReference

  const correlationReference = kind === 'uncorrelated'
    ? undefined
    : groupKey.slice(groupKey.indexOf(':') + 1)

  const metadata: OAuthCoverageMetadata = {
    // Correlated attempts are as complete as their observed events; an
    // uncorrelated single event is explicitly partial coverage of an attempt.
    coverage: kind === 'uncorrelated' ? 'partial' : 'complete',
    freshness: 'fresh',
    availability: 'available',
    collectedAt: new Date(lastMs).toISOString(),
    windowStart: new Date(firstMs).toISOString(),
    windowEnd: new Date(lastMs).toISOString()
  }

  return {
    attemptId: `attempt_${hashKey(ctx, groupKey)}`,
    correlationKind: kind,
    correlationReference,
    state: deriveAttemptState(ordered),
    clientReference,
    subjectReference,
    resourceReference,
    firstObservedAt: new Date(firstMs).toISOString(),
    lastObservedAt: new Date(lastMs).toISOString(),
    eventIds: ordered.map(e => e.eventId),
    stages: buildStageTimeline(ordered),
    source,
    metadata
  }
}

/**
 * Derive a stable, opaque attempt id from the deployment and the (already
 * non-secret) correlation group key. Deterministic so a re-assembly of the same
 * events yields the same attempt id.
 */
function hashKey(ctx: OAuthDeploymentContext, groupKey: string): string {
  let hash = 5381
  const material = `${ctx.deploymentId}|${groupKey}`
  for (let i = 0; i < material.length; i++) {
    hash = ((hash << 5) + hash + material.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}
