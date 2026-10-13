/**
 * OAuth Administration — browser mutation parsing.
 *
 * Every browser mutation route (tasks 7.2/8.x/9.x/11.x) begins by calling
 * {@link parseBrowserMutation}, which enforces the session-integrity gate the
 * design requires before any provider effect (design "Authorization,
 * deployment binding, and capability gate" CSRF paragraph; Requirements 1.4,
 * 13.6, 17.6):
 *
 *   1. Same-origin validation of the request against the deployment host.
 *   2. Session-bound CSRF verification of the `X-CSRF-Token` header.
 *   3. Extraction of the safe {@link OAuthMutationEnvelope} fields
 *      (`csrfToken`, `idempotencyKey`, `reason`) plus the optional
 *      `expectedRevision` where an edit supplies one.
 *
 * A CSRF or same-origin failure is a `forbidden` (403); a missing/invalid
 * envelope field is a `badRequest` (400). The raw CSRF token is a session
 * secret — it is never returned in the parsed context beyond the header value
 * needed to verify it, and it is never logged or audited (design).
 */

import type { H3Event } from 'h3'
import { getRequestHeader, readBody } from 'h3'
import type { OAuthMutationEnvelope } from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext } from './types'
import { oauthAdminErrors } from './access-service'
import { verifyCsrfToken, validateSameOrigin } from './csrf'

/** Header the panel echoes the session-bound CSRF token in. */
export const CSRF_HEADER = 'x-csrf-token'

/** Maximum accepted length for a free-text reason (bounds abuse/storage). */
const MAX_REASON_LENGTH = 500
/** Maximum accepted length for an idempotency key. */
const MAX_IDEMPOTENCY_KEY_LENGTH = 200

/**
 * The parsed, verified context for a browser mutation. Carries the resolved
 * access context, the validated envelope, and the raw request body (for the
 * per-operation input the caller normalizes next). The CSRF token is retained
 * only within the envelope for completeness; callers must never log it.
 */
export interface ParsedBrowserMutation<TBody = Record<string, unknown>> {
  access: OAuthAdminAccessContext
  envelope: OAuthMutationEnvelope
  /** Optimistic-concurrency revision when the request supplied one. */
  expectedRevision?: string
  /** The raw parsed body for the caller's action-specific normalization. */
  body: TBody
}

function requireString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') {
    throw oauthAdminErrors.badRequest({ message: `Missing required field: ${field}`, data: { field } })
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw oauthAdminErrors.badRequest({ message: `Field must not be empty: ${field}`, data: { field } })
  }
  if (trimmed.length > maxLength) {
    throw oauthAdminErrors.badRequest({ message: `Field is too long: ${field}`, data: { field } })
  }
  return trimmed
}

/**
 * Parse and verify a browser mutation. `body` may be supplied (already read) so
 * a caller that needs the raw body once can avoid a second read; otherwise the
 * body is read here.
 *
 * SAFETY: CSRF verification uses the `X-CSRF-Token` HEADER, not the body field,
 * as the authoritative value (a header cannot be set cross-origin without an
 * explicit fetch, which same-origin already gates). The body `csrfToken`, if
 * present, must equal the header so the panel's envelope stays self-consistent.
 */
export async function parseBrowserMutation<TBody extends Record<string, unknown> = Record<string, unknown>>(
  event: H3Event,
  access: OAuthAdminAccessContext,
  body?: TBody
): Promise<ParsedBrowserMutation<TBody>> {
  // 1. Same-origin first — a cross-origin request never reaches CSRF checks.
  if (!validateSameOrigin(event)) {
    throw oauthAdminErrors.forbidden({
      message: 'Request origin is not permitted',
      data: { reason: 'ORIGIN_REJECTED' }
    })
  }

  // 2. Session-bound CSRF verification against the header value.
  const headerToken = getRequestHeader(event, CSRF_HEADER)
  if (!verifyCsrfToken(event, headerToken)) {
    throw oauthAdminErrors.forbidden({
      message: 'Invalid or missing CSRF token',
      data: { reason: 'CSRF_REJECTED' }
    })
  }

  // 3. Extract and validate the safe envelope fields.
  const parsedBody = (body ?? (await readBody<TBody>(event)) ?? ({} as TBody)) as TBody
  const record = parsedBody as Record<string, unknown>

  // The body csrfToken (when present) must match the verified header token so
  // the envelope is internally consistent; the header remains authoritative.
  if (typeof record.csrfToken === 'string' && record.csrfToken !== headerToken) {
    throw oauthAdminErrors.forbidden({
      message: 'CSRF token mismatch between header and body',
      data: { reason: 'CSRF_REJECTED' }
    })
  }

  const idempotencyKey = requireString(record.idempotencyKey, 'idempotencyKey', MAX_IDEMPOTENCY_KEY_LENGTH)
  const reason = requireString(record.reason, 'reason', MAX_REASON_LENGTH)

  const envelope: OAuthMutationEnvelope = {
    // The verified header token is the authoritative CSRF value.
    csrfToken: headerToken as string,
    idempotencyKey,
    reason
  }

  // `expectedRevision` is optional at this layer; edits enforce its presence in
  // their own normalization. When supplied it must be a non-empty string.
  let expectedRevision: string | undefined
  if (record.expectedRevision !== undefined && record.expectedRevision !== null) {
    expectedRevision = requireString(record.expectedRevision, 'expectedRevision', 200)
  }

  return { access, envelope, expectedRevision, body: parsedBody }
}
