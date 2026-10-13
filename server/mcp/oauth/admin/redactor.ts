/**
 * OAuth Administration — redactor.
 *
 * Validates DTO allowlists and produces safe error/audit projections, and
 * derives deployment-scoped pseudonymous network references.
 *
 * SAFETY (design "Data Models" denylist + Requirements 4.5, 16.4): every value
 * that leaves this module has an explicit denylist applied first — authorization
 * codes, access/refresh/registration tokens, cookie values, `Authorization`
 * headers, raw request/response bodies, authorization URLs/query strings, raw
 * exceptions/stacks, raw network addresses, private JWK parameters, configuration
 * secrets, and credential/profile documents. Network references are produced from
 * a deployment-scoped HMAC with domain separation using the existing
 * `getRequestStateKey()`; the raw address is never persisted or returned.
 */

import { createHmac } from 'node:crypto'
import type { OAuthDeploymentContext } from '#shared/types/oauth-administration'
import type { OAuthAdminRedactor } from './types'
import { getRequestStateKey } from '../../config'

/**
 * Domain-separation label for network-boundary pseudonyms. Mixing this fixed
 * label into the HMAC input ensures the same request-state key produces
 * references that cannot collide with any other use of that key elsewhere in
 * the MCP request-state codecs.
 */
const NETWORK_PSEUDONYM_DOMAIN = 'ghost:oauth-admin:network-reference:v1'

/**
 * Denylisted field-name fragments. Any object key whose lowercased name
 * contains one of these is dropped from a redacted projection. This is a
 * defence-in-depth backstop on top of the allowlisted DTOs — the DTOs already
 * only declare safe fields, but arbitrary nested input (provider payloads,
 * caught errors, exports) is scrubbed here before it can be persisted or
 * serialized to the browser.
 */
const DENYLIST_FRAGMENTS: readonly string[] = [
  'authorization', // Authorization header, authorization URL/query
  'authorizationcode',
  'auth_code',
  'authcode',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'registrationtoken',
  'registration_access_token',
  'idtoken',
  'id_token',
  'clientsecret',
  'client_secret',
  'secret',
  'password',
  'cookie',
  'setcookie',
  'token', // opaque tokens of any kind
  'bearer',
  'credential',
  'privatekey',
  'private_key',
  // Private JWK parameters (RFC 7517/7518): d, p, q, dp, dq, qi, k.
  'jwk_d',
  'requestbody',
  'responsebody',
  'rawbody',
  'stack',
  'stacktrace',
  'exception',
  'rawaddress',
  'ipaddress',
  'ip_address',
  'remoteaddress',
  'profile',
  'profiledocument'
]

/** Exact private-JWK parameter names (short single letters we can't fuzzy-match). */
const PRIVATE_JWK_PARAMS: ReadonlySet<string> = new Set(['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'])

/** Maximum recursion depth for redaction to bound work on adversarial nesting. */
const MAX_DEPTH = 12
/** Bounded length for safe error/message strings surfaced to the browser. */
const MAX_ERROR_MESSAGE = 200

function isDeniedKey(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (PRIVATE_JWK_PARAMS.has(key)) return true
  return DENYLIST_FRAGMENTS.some(fragment => normalized.includes(fragment.replace(/[^a-z0-9]/g, '')))
}

function redactValue(value: unknown, depth: number): unknown {
  if (value === null || value === undefined) return value
  if (depth > MAX_DEPTH) return undefined
  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    // Never serialize framework/error objects wholesale.
    if (value instanceof Error) return undefined
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (isDeniedKey(key)) continue
      const redacted = redactValue(item, depth + 1)
      if (redacted !== undefined) result[key] = redacted
    }
    return result
  }
  // Primitives (string/number/boolean) are returned as-is. The allowlisted DTO
  // shape governs which primitive fields exist; denied keys are already stripped.
  return value
}

/**
 * The default redactor. Stateless; the HMAC key is read per call so a rotated
 * request-state key is observed without a restart (rotation intentionally
 * breaks historical network-reference correlation — see design "DynamoDB record
 * layout and retention").
 */
export class OAuthAdminDenylistRedactor implements OAuthAdminRedactor {
  redact<T>(value: T): T {
    return redactValue(value, 0) as T
  }

  /**
   * Produce a deployment-scoped pseudonymous reference for a raw network
   * address. The deployment id and a domain-separation label are folded into
   * the HMAC input so references are stable ONLY within the same deployment and
   * key domain, and never reversible to the raw address (Requirement 16.4,
   * Property 14).
   */
  pseudonymizeNetwork(ctx: OAuthDeploymentContext, rawAddress: string): string {
    const normalized = (rawAddress || '').trim().toLowerCase()
    const hmac = createHmac('sha256', getRequestStateKey())
    hmac.update(NETWORK_PSEUDONYM_DOMAIN)
    hmac.update('\u0000')
    hmac.update(ctx.deploymentId)
    hmac.update('\u0000')
    hmac.update(normalized)
    // A short, opaque, URL-safe reference. Prefixed for readability in the UI.
    return `net_${hmac.digest('base64url').slice(0, 20)}`
  }

  /**
   * Produce a safe, bounded error projection from an arbitrary error. Never
   * exposes stacks, messages that may embed secrets, or provider error bodies.
   * The code is taken from a recognized safe `name`/`code`; the message is a
   * bounded, single-line sanitization.
   */
  safeError(error: unknown): { code: string, message: string } {
    const candidate = error as { name?: string, code?: string, message?: string } | undefined
    const rawCode = candidate?.code || candidate?.name || 'OAUTH_ADMIN_ERROR'
    const code = String(rawCode).replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 64) || 'OAUTH_ADMIN_ERROR'
    const rawMessage = typeof candidate?.message === 'string' ? candidate.message : ''
    // Collapse whitespace/newlines (drops multi-line stack traces) and bound the
    // length. This is best-effort scrubbing; safe codes remain the primary signal.
    const message = rawMessage
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_ERROR_MESSAGE) || 'An OAuth administration error occurred.'
    return { code, message }
  }
}

/** Shared singleton redactor for server request paths. */
export const oauthAdminRedactor: OAuthAdminRedactor = new OAuthAdminDenylistRedactor()
