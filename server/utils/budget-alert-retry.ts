/**
 * Budget Alert Retry Helpers
 *
 * Small, dependency-light utilities for retrying transient transport failures
 * when querying the budget alert DynamoDB table. Kept separate from the
 * notifier so the classification/backoff logic can be unit tested without
 * pulling in the AWS/DynamoDB stack.
 */

import { logger } from './logger'

// Socket-level error codes that represent transient transport failures which
// are safe to retry. Intentionally conservative — validation, authorization,
// and throttling errors are NOT included.
const TRANSIENT_ERROR_CODES = new Set(['ECONNRESET', 'ETIMEDOUT'])

// AWS SDK surfaces connection/read timeouts as an error with this name.
const TRANSIENT_ERROR_NAMES = new Set(['TimeoutError'])

export const DEFAULT_MAX_ATTEMPTS = 3
export const DEFAULT_BASE_DELAY_MS = 200

/**
 * Context describing the operation being retried. Values are stable and
 * low-cardinality so retry warnings are safe to index — no credentials or
 * user data.
 */
export interface RetryContext {
  component: string
  operation: string
  month?: string
}

export interface RetryOptions {
  maxAttempts?: number
  baseDelayMs?: number
  /** Injectable delay, primarily for tests to avoid real waits. */
  sleep?: (ms: number) => Promise<void>
}

/**
 * Determine whether an error represents a transient network/transport failure
 * that is safe to retry. Conservative by design: only known socket-level codes
 * (ECONNRESET, ETIMEDOUT) and the AWS SDK TimeoutError name qualify. Validation,
 * authorization, throttling, and arbitrary errors are treated as non-transient.
 */
export function isTransientTransportError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const code = (error as { code?: unknown }).code
  if (typeof code === 'string' && TRANSIENT_ERROR_CODES.has(code)) {
    return true
  }

  const name = (error as { name?: unknown }).name
  if (typeof name === 'string' && TRANSIENT_ERROR_NAMES.has(name)) {
    return true
  }

  return false
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise(resolve => setTimeout(resolve, ms))

/**
 * Run an async operation with a bounded retry for transient transport failures
 * only, using small exponential backoff. Non-transient errors are rethrown
 * immediately; the original error is preserved after retries are exhausted.
 */
export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  context: RetryContext,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS
  const baseDelayMs = options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS
  const sleep = options.sleep ?? defaultSleep

  let attempt = 0
  for (;;) {
    attempt++
    try {
      return await operation()
    } catch (error) {
      if (attempt >= maxAttempts || !isTransientTransportError(error)) {
        throw error
      }

      const err = error as { name?: string; code?: string }
      logger.warn('[BudgetAlertNotifier] Transient query failure; retrying', {
        component: context.component,
        operation: context.operation,
        event: 'transient_query_retry',
        attempt,
        maxAttempts,
        errorName: err?.name,
        errorCode: err?.code,
        month: context.month,
      })

      await sleep(baseDelayMs * 2 ** (attempt - 1))
    }
  }
}
