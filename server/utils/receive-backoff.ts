/**
 * Pure, dependency-free backoff helper for retrying failed queue
 * receive loops. Exponential growth with full jitter and a hard cap,
 * so transient network blips (ECONNRESET/ETIMEDOUT) don't hammer the
 * upstream and bursts spread out instead of synchronizing.
 */

export interface ReceiveBackoffOptions {
  /** Delay used for the first retry attempt, in ms. */
  initialDelayMs?: number
  /** Upper bound on any single delay, in ms. */
  maxDelayMs?: number
  /** Injectable RNG (returns [0, 1)); defaults to Math.random. */
  random?: () => number
}

const DEFAULT_INITIAL_DELAY_MS = 250
const DEFAULT_MAX_DELAY_MS = 30_000

/**
 * Compute the delay before the given 1-based retry attempt.
 *
 * The exponential ceiling for an attempt is
 *   min(maxDelayMs, initialDelayMs * 2 ** (attempt - 1))
 * and the returned delay is uniformly jittered within [0, ceiling].
 * Callers reset their attempt counter after a successful receive.
 */
export function computeReceiveRetryDelay(
  attempt: number,
  options: ReceiveBackoffOptions = {}
): number {
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS
  const random = options.random ?? Math.random

  const safeAttempt = Math.max(1, Math.floor(attempt))
  const exponential = Math.min(maxDelayMs, initialDelayMs * 2 ** (safeAttempt - 1))

  // Full jitter: uniform in [0, exponential].
  const jittered = Math.floor(random() * (exponential + 1))
  return Math.min(maxDelayMs, Math.max(0, jittered))
}
