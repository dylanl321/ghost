/**
 * OAuth Administration — non-mutating quota observation service.
 *
 * Reads the registration rate-limit state that the MCP limiter enforces and
 * projects it as an allowlisted {@link OAuthQuotaObservation}, WITHOUT ever
 * changing quota usage. This is the read-only counterpart to
 * `server/mcp/rate-limit.ts` `checkMcpRateLimit`.
 *
 * SAFETY (Requirement 12.1, 12.2, 12.5, 12.6, 12.7):
 *   - A reader NEVER invokes the mutating rate-decision path. It never calls
 *     `checkMcpRateLimit`, never issues an `UpdateItem`/`ADD`/increment (not
 *     even a zero increment), and never mutates the local bucket map.
 *   - The durable reader shares bucket derivation with the limiter
 *     ({@link deriveDurableRateBucketKey}) and performs a plain `GetItem`
 *     against the derived `artifactId`. The local reader peeks the in-memory
 *     bucket via {@link peekLocalRateBucket} (a copy; no mutation).
 *   - The configured `limit` and `windowSeconds` are ALWAYS reported, even when
 *     usage counters cannot be read (Requirement 12.5). When usage is
 *     unavailable, usage fields are left null and coverage is `unavailable`.
 *   - Window expiry follows the ACTUAL backend window (`bucket.resetAt`), not
 *     asynchronous DynamoDB TTL deletion (Requirement 12.6): once
 *     `now >= resetAt` the current window is treated as empty (count 0,
 *     available = limit) regardless of whether the stored row/TTL still exists.
 *   - The `reference` is a deployment-scoped pseudonym. A network-source key is
 *     already hashed by the limiter (`bucket.keyHash`); a raw network address is
 *     pseudonymized through {@link OAuthAdminRedactor.pseudonymizeNetwork}. A
 *     raw address is never persisted or returned.
 *   - The deployment context is passed in by the server; a caller can never
 *     supply it.
 */

import type {
  OAuthDeploymentContext,
  OAuthQuotaObservation
} from '#shared/types/oauth-administration'
import type { OAuthAdminRedactor } from './types'
import { oauthAdminRedactor } from './redactor'
import { getItem } from '../../../utils/dynamodb'
import { getOAuthTableConfig, useDurableOAuthStore } from '../../config'
import {
  deriveDurableRateBucketKey,
  type DurableRateBucketKey
} from '../../rate-limit-buckets'
import { peekLocalRateBucket } from '../../rate-limit'

/**
 * Fixed notice surfaced with every quota observation (Requirement 12.4): the
 * limiter counts rejected attempts toward the window, and a shared corporate
 * egress address can aggregate multiple distinct clients into one bucket.
 */
const REJECTED_ATTEMPT_NOTICE =
  'Rejected registration attempts currently count toward this limit, and clients behind a shared corporate egress address may be aggregated into a single bucket.'

/**
 * Describes a quota key to observe. The caller supplies the raw limiter key and
 * the effective limit/window; whether the raw key is a network address governs
 * how the pseudonymous reference is derived.
 */
export interface QuotaObservationRequest {
  /** The raw rate-limit key exactly as the limiter would use it. */
  key: string
  /** Configured effective request limit for the window. */
  limit: number
  /** Configured window length in seconds. */
  windowSeconds: number
  /**
   * Raw network address behind this key, when the key represents a network
   * boundary. Used only to derive a pseudonymous reference; never persisted or
   * returned. Omit for non-network keys.
   */
  rawNetworkAddress?: string
  /** Safe human-readable source label (e.g. `dynamic-registration`). */
  source: string
}

/**
 * Read-only quota observer. Every method is non-mutating; the service performs
 * no rate decision and no counter increment.
 */
export class OAuthQuotaService {
  constructor(private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor) {}

  /**
   * Observe the quota for `request` using the durable (DynamoDB) reader when a
   * durable store is configured, otherwise the local in-memory reader. Both
   * paths are read-only.
   */
  async observe(
    ctx: OAuthDeploymentContext,
    request: QuotaObservationRequest,
    now: number = Date.now()
  ): Promise<OAuthQuotaObservation> {
    return useDurableOAuthStore()
      ? this.observeDurable(ctx, request, now)
      : this.observeLocal(ctx, request, now)
  }

