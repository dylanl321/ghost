/**
 * OAuth managed lifecycle gate for the provider authorization/token boundaries
 * (task 8.2).
 *
 * This gate runs INSIDE {@link handleOAuthProviderRequest} for `/oauth/authorize`
 * and `/oauth/token`, BEFORE delegating to `oidc-provider`. It resolves the
 * request's client, reads its managed policy, and — for a MANAGED client only —
 * enforces the design lifecycle matrix (block/retire deny new authorization and
 * code exchange; retire additionally denies refresh) and the approved
 * resource/scope policy at authorization (Req 7.3, 7.4, 7.7, 7.8, 9.2, 13.2,
 * 18.2).
 *
 * CRITICAL — UNMANAGED CLIENTS ARE UNCHANGED (Req 7.7, 18.2, 18.3):
 *   For a client with no managed-policy extension, {@link readManagedPolicy}
 *   returns `null`, {@link evaluateBoundary} returns ALLOW, and this gate is a
 *   pure pass-through. It never changes headers, body, timing, or behavior for
 *   an unmanaged client. The gate also fails OPEN on any of its own internal
 *   errors (e.g. a client that cannot be resolved) so it can never break the
 *   existing OAuth flow — it only ever DENIES a positively-identified managed
 *   client under an enforcing policy.
 *
 * BODY HANDLING: the token endpoint reads its parameters from the form body,
 * which `oidc-provider` consumes from the raw Node request stream. To read
 * `client_id`/`grant_type` without stealing that stream, this gate buffers the
 * raw body once and REPLAYS it as a fresh readable stream on `event.node.req`
 * so the provider still receives the exact bytes. The authorization endpoint
 * reads its parameters from the query string, so no body handling is needed.
 */

import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { H3Event } from 'h3'
import type Provider from 'oidc-provider'
import { logger } from '../../utils/logger'
import { getOAuthProvider } from './provider'
import { readManagedPolicy, type ManagedPolicyExtension } from './admin/managed-policy-service'
import {
  evaluateBoundary,
  isGrantRevoked,
  type LifecycleBoundary,
  type LifecycleDecision
} from './admin/lifecycle-enforcement'
import { getOAuthStageInstrumentation } from './admin/stage-instrumentation'

/** The provider boundaries this gate guards. */
export type GatedBoundary = 'authorize' | 'token'

/** Max token-endpoint form body this gate will buffer (defensive bound). */
const MAX_TOKEN_BODY_BYTES = 64 * 1024

interface ParsedRequest {
  clientId?: string
  grantType?: string
  resource?: string
  scopes?: string[]
  /** The opaque refresh token value (token endpoint, refresh grant only). */
  refreshToken?: string
}

/** Parse a single or first value from a URLSearchParams-like getter. */
function firstScopeList(scope: string | null): string[] {
  return String(scope || '').split(/\s+/).filter(Boolean)
}

/**
 * Read the client/resource/scope references from an authorization GET/POST query
 * string. The authorization endpoint carries these in the URL query.
 */
function parseAuthorizeRequest(event: H3Event): ParsedRequest {
  const url = event.node.req.url || ''
  const queryIndex = url.indexOf('?')
  const search = queryIndex >= 0 ? url.slice(queryIndex + 1) : ''
  const params = new URLSearchParams(search)
  return {
    clientId: params.get('client_id') || undefined,
    resource: params.get('resource') || undefined,
    scopes: firstScopeList(params.get('scope'))
  }
}

/**
 * Buffer the token-endpoint raw body (once), parse the form fields, and REPLAY
 * the bytes as a fresh request stream so the provider reads the same body. On
 * any failure the original request is left untouched and no fields are parsed
 * (the gate then fails open).
 */
