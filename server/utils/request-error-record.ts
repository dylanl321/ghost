/**
 * Builder for the structured request-outcome log record emitted on the Nitro
 * `error` hook.
 *
 * Kept dependency-free (no h3/Nitro imports) so it can be unit tested in
 * isolation. The caller resolves the event-dependent inputs (requestId,
 * method, normalized path, status code, error fields) and this module decides
 * how to classify and serialize them.
 *
 * Classification rule:
 *   - A trustworthy HTTP 4xx status code is an expected client/auth rejection
 *     (401/403/404/422/…). These are emitted as `request_rejection` and MUST
 *     NOT carry exception-class or stack fields, so routine session polling
 *     (e.g. unauthenticated 401s) does not falsely match a `/Error/` query.
 *   - Every other status, including 5xx and missing/invalid status codes, is
 *     treated as a true server error: emitted as `request_error` with error
 *     name and a bounded stack for diagnosis.
 */

import { boundedLogField } from './log-sanitize'

// Caps for bounded fields. The stack trace gets a generous cap so it stays
// useful for diagnosis while still being length-bounded and injection-safe.
const MAX_REQUEST_ID_LENGTH = 128
const MAX_METHOD_LENGTH = 16
const MAX_PATH_LENGTH = 256
const MAX_MESSAGE_LENGTH = 512
const MAX_ERROR_NAME_LENGTH = 128
const MAX_STACK_LENGTH = 2048

export interface RequestErrorRecordInput {
  requestId?: unknown
  method?: unknown
  pathname: string
  statusCode: number | undefined
  errorName?: unknown
  errorMessage?: unknown
  errorStack?: unknown
}

/**
 * Return true when the outcome is a true server error that should be observable
 * as `request_error`: only a valid integer HTTP 4xx proves the hook observed a
 * client-side rejection. In particular, a response object's default 200 must
 * not hide an untyped exception as a rejection.
 */
export function isServerError(statusCode: number | undefined): boolean {
  const isClientError = typeof statusCode === 'number'
    && Number.isInteger(statusCode)
    && statusCode >= 400
    && statusCode < 500
  return !isClientError
}

/**
 * Build the single, bounded, log-injection-safe JSON record for a request
 * outcome. Every string field is passed through boundedLogField so control
 * characters (forged newlines) are stripped and length is capped, keeping the
 * record a single bounded JSON line. Only safe, non-PII fields are included.
 */
export function buildRequestErrorRecord(
  input: RequestErrorRecordInput,
): Record<string, unknown> {
  const serverError = isServerError(input.statusCode)

  const entry: Record<string, unknown> = {
    // Expected client/auth rejections are classified distinctly so the error
    // query no longer treats normal 4xx responses as application failures.
    type: serverError ? 'request_error' : 'request_rejection',
    timestamp: new Date().toISOString(),
    requestId: boundedLogField(input.requestId, MAX_REQUEST_ID_LENGTH),
    method: boundedLogField(input.method, MAX_METHOD_LENGTH),
    path: boundedLogField(input.pathname, MAX_PATH_LENGTH),
    statusCode: input.statusCode,
    errorMessage: boundedLogField(input.errorMessage, MAX_MESSAGE_LENGTH),
  }

  if (serverError) {
    // Exception-class and stack detail belong only on true server-error
    // records. Omitting them for rejections keeps H3Error (and similar
    // framework classes) out of the normal-polling log lines.
    entry.errorName = boundedLogField(input.errorName, MAX_ERROR_NAME_LENGTH)
    entry.errorStack = boundedLogField(input.errorStack, MAX_STACK_LENGTH)
  }

  return entry
}
