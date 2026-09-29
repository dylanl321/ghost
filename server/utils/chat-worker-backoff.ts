/**
 * Capped exponential backoff for the chat worker receive loop.
 *
 * When SQS receive calls fail repeatedly (transient dependency outages such as
 * ECONNRESET/ETIMEDOUT), the loop should back off instead of hammering the
 * endpoint every 2 seconds. The delay doubles per consecutive failure from a
 * base of 2s up to a 60s cap. The consecutive-failure counter is reset by the
 * caller after any successful receive (including an empty receive).
 */

export const RECEIVE_BACKOFF_BASE_MS = 2000
export const RECEIVE_BACKOFF_CAP_MS = 60000

/**
 * Compute the retry delay for the Nth consecutive receive failure.
 *
 * @param consecutiveFailures Number of consecutive failures including the current
 *   one (i.e. the first failure is 1). Values < 1 are treated as 1.
 * @returns Delay in milliseconds, capped at {@link RECEIVE_BACKOFF_CAP_MS}.
 */
export function computeReceiveBackoffMs(
  consecutiveFailures: number,
  baseMs: number = RECEIVE_BACKOFF_BASE_MS,
  capMs: number = RECEIVE_BACKOFF_CAP_MS,
): number {
  const exponent = Math.max(0, Math.floor(consecutiveFailures) - 1)
  const uncapped = baseMs * 2 ** exponent
  return Math.min(capMs, uncapped)
}
