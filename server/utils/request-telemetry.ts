/**
 * Request correlation & structured error telemetry helpers.
 *
 * Pure functions shared by the request-timing middleware and the API
 * error handler so request-ID validation, path normalization, and
 * unhandled-error event shaping can be unit-tested without a running
 * Nuxt server.
 *
 * These helpers are deliberately conservative about what they emit:
 * no query strings, headers, credentials, user objects, or account
 * identifiers ever reach the structured output.
 */

// A client-supplied x-request-id must be a short, opaque token. Anything
// with unexpected characters or length is rejected so we never echo
// attacker-controlled data into logs or the response header.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,128}$/

export function isSafeRequestId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_REQUEST_ID.test(value)
}

// Normalize dynamic path segments for Log Insights grouping. Also strips
// any query string so it can never leak into structured output.
export function normalizePath(path: string): string {
  const [pathname = ''] = path.split('?')
  return pathname
    // Replace UUIDs (8-4-4-4-12 hex)
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:id')
    // Replace long hex strings (8+ chars)
    .replace(/\/[0-9a-f]{8,}/gi, '/:id')
    // Replace pure numeric segments
    .replace(/\/\d+/g, '/:num')
}

// Redact common credential and account identifiers that can find their
// way into an exception message. Deliberately conservative: it targets
// well-known, high-signal shapes (AWS account IDs, ARNs, access-key IDs,
// bearer tokens, secret/token/password assignments) while leaving the
// surrounding service/error prose intact so the summary stays useful.
export function redactSensitive(value: string): string {
  return (
    value
      // Authorization bearer tokens (JWTs and opaque tokens alike).
      .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
      // secret / token / password / api-key style assignments, e.g.
      //   password=hunter2   "apiKey": "abc"   client_secret: xyz
      .replace(
        /\b((?:secret|token|password|passwd|pwd|api[_-]?key|access[_-]?key|client[_-]?secret)s?["'\s]*[:=]["'\s]*)[^\s"',;]+/gi,
        '$1[REDACTED]',
      )
      // AWS access-key IDs: AKIA/ASIA followed by 16 base32-ish chars.
      .replace(/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, '[REDACTED_AWS_KEY]')
      // 12-digit AWS account IDs, standalone or as the ARN account field
      // (arn:aws:iam::123456789012:role/...).
      .replace(/\b\d{12}\b/g, '[REDACTED_ACCT]')
  )
}

// Clamp free-form error text and collapse control characters (including
// newlines/tabs) to single spaces so a rogue message can neither bloat
// the log line nor make it hard to read. Uses char codes rather than a
// control-character regex literal to keep the source ASCII-clean. Also
// redacts embedded credentials/account identifiers before bounding.
export function sanitizeErrorText(value: unknown, maxLength = 512): string {
  if (typeof value !== 'string') {
    return ''
  }

  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    out += code < 0x20 || code === 0x7f ? ' ' : ch
  }

  return redactSensitive(out).replace(/ {2,}/g, ' ').trim().slice(0, maxLength)
}

export interface ApiErrorEntryInput {
  requestId?: unknown
  method?: string
  path: string
  error: any
}

/**
 * Build a top-level structured error event for an unhandled API error.
 *
 * Intentionally excludes stack traces, credentials, headers, query
 * parameters, user IDs, and account IDs.
 */
export function buildApiErrorEntry(input: ApiErrorEntryInput): Record<string, unknown> {
  const { requestId, method, path, error } = input

  const entry: Record<string, unknown> = {
    type: 'api_error',
    level: 'error',
    timestamp: new Date().toISOString(),
    method,
    path: normalizePath(path ?? ''),
    errorName: sanitizeErrorText(error?.name, 128) || 'Error',
    errorMessage: sanitizeErrorText(error?.message),
  }

  if (isSafeRequestId(requestId)) {
    entry.requestId = requestId
  }

  // AWS SDK v3 surfaces the service request id under $metadata. Accept
  // either casing, but only when it is a safe bounded token.
  const awsRequestId = error?.$metadata?.requestId ?? error?.$metadata?.requestID
  if (isSafeRequestId(awsRequestId)) {
    entry.awsRequestId = awsRequestId
  }

  return entry
}
