/**
 * OAuth Administration — fire-and-forget allowlisted event collector.
 *
 * The single observation point that turns an observed OAuth stage into a safe,
 * allowlisted {@link OAuthEvent} and persists it WITHOUT ever delaying or
 * failing OAuth traffic (Requirements 2.3, 4.1, 4.2, 4.5, 4.6; design
 * "Observation and query flow").
 *
 * SAFETY / BEHAVIOURAL CONTRACT:
 *   - The collector creates the event id HERE, at the observation point, and
 *     accepts ONLY an explicitly constructed allowlist ({@link OAuthEventInput}).
 *     It never receives or serializes an `H3Event`, request headers,
 *     `oidc-provider` context, raw errors, or provider payloads. Callers hand it
 *     safe references only; the redactor is still applied as defence in depth.
 *   - A pre-login observation leaves user/client references ABSENT — the
 *     collector never fabricates them (Requirement 4.4).
 *   - Correlation that is not supplied stays absent; the collector never infers
 *     a shared attempt from IP, display name, or nearby timestamp (4.3). A raw
 *     network address, when supplied, is converted to a deployment-scoped
 *     pseudonymous reference via the redactor and the raw value is discarded
 *     (16.4).
 *   - Persistence is FIRE-AND-FORGET: `collect()` schedules the write on a
 *     background microtask, returns synchronously, and swallows every failure
 *     into a bounded in-process failure metric. An OAuth request is never
 *     awaited on, delayed by, or failed by telemetry storage (2.3, 4.6). A
 *     bounded retry (default 2 attempts) tolerates a transient write error.
 *   - When storage is unavailable the gap is made VISIBLE through the failure
 *     metric (surfaced to the Overview as a collection gap), never hidden.
 */

import { randomUUID } from 'node:crypto'
import type {
  IsoDateTime,
  OAuthAttemptState,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthOutcome,
  OAuthStage,
  OpaqueReference,
  PseudonymousNetworkReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminRedactor, OAuthAdminRepository } from './types'
import { getOAuthAdminRepository } from './index'
import { oauthAdminRedactor } from './redactor'
import { logger } from '../../../utils/logger'

/**
 * The explicit, safe allowlist a caller hands the collector at the observation
 * point. Every field is a safe primitive or an already-opaque reference. There
 * is deliberately NO field for a raw request, headers, provider context, error
 * object, or payload — those cannot enter the telemetry path.
 */
export interface OAuthEventInput {
  stage: OAuthStage
  outcome: OAuthOutcome
  /** Attempt state; defaults are derived from `outcome` when omitted. */
  attemptState?: OAuthAttemptState
  /** Supported correlation reference (server/request/interaction id). */
  correlationReference?: OpaqueReference
  /** Generic reference id (interaction/grant/diagnostic), when observed. */
  referenceId?: OpaqueReference
  /** Safe HTTP status code, when observed. */
  httpStatus?: number
  /** Safe, non-raw error code (never a raw exception/stack). */
  errorCode?: string
  /** Safe error category. */
  errorCategory?: string
  /** Stage duration in milliseconds, when measured. */
  durationMs?: number
  /** Opaque client reference; ABSENT for a pre-login stage. */
  clientReference?: OpaqueReference
  resourceReference?: OpaqueReference
  /** Opaque subject reference; ABSENT for a pre-login stage. */
  subjectReference?: OpaqueReference
  diagnosticReference?: OpaqueReference
  quotaReference?: OpaqueReference
  releaseReference?: OpaqueReference
  /**
   * A raw network address observed at a network boundary. Converted to a
   * deployment-scoped pseudonymous reference and then DISCARDED — the raw value
   * is never persisted (Requirement 16.4). Prefer omitting this unless a real
   * network boundary was observed.
   */
  rawNetworkAddress?: string
  /** Explicit observation time; defaults to now. */
  observedAt?: IsoDateTime
}

/** A snapshot of the collector's bounded failure metrics (a collection-gap signal). */
export interface OAuthCollectorMetrics {
  /** Events successfully persisted this process lifetime. */
  persisted: number
  /** Events that exhausted retries and were dropped (a visible collection gap). */
  failed: number
  /** Timestamp of the most recent persistence failure, when any. */
  lastFailureAt?: IsoDateTime
  /** Number of writes currently in flight (bounded). */
  inFlight: number
}

/** Default number of persistence attempts (1 try + 1 retry). */
const DEFAULT_MAX_ATTEMPTS = 2
/** Base backoff between retries; kept small so background work stays bounded. */
const RETRY_BASE_DELAY_MS = 25
/**
 * Upper bound on concurrently in-flight background writes. Beyond this the
 * collector drops the event into the failure metric rather than letting passive
 * telemetry create unbounded work behind OAuth traffic (Requirement 4.6).
 */
const MAX_IN_FLIGHT = 256

/** Derive a safe attempt state from an outcome when the caller did not supply one. */
function attemptStateForOutcome(outcome: OAuthOutcome): OAuthAttemptState {
  switch (outcome) {
    case 'success': return 'succeeded'
    case 'denied': return 'denied'
    case 'failure': return 'failed'
    default: return 'unknown'
  }
}

/**
 * The fire-and-forget event collector. A single shared instance is used across
 * request paths; it holds only bounded in-process counters and never blocks.
 */
export class OAuthEventCollector {
  private persisted = 0
  private failed = 0
  private inFlight = 0
  private lastFailureAt?: IsoDateTime
  /** Tracks background writes so tests can await quiescence deterministically. */
  private readonly pending = new Set<Promise<void>>()

