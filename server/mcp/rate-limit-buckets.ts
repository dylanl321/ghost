import { createHash } from 'node:crypto'

/**
 * Pure, side-effect-free derivation of MCP rate-limit bucket/window math.
 *
 * This module is the single source of truth for how a rate-limit key maps to a
 * time window and to durable/local storage keys. Both the mutating rate
 * decision ({@link file://./rate-limit.ts checkMcpRateLimit}) and the future
 * read-only quota readers (OAuthQuotaService, task 4.2) call these helpers so
 * readers observe the exact same window semantics the limiter enforces, instead
 * of reinventing bucket math (Requirement 12.6).
 *
 * Nothing here performs I/O: no DynamoDB calls and no in-memory map mutation.
 */

/** Durable (DynamoDB) bucket derivation for a fixed rate-limit window. */
export interface DurableRateBucketKey {
  /** Epoch ms at the start of the current fixed window. */
  windowStart: number
  /** Epoch ms at which the current window resets (windowStart + windowMs). */
  resetAt: number
  /** ISO-8601 form of {@link resetAt}, as stored on the durable row. */
  resetAtIso: string
  /** First 32 hex chars of sha256(key); stable pseudonymous bucket reference. */
  keyHash: string
  /** DynamoDB partition key: `McpRateLimit#<keyHash>#<windowStart>`. */
  artifactId: string
  /** Durable row TTL in epoch seconds: floor(resetAt/1000) + windowSeconds. */
  ttl: number
}

/** Local (in-memory Map) bucket derivation for a rate-limit window. */
export interface LocalRateBucketKey {
  /** Map key: the raw rate-limit key (unhashed). */
  mapKey: string
  /** Epoch ms at which a fresh local window resets (now + windowSeconds*1000). */
  resetAt: number
}

/**
 * Derive the durable bucket identity for `key` at `now`.
 *
 * Fixed-window alignment: `windowStart = floor(now / windowMs) * windowMs`, so
 * every caller within the same window resolves to the same `artifactId`. This
 * must stay byte-for-byte compatible with the durable branch of
 * `checkMcpRateLimit`.
 */
export function deriveDurableRateBucketKey(
  key: string,
  windowSeconds: number,
  now: number
): DurableRateBucketKey {
  const windowMs = windowSeconds * 1000
  const windowStart = Math.floor(now / windowMs) * windowMs
  const resetAt = windowStart + windowMs
  const keyHash = createHash('sha256').update(key).digest('hex').slice(0, 32)
  return {
    windowStart,
    resetAt,
    resetAtIso: new Date(resetAt).toISOString(),
    keyHash,
    artifactId: `McpRateLimit#${keyHash}#${windowStart}`,
    ttl: Math.floor(resetAt / 1000) + windowSeconds
  }
}

/**
 * Derive the local (in-memory) bucket identity for `key` at `now`.
 *
 * A fresh local bucket resets `windowSeconds` after it is first observed, which
 * is a sliding start rather than the durable branch's aligned window. This must
 * stay compatible with the local branch of `checkMcpRateLimit`.
 */
export function deriveLocalRateBucketKey(
  key: string,
  windowSeconds: number,
  now: number
): LocalRateBucketKey {
  return {
    mapKey: key,
    resetAt: now + windowSeconds * 1000
  }
}

/**
 * Shared retry-after computation used by every branch and reader.
 *
 * Returns `0` while the observed count is within `limit`; otherwise the whole
 * number of seconds until `resetAt`, floored at `1` so an over-limit caller is
 * never told to retry immediately.
 */
export function computeRetryAfterSeconds(
  count: number,
  limit: number,
  resetAt: number,
  now: number
): number {
  if (count <= limit) return 0
  return Math.max(1, Math.ceil((resetAt - now) / 1000))
}
