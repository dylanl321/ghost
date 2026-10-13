/**
 * OAuth Administration — server access service.
 *
 * Implements the single authorization gate every OAuth administration route
 * calls (design "Authorization, deployment binding, and capability gate"):
 *
 *   1. `requireAdmin(event)` — an authenticated browser session plus the
 *      existing Administrator gate (Requirement 1.1).
 *   2. `requireOAuthAdminCapability(event, capability)` — the per-route explicit
 *      capability check, resolved from the shared role definitions and failing
 *      CLOSED (Requirement 1.2, 1.3).
 *
 * The service also:
 *   - Resolves the deployment context SERVER-SIDE only, never from the caller
 *     (Requirement 1.5 / 2.2 / 18.1).
 *   - Derives a safe, opaque browser actor reference from the session so audit
 *     records never carry a raw email as the actor identifier (Requirement
 *     13.6). A display email is available separately via `getUserEmail` where a
 *     capability permits it.
 *   - Applies `Cache-Control: no-store` (Requirement 17.5).
 *   - Provides typed OAuth admin errors (unauthorized / forbidden / conflict /
 *     not-found) for later routes.
 *
 * SAFETY: There is no API/MCP bearer-token path into administration here — the
 * gate depends entirely on the browser session `requireAdmin` resolves. A
 * capability change, session expiry, or authorization failure surfaces as a
 * thrown typed error so the panel can discard restricted results and pending
 * actions; guessed IDs, cursors, or diagnostic references cannot bypass the
 * capability because every route re-runs this gate (Requirement 1.5).
 */

import { createHmac } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, setResponseHeader } from 'h3'
import type {
  OAuthCapability,
  OAuthDeploymentContext,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext } from './types'
import { OAUTH_CAPABILITIES } from './types'
import { resolveOAuthAdminDeploymentContext } from './deployment-context'
import { requireAdmin, getUserPermissions } from '../../../utils/user-roles'
import { getRequestStateKey } from '../../config'

/**
 * Domain-separation label for the browser actor pseudonym. Folding this fixed
 * label into the HMAC input keeps the actor reference from colliding with any
 * other use of the request-state key (network pseudonyms, cursor signatures).
 */
const ACTOR_PSEUDONYM_DOMAIN = 'ghost:oauth-admin:actor-reference:v1'

/** All OAuth capabilities, used to compute which ones the current actor holds. */
const ALL_OAUTH_CAPABILITIES: readonly OAuthCapability[] = Object.values(OAUTH_CAPABILITIES)

/** Safe, stable error codes surfaced to the browser (never leak internals). */
export type OAuthAdminErrorCode =
  | 'OAUTH_ADMIN_UNAUTHORIZED'
  | 'OAUTH_ADMIN_FORBIDDEN'
  | 'OAUTH_ADMIN_CONFLICT'
  | 'OAUTH_ADMIN_NOT_FOUND'
  | 'OAUTH_ADMIN_BAD_REQUEST'

interface OAuthAdminErrorInit {
  /** Optional safe, human-readable detail. Never include secrets or raw input. */
  message?: string
  /** Optional safe, non-secret context for the client (e.g. capability name). */
  data?: Record<string, unknown>
}

/**
 * Typed OAuth admin error factory. Produces an H3 error with a stable status
 * code and a safe `code` in `data` so routes and the panel can branch without
 * parsing free-text messages. Later routes reuse these for consistent 401/403/
 * 409/404 semantics.
 */
export const oauthAdminErrors = {
  /** 401 — no authenticated session / session expired. */
  unauthorized(init: OAuthAdminErrorInit = {}) {
    return createOAuthAdminError(401, 'OAUTH_ADMIN_UNAUTHORIZED', init.message || 'Authentication required', init.data)
  },
  /** 403 — authenticated but missing Administrator role or the capability. */
  forbidden(init: OAuthAdminErrorInit = {}) {
    return createOAuthAdminError(403, 'OAUTH_ADMIN_FORBIDDEN', init.message || 'Access denied', init.data)
  },
  /** 409 — optimistic-concurrency / idempotency conflict for later mutations. */
  conflict(init: OAuthAdminErrorInit = {}) {
    return createOAuthAdminError(409, 'OAUTH_ADMIN_CONFLICT', init.message || 'Conflicting concurrent change', init.data)
  },
  /** 404 — a referenced resource does not exist in this deployment. */
  notFound(init: OAuthAdminErrorInit = {}) {
    return createOAuthAdminError(404, 'OAUTH_ADMIN_NOT_FOUND', init.message || 'Not found', init.data)
  },
  /** 400 — a browser mutation is missing required, safe envelope fields. */
  badRequest(init: OAuthAdminErrorInit = {}) {
    return createOAuthAdminError(400, 'OAUTH_ADMIN_BAD_REQUEST', init.message || 'Invalid request', init.data)
  }
}

