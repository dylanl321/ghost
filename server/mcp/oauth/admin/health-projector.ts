/**
 * OAuth Administration — independent per-stage health projector.
 *
 * Projects the allowlisted event stream into one INDEPENDENT
 * {@link OAuthObservation} per OAuth stage (Requirements 2.3, 2.4, 2.5, 2.6).
 *
 * Behavioural contract:
 *   - Every stage the panel distinguishes gets its own observation. A success
 *     in one stage NEVER implies success in another (2.4): each stage is
 *     projected only from events that carry that exact `stage`.
 *   - Absent, stale, partial, or unavailable evidence is surfaced EXPLICITLY —
 *     never as a healthy or zero-failure state (2.5). A stage with no observed
 *     events is `unknown`/`unavailable`, not `healthy`.
 *   - A stale window (the newest event for a stage is older than the freshness
 *     horizon) is labelled `freshness: 'stale'` and can never read as `healthy`.
 *   - Each observation carries its source, collected time, safe outcome, and an
 *     applicable next action (2.6).
 *
 * The projector is a PURE transform over events plus the deployment context and
 * an evaluation clock. It performs no I/O and never mutates the events it reads,
 * so it is deterministic and property-testable.
 */

import type {
  IsoDateTime,
  OAuthAvailability,
  OAuthCoverageState,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthFreshness,
  OAuthObservation,
  OAuthOutcome,
  OAuthStage
} from '#shared/types/oauth-administration'

/**
 * The full set of stages the Overview health cards distinguish. The projector
 * always emits an observation for EVERY stage so a stage with no evidence is
 * still rendered explicitly as unknown rather than silently omitted.
 */
export const OAUTH_HEALTH_STAGES: readonly OAuthStage[] = [
  'website-session',
  'protected-resource-discovery',
  'authorization-server-discovery',
  'registration',
  'authorization',
  'consent',
  'token-exchange',
  'refresh',
  'revocation',
  'provider-storage',
  'protected-resource-verification',
  'crew-profile-retrieval'
] as const

/**
 * How recent the newest event for a stage must be for the observation to be
 * considered `fresh`. Older evidence is `stale` and cannot read as healthy.
 * Fifteen minutes matches the issue-aggregation / alert evaluation window in
 * the design so the Overview does not claim health from long-idle evidence.
 */
export const DEFAULT_FRESHNESS_HORIZON_MS = 15 * 60 * 1000

/** Options bounding a single health projection pass. */
export interface HealthProjectionOptions {
  /** Evaluation clock; defaults to `Date.now()`. Injected for deterministic tests. */
  now?: number
  /** Freshness horizon in milliseconds; defaults to {@link DEFAULT_FRESHNESS_HORIZON_MS}. */
  freshnessHorizonMs?: number
  /** Evidence source label recorded on each observation. */
  source?: string
}

/** The rendered health-card state for a stage. */
type HealthState = OAuthObservation['state']

function isFiniteTime(iso: IsoDateTime | undefined): boolean {
  if (!iso) return false
  return Number.isFinite(new Date(iso).getTime())
}

/**
 * Classify the freshness of a stage from the newest observed event time.
 * Absent or unparseable evidence is `unknown` (never `fresh`).
 */
function classifyFreshness(newest: IsoDateTime | undefined, now: number, horizonMs: number): OAuthFreshness {
  if (!isFiniteTime(newest)) return 'unknown'
  const age = now - new Date(newest as string).getTime()
  if (!Number.isFinite(age)) return 'unknown'
  return age <= horizonMs ? 'fresh' : 'stale'
}

/**
 * Derive the safe stage outcome and rendered state from the stage's events.
 *
 * Rules (Requirement 2.5 — absence/staleness is never healthy/zero):
 *   - No events                       → outcome `unknown`,  state `unknown`
 *   - Any failure/denied in window    → outcome `failure`,  state `failing`
 *   - Stale (all evidence too old)    → outcome preserved,  state `unknown`
 *   - All successes and fresh         → outcome `success`,  state `healthy`
 *   - Mixed but no failures, fresh    → outcome `success`,  state `degraded`
 *     (e.g. some `unknown`/`pending` alongside successes)
 */
function deriveOutcomeAndState(
  events: OAuthEvent[],
  freshness: OAuthFreshness
): { outcome: OAuthOutcome, state: HealthState } {
  if (events.length === 0) {
    return { outcome: 'unknown', state: 'unknown' }
  }

  const hasFailure = events.some(e => e.outcome === 'failure' || e.outcome === 'denied')
  const hasSuccess = events.some(e => e.outcome === 'success')
  const hasUnknown = events.some(e => e.outcome === 'unknown')

  // A failure anywhere in the window makes the stage `failing`, and a failing
  // stage is never reported as healthy or zero failures.
  if (hasFailure) {
    return { outcome: 'failure', state: 'failing' }
  }

  // Stale evidence can never be rendered healthy even when it was all success:
  // the freshness horizon has passed, so we surface `unknown` explicitly.
  if (freshness === 'stale') {
    return { outcome: hasSuccess ? 'success' : 'unknown', state: 'unknown' }
  }

  if (hasSuccess && !hasUnknown) {
    return { outcome: 'success', state: 'healthy' }
  }

  // Successes mixed with unobserved/pending evidence: not a clean success, and
  // certainly not a failure. Degraded surfaces the incompleteness explicitly.
  if (hasSuccess) {
    return { outcome: 'success', state: 'degraded' }
  }

  // Only `unknown`/`pending`-style outcomes were observed.
  return { outcome: 'unknown', state: 'unknown' }
}