async function parseTokenRequestAndRestore(event: H3Event): Promise<ParsedRequest> {
  const req = event.node.req
  const chunks: Buffer[] = []
  let total = 0
  try {
    for await (const chunk of req) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > MAX_TOKEN_BODY_BYTES) {
        // Too large to safely buffer; replay what we have and skip parsing so
        // the provider still enforces its own limits. Fail open.
        replayBody(event, Buffer.concat(chunks))
        return {}
      }
      chunks.push(buf)
    }
  } catch {
    // Could not read the stream; nothing consumed reliably. Fail open.
    return {}
  }
  const body = Buffer.concat(chunks)
  replayBody(event, body)

  const contentType = String(req.headers['content-type'] || '')
  if (!contentType.includes('application/x-www-form-urlencoded')) return {}
  const params = new URLSearchParams(body.toString('utf8'))
  return {
    clientId: params.get('client_id') || undefined,
    grantType: params.get('grant_type') || undefined,
    resource: params.get('resource') || undefined,
    scopes: firstScopeList(params.get('scope')),
    refreshToken: params.get('refresh_token') || undefined
  }
}

/**
 * Replace `event.node.req` body stream with a fresh readable carrying `body`,
 * preserving the original request's headers/method/url/socket so the provider's
 * Koa/HTTP handling sees an identical request.
 */
function replayBody(event: H3Event, body: Buffer): void {
  const original = event.node.req
  const replay = Readable.from(body) as unknown as IncomingMessage
  // Copy the HTTP request surface the provider relies on.
  replay.headers = original.headers
  replay.method = original.method
  replay.url = original.url
  replay.httpVersion = original.httpVersion
  Object.defineProperty(replay, 'socket', { value: original.socket, configurable: true })
  event.node.req = replay
}

/** Resolve the managed policy for a client id via the provider (request-safe). */
async function resolveManagedPolicy(
  provider: Provider,
  clientId: string
): Promise<ManagedPolicyExtension | null> {
  // provider.Client.find returns the client whose metadata() includes the
  // ghost_managed_policy extension when present. An unknown client resolves to
  // undefined and is treated as unmanaged (the provider will reject it later).
  const client = await provider.Client.find(clientId)
  if (!client) return null
  const metadata = client.metadata() as Record<string, unknown>
  return readManagedPolicy(metadata)
}

/**
 * Map the parsed request to the enforcement boundary. The token endpoint is
 * `refresh` when `grant_type=refresh_token`, otherwise `exchange` (code
 * exchange). The authorization endpoint is always `authorize`.
 */
function boundaryFor(gated: GatedBoundary, parsed: ParsedRequest): LifecycleBoundary {
  if (gated === 'authorize') return 'authorize'
  return parsed.grantType === 'refresh_token' ? 'refresh' : 'exchange'
}

/**
 * Send a spec-shaped OAuth error response and mark the H3 response handled so
 * the provider is NOT invoked. Uses `invalid_request` with a safe description;
 * no secret or raw input is echoed. The stage failure is recorded fire-and-
 * forget for the administration timeline.
 */
function denyRequest(
  event: H3Event,
  boundary: LifecycleBoundary,
  clientId: string,
  decision: LifecycleDecision
): void {
  const res = event.node.res
  const stage = boundary === 'refresh'
    ? 'refresh'
    : boundary === 'authorize'
      ? 'authorization'
      : 'token-exchange'
  getOAuthStageInstrumentation().record({
    stage,
    outcome: 'failure',
    httpStatus: 400,
    errorCode: decision.reason || 'managed_policy_denied',
    clientReference: clientId
  })
  const payload = JSON.stringify({
    error: 'invalid_request',
    error_description: decision.description || 'This client is not permitted to perform this action.'
  })
  res.statusCode = 400
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  // Writing directly to the node response ends the request; the caller returns
  // without delegating to the provider (matching the direct-response pattern in
  // server/routes/mcp.post.ts).
  res.end(payload)
}

