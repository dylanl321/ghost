/**
 * Request Context Helpers
 *
 * Small, pure helpers for correlating log lines and API responses:
 * - resolveRequestId: derive a safe request ID from an inbound header or a UUID
 * - extractAuthActor: pull a low-risk auth correlation (authType + actor id)
 *
 * Kept dependency-free and side-effect-free so they are trivial to unit test.
 */

// Bounded, safe charset for an inbound x-request-id. Anything outside this
// (control chars, newlines, oversized values) is rejected to prevent log
// injection and unbounded-cardinality abuse; we generate a UUID instead.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/
const REQUEST_ID_MAX_LENGTH = 128

/**
 * Return a trusted request ID.
 *
 * Accepts a single inbound header value only if it is a bounded, safe token;
 * otherwise generates a fresh UUID. Never throws.
 */
export function resolveRequestId(inbound: string | string[] | undefined | null): string {
  // Header may arrive as string[] when duplicated; only trust a single value.
  const candidate = Array.isArray(inbound) ? undefined : inbound

  if (
    typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(candidate)
  ) {
    return candidate
  }

  return crypto.randomUUID()
}

interface AuthLike {
  isAuthenticated?: boolean
  authType?: string
  apiKeyId?: string
  user?: {
    id?: string
    email?: string
    claims?: Record<string, unknown>
  }
}

export interface AuthCorrelation {
  authType: string
  actor?: string
}

/**
 * Extract a low-risk auth correlation for logs.
 *
 * Returns only the auth type and a single stable actor identifier
 * (OIDC id/oid/sub/email, or apiKeyId). Never returns tokens, headers,
 * display names, or the full auth object.
 */
export function extractAuthActor(auth: AuthLike | undefined | null): AuthCorrelation | undefined {
  if (!auth || !auth.isAuthenticated || !auth.authType) {
    return undefined
  }

  const correlation: AuthCorrelation = { authType: auth.authType }

  if (auth.authType === 'apikey') {
    if (auth.apiKeyId) {
      correlation.actor = auth.apiKeyId
    }
    return correlation
  }

  // oidc / dev: prefer stable identifiers over anything human-facing
  const user = auth.user || {}
  const claims = user.claims || {}
  const actor =
    user.id ||
    (typeof claims.oid === 'string' ? claims.oid : undefined) ||
    (typeof claims.sub === 'string' ? claims.sub : undefined) ||
    user.email ||
    (typeof claims.email === 'string' ? claims.email : undefined)

  if (actor) {
    correlation.actor = actor
  }

  return correlation
}