  /**
   * Durable reader: derive the bucket, then a plain `GetItem` on the derived
   * `artifactId`. NEVER calls `checkMcpRateLimit` and NEVER issues an
   * `UpdateItem`/`ADD`/increment.
   */
  async observeDurable(
    ctx: OAuthDeploymentContext,
    request: QuotaObservationRequest,
    now: number = Date.now()
  ): Promise<OAuthQuotaObservation> {
    const bucket = deriveDurableRateBucketKey(request.key, request.windowSeconds, now)
    const reference = this.deriveReference(ctx, request, bucket)

    // Window already expired: the current window is empty regardless of whether
    // the durable row (or its TTL) still exists (Requirement 12.6). No read is
    // needed — the bucket math is authoritative.
    if (now >= bucket.resetAt) {
      return this.buildExpiredWindow(request, reference, 'durable', bucket.resetAt)
    }

    const config = getOAuthTableConfig()
    let row: Record<string, unknown> | null
    try {
      row = await getItem(
        config.tableName,
        { artifactId: bucket.artifactId },
        config.environment,
        config.accountId
      )
    } catch {
      // Counters could not be read: preserve the configured limit but report
      // usage as unavailable (Requirement 12.5).
      return this.buildUnavailable(request, reference, 'durable')
    }

    if (!row || typeof row.count !== 'number') {
      // No durable row within an active window means zero usage — but only after
      // an authoritative read (design "OAuthQuotaService" invariant).
      return this.buildActiveWindow(request, reference, 'durable', 0, bucket.resetAt)
    }

    return this.buildActiveWindow(request, reference, 'durable', row.count, bucket.resetAt)
  }

  /**
   * Local reader: peek the in-memory bucket (a copy) without mutation. NEVER
   * calls `checkMcpRateLimit` and never touches the underlying map.
   */
  observeLocal(
    ctx: OAuthDeploymentContext,
    request: QuotaObservationRequest,
    now: number = Date.now()
  ): OAuthQuotaObservation {
    // Reuse durable derivation only for the pseudonymous reference hash; local
    // buckets are keyed by the raw key and have sliding windows.
    const bucket = deriveDurableRateBucketKey(request.key, request.windowSeconds, now)
    const reference = this.deriveReference(ctx, request, bucket)

    const peeked = peekLocalRateBucket(request.key)

    // No bucket yet, or the observed window has already elapsed: treat as an
    // empty current window (Requirement 12.6) rather than reading TTL state.
    if (!peeked || now >= peeked.resetAt) {
      const resetAt = peeked && now < peeked.resetAt ? peeked.resetAt : now + request.windowSeconds * 1000
      return this.buildActiveWindow(request, reference, 'local', 0, resetAt)
    }

    return this.buildActiveWindow(request, reference, 'local', peeked.count, peeked.resetAt)
  }

  /**
   * Derive a deployment-scoped pseudonymous reference. A raw network address is
   * pseudonymized through the redactor; otherwise the already-hashed
   * `bucket.keyHash` is used (prefixed and sliced for readability). A raw
   * address is never returned.
   */
  private deriveReference(
    ctx: OAuthDeploymentContext,
    request: QuotaObservationRequest,
    bucket: DurableRateBucketKey
  ): string {
    if (request.rawNetworkAddress) {
      return this.redactor.pseudonymizeNetwork(ctx, request.rawNetworkAddress)
    }
    return `quota_${bucket.keyHash.slice(0, 20)}`
  }

  /** Build an observation for an authoritative, active-window count. */
  private buildActiveWindow(
    request: QuotaObservationRequest,
    reference: string,
    keyType: OAuthQuotaObservation['keyType'],
    count: number,
    resetAt: number
  ): OAuthQuotaObservation {
    const remaining = Math.max(0, request.limit - count)
    return {
      reference,
      keyType,
      limit: request.limit,
      windowSeconds: request.windowSeconds,
      available: remaining,
      count,
      remaining,
      resetAt: new Date(resetAt).toISOString(),
      source: request.source,
      collectedAt: new Date().toISOString(),
      coverage: 'complete',
      rejectedAttemptNotice: REJECTED_ATTEMPT_NOTICE
    }
  }

  /**
   * Build an observation for an expired window: the current window is empty, so
   * count is 0 and the full limit is available (Requirement 12.6).
   */
  private buildExpiredWindow(
    request: QuotaObservationRequest,
    reference: string,
    keyType: OAuthQuotaObservation['keyType'],
    expiredResetAt: number
  ): OAuthQuotaObservation {
    // Roll the reset forward to the next aligned window boundary from the
    // expired one so the panel shows a future reset for the empty window.
    const windowMs = request.windowSeconds * 1000
    const nextResetAt = expiredResetAt + windowMs
    return this.buildActiveWindow(request, reference, keyType, 0, nextResetAt)
  }

  /**
   * Build an observation when counters cannot be read. The configured limit and
   * window are preserved; usage fields are null and coverage is `unavailable`
   * (Requirement 12.5).
   */
  private buildUnavailable(
    request: QuotaObservationRequest,
    reference: string,
    keyType: OAuthQuotaObservation['keyType']
  ): OAuthQuotaObservation {
    return {
      reference,
      keyType,
      limit: request.limit,
      windowSeconds: request.windowSeconds,
      available: null,
      count: null,
      remaining: null,
      resetAt: null,
      source: request.source,
      collectedAt: new Date().toISOString(),
      coverage: 'unavailable',
      rejectedAttemptNotice: REJECTED_ATTEMPT_NOTICE
    }
  }
}

/** Shared singleton quota service for server read paths. */
export const oauthQuotaService = new OAuthQuotaService()