/**
 * TASK 9.2 — refresh issuance revocation check.
 *
 * A refresh request consumes an EXISTING grant. The refresh token carries a
 * `grantId`; if that grant is under a revocation marker, refresh must be rejected
 * so a revoked grant cannot mint new access/refresh tokens while its credentials
 * and indexes are being cleaned up (design: "Authorization, code exchange,
 * refresh, and every opaque-token consumer must reject a marked grant"). This
 * check is grant-scoped and therefore applies to MANAGED and UNMANAGED clients
 * alike — revocation targets the grant, not the client.
 *
 * SAFETY (Req 9.2, 18.2): when no fence is installed / no marker exists,
 * {@link isGrantRevoked} returns false and this is a pure pass-through, so a
 * non-revoked grant refreshes EXACTLY as today. The refresh token was already
 * buffered+replayed by {@link parseTokenRequestAndRestore}; resolving it here is
 * a read-only lookup that never consumes it. Any resolution error fails OPEN
 * (returns `undefined` grantId) so a lookup fault can never wrongly reject a
 * valid refresh — the provider still validates the token itself.
 */
async function resolveRefreshGrantId(refreshToken: string): Promise<string | undefined> {
  try {
    const provider = await getOAuthProvider()
    const refreshModel = (provider as unknown as {
      RefreshToken?: { find(token: string): Promise<{ grantId?: string } | undefined> }
    }).RefreshToken
    const stored = await refreshModel?.find(refreshToken)
    return stored?.grantId
  } catch (error) {
    // A read fault must never break a valid refresh; the provider re-validates.
    logger.warn('[MCP OAuth] Lifecycle gate could not resolve refresh grant; passing through', error)
    return undefined
  }
}

/**
 * Enforce the managed lifecycle/policy gate for a gated boundary. Returns `true`
 * when the request was DENIED and a response already sent (the caller must NOT
 * delegate to the provider); `false` when the request may proceed (managed and
 * allowed, or unmanaged, or the gate failed open).
 *
 * The gate ALWAYS restores/replays the token body so the provider receives it,
 * regardless of the decision.
 */
export async function enforceManagedLifecycleGate(
  event: H3Event,
  gated: GatedBoundary
): Promise<boolean> {
  let parsed: ParsedRequest
  try {
    parsed = gated === 'token'
      ? await parseTokenRequestAndRestore(event)
      : parseAuthorizeRequest(event)
  } catch (error) {
    // Any parsing/buffering failure fails OPEN — never break the OAuth flow.
    logger.warn('[MCP OAuth] Lifecycle gate could not parse request; passing through', error)
    return false
  }

  const clientId = parsed.clientId
  if (!clientId) return false

  // TASK 9.2 — grant-revocation fence at the refresh issuance boundary. Runs
  // for managed AND unmanaged clients because a revocation marker targets the
  // grant, not the client. When no marker exists this is a no-op (Req 9.2).
  if (gated === 'token' && parsed.grantType === 'refresh_token' && parsed.refreshToken) {
    const grantId = await resolveRefreshGrantId(parsed.refreshToken)
    if (await isGrantRevoked(grantId)) {
      denyRequest(event, 'refresh', clientId, {
        allowed: false,
        reason: 'grant_revoked',
        description: 'This grant has been revoked and can no longer refresh tokens.'
      })
      return true
    }
  }

  let policy: ManagedPolicyExtension | null
  try {
    const provider = await getOAuthProvider()
    policy = await resolveManagedPolicy(provider, clientId)
  } catch (error) {
    // Could not resolve the client/policy — fail open so unmanaged and normal
    // flows are unaffected. Only a positively-identified managed client is ever
    // denied.
    logger.warn('[MCP OAuth] Lifecycle gate could not resolve client policy; passing through', error)
    return false
  }

  // Unmanaged client (policy === null): pass through unchanged (Req 7.7).
  if (!policy) return false

  const boundary = boundaryFor(gated, parsed)
  const decision = evaluateBoundary(policy, boundary, {
    resource: parsed.resource,
    scopes: parsed.scopes
  })
  if (decision.allowed) return false

  denyRequest(event, boundary, clientId, decision)
  return true
}
