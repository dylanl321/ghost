/**
 * Error classification, user-friendly messages, and retry logic for cost data fetching.
 */

/** Returns true for errors that are likely transient and worth retrying. */
export function isTransientError(e: any): boolean {
  if (!e) return false

  // HTTP status codes
  const status = e?.status || e?.statusCode || e?.response?.status
  if (status === 429 || status === 503 || status === 504) return true

  // Network errors
  const message = String(e?.message || '').toLowerCase()
  if (message.includes('network') || message.includes('fetch failed') || message.includes('econnreset')) return true

  // AWS throttling
  if (message.includes('throttl') || message.includes('rate exceeded') || message.includes('too many requests')) return true

  return false
}

/** Map error codes/messages to user-facing strings. */
export function getUserFriendlyMessage(e: any): string {
  if (!e) return 'An unknown error occurred'

  const status = e?.status || e?.statusCode || e?.response?.status
  const message = String(e?.message || '').toLowerCase()

  if (status === 403 || message.includes('forbidden') || message.includes('permission')) {
    return 'You do not have permission to access this cost data. Please check your account access.'
  }
  if (status === 429 || message.includes('throttl') || message.includes('rate exceeded')) {
    return 'Too many requests — please wait a moment and try again.'
  }
  if (status === 503 || status === 504 || message.includes('service unavailable') || message.includes('gateway timeout')) {
    return 'The cost data service is temporarily unavailable. Please try again shortly.'
  }
  if (status >= 500) {
    return 'A server error occurred while fetching cost data. Please try again later.'
  }
  if (message.includes('network') || message.includes('fetch failed')) {
    return 'A network error occurred. Please check your connection and try again.'
  }
  if (message.includes('abort')) {
    return 'The request was cancelled.'
  }

  return e?.message || 'Failed to fetch cost data'
}

/**
 * Retry a function with linear backoff, only retrying on transient errors.
 *
 * @param fn        Async function to execute
 * @param options   maxRetries (default 2), baseDelayMs (default 1000)
 * @returns         The resolved value from fn
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options?: { maxRetries?: number; baseDelayMs?: number },
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2
  const baseDelayMs = options?.baseDelayMs ?? 1000

  let lastError: any
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (e: any) {
      lastError = e
      if (attempt < maxRetries && isTransientError(e)) {
        await new Promise((r) => setTimeout(r, baseDelayMs * (attempt + 1)))
        continue
      }
      throw e
    }
  }
  throw lastError
}

/**
 * Read the message out of an API error body. Routes answer either `{ error: 'text' }` or the
 * standard envelope `{ error: { code, message } }`; passing the envelope straight to
 * `new Error()` shows "[object Object]".
 */
export function apiErrorMessage(body: any, fallback: string): string {
  const error = body?.error
  if (typeof error === 'string' && error) return error
  if (typeof error?.message === 'string' && error.message) return error.message
  if (typeof body?.message === 'string' && body.message) return body.message
  return fallback
}
