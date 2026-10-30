/**
 * AWS SDK throttling, timeouts and network resets while looking up the token
 * or rate bucket. These say nothing about the caller's credentials, so clients
 * should retry rather than re-authenticate or give up.
 */
export function isTransientDependencyError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { $retryable?: unknown, $metadata?: { httpStatusCode?: number }, name?: string, code?: string }
  if (candidate.$retryable) return true
  const status = candidate.$metadata?.httpStatusCode
  if (typeof status === 'number' && (status === 429 || status >= 500)) return true
  return /Throttl|ProvisionedThroughputExceeded|RequestLimitExceeded|TimeoutError|ServiceUnavailable|InternalServerError/.test(candidate.name || '') ||
    ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'EPIPE'].includes(candidate.code || '')
}