/** A safe, human-readable next action for a stage state. */
function nextActionFor(stage: OAuthStage, state: HealthState): string | undefined {
  switch (state) {
    case 'failing':
      return `Investigate recent ${stage} failures in the Activity view.`
    case 'unavailable':
      return 'Telemetry collection is unavailable; recent evidence may be missing.'
    case 'unknown':
      return `No recent ${stage} evidence was observed; the stage state is unknown.`
    case 'degraded':
      return `Some ${stage} evidence is incomplete; review the Activity view.`
    default:
      return undefined
  }
}

/**
 * Project one stage's events into a single independent observation. The stage's
 * events must already be filtered to that stage by the caller.
 */
function projectStage(
  ctx: OAuthDeploymentContext,
  stage: OAuthStage,
  stageEvents: OAuthEvent[],
  options: Required<Pick<HealthProjectionOptions, 'now' | 'freshnessHorizonMs' | 'source'>>,
  availability: OAuthAvailability,
  coverage: OAuthCoverageState
): OAuthObservation {
  // The newest event time for this stage drives freshness and `collectedAt`.
  let newest: IsoDateTime | undefined
  for (const event of stageEvents) {
    if (!isFiniteTime(event.timestamp)) continue
    if (!newest || new Date(event.timestamp).getTime() > new Date(newest).getTime()) {
      newest = event.timestamp
    }
  }

  // When telemetry collection itself is unavailable we cannot assert freshness.
  const freshness = availability === 'unavailable'
    ? 'unknown'
    : classifyFreshness(newest, options.now, options.freshnessHorizonMs)

  let outcome: OAuthOutcome
  let state: HealthState
  if (availability === 'unavailable') {
    // Collection gap: explicit unavailable, never healthy/zero (Requirement 2.5, 4.6).
    outcome = 'unknown'
    state = 'unavailable'
  } else {
    ({ outcome, state } = deriveOutcomeAndState(stageEvents, freshness))
  }

  return {
    deployment: ctx.environment,
    executionMode: ctx.executionMode,
    partition: ctx.partition,
    stage,
    collectedAt: newest,
    source: options.source,
    availability,
    freshness,
    coverage,
    state,
    outcome,
    nextAction: nextActionFor(stage, state)
  }
}

/**
 * Project a set of allowlisted events into independent per-stage health
 * observations. Emits exactly one observation per {@link OAUTH_HEALTH_STAGES}
 * entry so every stage is represented, including stages with no evidence.
 *
 * @param ctx server-resolved deployment context (never caller-supplied)
 * @param events the events observed in the current window (already
 *   deployment-scoped by the repository query)
 * @param options evaluation clock, freshness horizon, and source label
 */
export function projectStageHealth(
  ctx: OAuthDeploymentContext,
  events: OAuthEvent[],
  options?: HealthProjectionOptions
): OAuthObservation[] {
  const resolved = {
    now: options?.now ?? Date.now(),
    freshnessHorizonMs: options?.freshnessHorizonMs ?? DEFAULT_FRESHNESS_HORIZON_MS,
    source: options?.source ?? 'event-collector'
  }

  // Bucket events by stage. Each stage is projected ONLY from its own events so
  // no stage's health is inferred from another's (Requirement 2.4).
  const byStage = new Map<OAuthStage, OAuthEvent[]>()
  for (const event of events) {
    const bucket = byStage.get(event.stage)
    if (bucket) bucket.push(event)
    else byStage.set(event.stage, [event])
  }

  return OAUTH_HEALTH_STAGES.map(stage =>
    projectStage(ctx, stage, byStage.get(stage) ?? [], resolved, 'available', 'complete')
  )
}

/**
 * Project health when telemetry collection is unavailable (the events query
 * itself failed or the projection is rebuilding). Every stage is surfaced as
 * explicitly `unavailable` — the design forbids converting an absent/partial
 * projection into a healthy or zero-failure state (Requirements 2.5, 4.6, 16.5).
 *
 * @param coverage the coverage state that made evidence unavailable/partial;
 *   defaults to `unavailable`.
 */
export function projectUnavailableHealth(
  ctx: OAuthDeploymentContext,
  options?: HealthProjectionOptions,
  coverage: OAuthCoverageState = 'unavailable'
): OAuthObservation[] {
  const resolved = {
    now: options?.now ?? Date.now(),
    freshnessHorizonMs: options?.freshnessHorizonMs ?? DEFAULT_FRESHNESS_HORIZON_MS,
    source: options?.source ?? 'event-collector'
  }
  return OAUTH_HEALTH_STAGES.map(stage =>
    projectStage(ctx, stage, [], resolved, 'unavailable', coverage)
  )
}