function createOAuthAdminError(
  statusCode: number,
  code: OAuthAdminErrorCode,
  message: string,
  data?: Record<string, unknown>
) {
  return createError({
    statusCode,
    statusMessage: message,
    message,
    data: { code, ...(data || {}) }
  })
}

/**
 * Derive a safe, opaque, deployment-scoped browser actor reference from the
 * session. Uses the most stable session subject available (`oid`/`sub`/`id`),
 * falling back to the email only when no stable subject exists. The raw value
 * is HMAC'd with a domain-separation label and the deployment id so the actor
 * reference is stable within a deployment, non-reversible, and never the raw
 * email itself (Requirement 13.6). A missing session yields no actor and the
 * caller must have already failed `requireAdmin`.
 */
function deriveActorReference(event: H3Event, ctx: OAuthDeploymentContext): OpaqueReference {
  const user = event.context.auth?.user as Record<string, any> | undefined
  const claims = (user?.claims || {}) as Record<string, any>
  const subject
    = user?.oid || user?.sub || user?.id
    || claims.oid || claims.sub || claims.id
    || user?.email || claims.email || claims.preferred_username
    || 'unknown-subject'

  const hmac = createHmac('sha256', getRequestStateKey())
  hmac.update(ACTOR_PSEUDONYM_DOMAIN)
  hmac.update('\u0000')
  hmac.update(ctx.deploymentId)
  hmac.update('\u0000')
  hmac.update(String(subject).trim().toLowerCase())
  return `act_${hmac.digest('base64url').slice(0, 20)}`
}

/**
 * Apply the administration response headers. Every administration response uses
 * `Cache-Control: no-store` so restricted data is not cached by the browser or
 * intermediaries (Requirement 17.5). Call this from each route/handler.
 */
export function applyOAuthAdminResponseHeaders(event: H3Event): void {
  setResponseHeader(event, 'Cache-Control', 'no-store')
}

/**
 * The single per-route gate. Requires an authenticated Administrator session
 * (`requireAdmin`) and then the explicit capability. Fails CLOSED: any resolution
 * failure or a missing capability throws a typed 403 rather than granting access.
 *
 * Returns the resolved {@link OAuthAdminAccessContext} (server-derived deployment,
 * opaque actor, and the capabilities the actor actually holds) so a route does
 * not re-resolve those separately. `Cache-Control: no-store` is applied here so
 * the header is present even on a denied response body.
 */
export async function requireOAuthAdminCapability(
  event: H3Event,
  capability: OAuthCapability
): Promise<OAuthAdminAccessContext> {
  // no-store first, so even error responses are non-cacheable.
  applyOAuthAdminResponseHeaders(event)

  // 1. Authenticated browser session + Administrator gate (Req 1.1). requireAdmin
  //    throws a 403 when the session is absent or the user is not an admin.
  await requireAdmin(event)

  // 2. Explicit per-route capability check (Req 1.2, 1.3). Fail closed.
  const permissions = await getUserPermissions(event)
  if (!permissions.has(capability)) {
    throw oauthAdminErrors.forbidden({
      message: 'Missing required OAuth administration capability',
      data: { capability }
    })
  }

  // 3. Server-derived deployment context — never from the caller (Req 2.2 / 18.1).
  const deployment = resolveOAuthAdminDeploymentContext()

  // 4. Safe, opaque actor reference for audit (Req 13.6).
  const actor = deriveActorReference(event, deployment)

  // The capabilities the actor actually holds, so a route can conditionally
  // expose identity-bearing detail (e.g. activity capability) without a second
  // resolution pass.
  const capabilities = ALL_OAUTH_CAPABILITIES.filter(cap => permissions.has(cap))

  return { deployment, actor, capabilities }
}

/**
 * The OAuth administration access service. A thin, testable object grouping the
 * gate, the header helper, the error factory, and a capability inspector. Routes
 * import {@link requireOAuthAdminCapability} directly; this object is provided
 * for the design's named `OAuthAdminAccessService` component and for callers
 * that prefer a single injected dependency.
 */
export const oauthAdminAccessService = {
  requireCapability: requireOAuthAdminCapability,
  applyResponseHeaders: applyOAuthAdminResponseHeaders,
  errors: oauthAdminErrors,
  /** True when a resolved access context holds the given capability. */
  hasCapability(context: OAuthAdminAccessContext, capability: OAuthCapability): boolean {
    return context.capabilities.includes(capability)
  }
} as const

export type OAuthAdminAccessService = typeof oauthAdminAccessService
