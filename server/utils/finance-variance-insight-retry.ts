/**
 * Pure, dependency-free helpers for throttle-aware Cost Explorer retries.
 *
 * Kept in a standalone module (no h3 / AWS SDK / logger imports) so the retry
 * classifier and backoff math can be unit-tested in isolation. The stateful
 * send/retry orchestration that consumes these lives next to its CE call site in
 * finance-variance-insight.post.ts.
 */

export const CE_OPERATION = 'GetCostAndUsage'
export const CE_MAX_ATTEMPTS = 3 // total attempts per page (1 initial + up to 2 retries)
export const CE_BASE_DELAY_MS = 200
export const CE_MAX_DELAY_MS = 2000

/** Safe error-name extraction — never returns a raw Error/object. */
export function ceErrorName(err: unknown): string {
  if (err && typeof err === 'object' && typeof (err as { name?: unknown }).name === 'string') {
    return (err as { name: string }).name
  }
  return 'UnknownError'
}

/** Safe error-code extraction (AWS SDK sets `code` on some errors). */
export function ceErrorCode(err: unknown): string | undefined {
  if (err && typeof err === 'object' && typeof (err as { code?: unknown }).code === 'string') {
    return (err as { code: string }).code
  }
  return undefined
}

/**
 * True only for known Cost Explorer throttling / rate-limit errors. Matches on
 * error name, code, message, and HTTP 429 so LimitExceededException ("Too many
 * open requests"), ThrottlingException, and friends are retried — nothing else.
 */
export function isCeThrottleError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: unknown; code?: unknown; message?: unknown; $metadata?: { httpStatusCode?: number } }
  if (e.$metadata?.httpStatusCode === 429) return true
  const haystack = [e.name, e.code, e.message]
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase()
  const markers = [
    'limitexceededexception',
    'throttlingexception',
    'throttling',
    'toomanyrequestsexception',
    'requestlimitexceeded',
    'too many open requests',
    'rate exceeded',
    'rate limit',
  ]
  return markers.some(m => haystack.includes(m))
}

/**
 * Bounded exponential backoff with full jitter: a random delay in
 * [0, min(cap, base * 2^attempt)). `attempt` is 0-based (0 = first retry).
 * `rand` is injectable for deterministic tests.
 */
export function ceBackoffDelayMs(
  attempt: number,
  rand: () => number = Math.random,
  baseMs = CE_BASE_DELAY_MS,
  capMs = CE_MAX_DELAY_MS,
): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** attempt)
  return Math.floor(rand() * ceiling)
}