  constructor(
    private readonly repository: OAuthAdminRepository = getOAuthAdminRepository(),
    private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor,
    private readonly maxAttempts: number = DEFAULT_MAX_ATTEMPTS
  ) {}

  /**
   * Build the safe {@link OAuthEvent} from the allowlisted input. Creates the
   * event id, resolves the pseudonymous network reference (discarding the raw
   * address), and applies the redactor as a defence-in-depth backstop. Pure —
   * no persistence — so it is unit/property testable in isolation.
   */
  buildEvent(ctx: OAuthDeploymentContext, input: OAuthEventInput): OAuthEvent {
    const timestamp = input.observedAt ?? new Date().toISOString()

    // Convert a raw network address (if any) to a pseudonym, then drop the raw
    // value. No branch of this method retains the raw address.
    let networkReference: PseudonymousNetworkReference | undefined
    if (input.rawNetworkAddress) {
      networkReference = this.redactor.pseudonymizeNetwork(ctx, input.rawNetworkAddress)
    }

    const event: OAuthEvent = {
      eventId: `evt_${randomUUID()}`,
      referenceId: input.referenceId,
      timestamp,
      deployment: ctx.environment,
      stage: input.stage,
      attemptState: input.attemptState ?? attemptStateForOutcome(input.outcome),
      outcome: input.outcome,
      httpStatus: input.httpStatus,
      errorCode: input.errorCode,
      errorCategory: input.errorCategory,
      durationMs: input.durationMs,
      // Pre-login references stay absent — never inferred (Requirement 4.4).
      clientReference: input.clientReference,
      resourceReference: input.resourceReference,
      subjectReference: input.subjectReference,
      correlationReference: input.correlationReference,
      diagnosticReference: input.diagnosticReference,
      quotaReference: input.quotaReference,
      releaseReference: input.releaseReference,
      networkReference
    }

    // Defence in depth: strip any denylisted field that slipped through, and
    // drop keys whose value is undefined so projections stay clean.
    return this.redactor.redact(pruneUndefined(event) as unknown as OAuthEvent)
  }

  /**
   * Observe a stage: build the safe event and schedule its persistence WITHOUT
   * awaiting. Returns the event id synchronously so a caller can correlate its
   * own logging, but the OAuth request continues immediately regardless of
   * whether the write ever succeeds (Requirements 2.3, 4.6).
   */
  collect(ctx: OAuthDeploymentContext, input: OAuthEventInput): OpaqueReference {
    let event: OAuthEvent
    try {
      event = this.buildEvent(ctx, input)
    } catch (error) {
      // Building the safe event must never throw into OAuth traffic. Record the
      // gap and return a synthetic id.
      this.recordFailure(error)
      return 'evt_unrecorded'
    }

    // Bound background work: if too many writes are already in flight, drop this
    // one into the failure metric rather than delaying OAuth traffic (4.6).
    if (this.inFlight >= MAX_IN_FLIGHT) {
      this.recordFailure(new Error('collector in-flight limit reached'))
      return event.eventId
    }

    this.inFlight += 1
    const task = this.persistWithRetry(ctx, event)
      .then(() => {
        this.persisted += 1
      })
      .catch((error) => {
        this.recordFailure(error)
      })
      .finally(() => {
        this.inFlight -= 1
        this.pending.delete(task)
      })
    this.pending.add(task)
    return event.eventId
  }

  /** Persist with a small bounded retry. Rejects only after attempts exhaust. */
  private async persistWithRetry(ctx: OAuthDeploymentContext, event: OAuthEvent): Promise<void> {
    let lastError: unknown
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        await this.repository.putEvent(ctx, event)
        return
      } catch (error) {
        lastError = error
        if (attempt < this.maxAttempts) {
          await delay(RETRY_BASE_DELAY_MS * attempt)
        }
      }
    }
    throw lastError instanceof Error ? lastError : new Error('event persistence failed')
  }

  /** Record a bounded failure metric (the visible collection-gap signal). */
  private recordFailure(error: unknown): void {
    this.failed += 1
    this.lastFailureAt = new Date().toISOString()
    const safe = this.redactor.safeError(error)
    // Warn (not error) — a telemetry gap is not an OAuth traffic failure. Never
    // logs the raw error object; only the safe code/message.
    logger.warn(`[oauth-admin] event collection gap: ${safe.code}`, { code: safe.code })
  }

  /** Current bounded failure/success metrics — surfaced as a collection-gap signal. */
  getMetrics(): OAuthCollectorMetrics {
    return {
      persisted: this.persisted,
      failed: this.failed,
      lastFailureAt: this.lastFailureAt,
      inFlight: this.inFlight
    }
  }

  /**
   * Await all currently scheduled background writes. Intended for tests and
   * graceful shutdown only; request paths never call this.
   */
  async flush(): Promise<void> {
    await Promise.allSettled([...this.pending])
  }
}

/** Remove keys whose value is `undefined` so persisted projections stay clean. */
function pruneUndefined(value: object): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) result[key] = entry
  }
  return result
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Shared collector instance for server request paths. Constructed lazily. */
let sharedCollector: OAuthEventCollector | undefined

/** Resolve the shared {@link OAuthEventCollector}. */
export function getOAuthEventCollector(): OAuthEventCollector {
  if (!sharedCollector) sharedCollector = new OAuthEventCollector()
  return sharedCollector
}
