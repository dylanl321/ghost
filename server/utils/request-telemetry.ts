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
    // Replace common AWS resource IDs to avoid per-resource metric cardinality
    // and leaking infrastructure identifiers into route/error telemetry.
    .replace(/\/(?:i|vol|snap|eni|subnet|sg)-[0-9a-f]{8,17}/gi, '/:awsResourceId')
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

export interface AuthFailureEntryInput {
  requestId?: unknown
  method?: string
  path: string
  // A low-cardinality, caller-supplied reason (e.g. "missing_or_invalid_credentials").
  // Never a raw error message, so the metric stays groupable and leak-free.
  reason?: string
}

/**
 * Build a structured authentication-failure event compatible with the
 * existing `{ $.type = "auth" && $.status = "failure" }` metric filter.
 *
 * Emitted at `warn` level because an unauthenticated client request is an
 * expected rejection, not an application error. Intentionally excludes
 * headers, API keys, query strings, user objects, account IDs, and concrete
 * resource IDs — the path is normalized so dynamic segments (e.g. EC2
 * instance IDs) never reach the record.
 */
export function buildAuthFailureEntry(input: AuthFailureEntryInput): Record<string, unknown> {
  const { requestId, method, path, reason } = input

  const entry: Record<string, unknown> = {
    type: 'auth',
    status: 'failure',
    level: 'warn',
    timestamp: new Date().toISOString(),
    method: sanitizeErrorText(method, 16) || undefined,
    path: normalizePath(path ?? ''),
    reason: sanitizeErrorText(reason, 64) || 'missing_or_invalid_credentials',
  }

  if (isSafeRequestId(requestId)) {
    entry.requestId = requestId
  }

  return entry
}

// Map a 4xx status code to a stable, low-cardinality reason slug so client
// rejections collapse into a handful of groupable rows instead of echoing
// free-form error prose into the metric.
function clientRejectionReason(statusCode?: number): string {
  switch (statusCode) {
    case 400: return 'bad_request'
    case 401: return 'unauthorized'
    case 403: return 'forbidden'
    case 404: return 'not_found'
    case 409: return 'conflict'
    case 422: return 'unprocessable_entity'
    case 429: return 'rate_limited'
    default: return 'client_error'
  }
}

export interface RequestErrorEntryInput {
  requestId?: unknown
  method?: string
  path: string
  statusCode?: number
  error: any
}

/**
 * Build a structured record for an API request that ended in an error hook.
 *
 * Classifies expected client rejections (4xx) separately from genuine server
 * failures so normal 401/403/404 responses do not masquerade as error-level
 * application failures:
 *
 *   - 4xx           -> type="request_rejection", level="warn" (stays queryable
 *                      as a warning, carries a low-cardinality reason)
 *   - >=500 / other -> type="request_error",     level="error" (sanitized
 *                      errorName/errorMessage, remains error-level)
 *
 * The path is normalized (dynamic resource IDs removed) and all free-form text
 * is sanitized so credentials and account IDs can never reach the record.
 */
export function buildRequestErrorEntry(input: RequestErrorEntryInput): Record<string, unknown> {
  const { requestId, method, path, statusCode, error } = input
  const isClientRejection = typeof statusCode === 'number' && statusCode >= 400 && statusCode < 500

  const entry: Record<string, unknown> = isClientRejection
    ? {
        type: 'request_rejection',
        level: 'warn',
        timestamp: new Date().toISOString(),
        method: sanitizeErrorText(method, 16) || undefined,
        path: normalizePath(path ?? ''),
        statusCode,
        reason: clientRejectionReason(statusCode),
      }
    : {
        type: 'request_error',
        level: 'error',
        timestamp: new Date().toISOString(),
        method: sanitizeErrorText(method, 16) || undefined,
        path: normalizePath(path ?? ''),
        statusCode,
        errorName: sanitizeErrorText(error?.name, 128) || 'Error',
        errorMessage: sanitizeErrorText(error?.message),
      }

  if (isSafeRequestId(requestId)) {
    entry.requestId = requestId
  }

  return entry
}
