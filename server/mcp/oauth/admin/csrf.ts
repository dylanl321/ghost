/**
 * OAuth Administration — session-bound CSRF issuance/verification + same-origin.
 *
 * Browser mutations require a session-bound CSRF token (design "Authorization,
 * deployment binding, and capability gate" CSRF paragraph; Requirements 1.4,
 * 13.6, 17.6). This module:
 *
 *   1. `issueCsrfToken(event)` — mints a token BOUND to the current browser
 *      session. The token is `<nonce>.<expiresAt>.<signature>` where the
 *      signature is an HMAC (keyed by `getRequestStateKey()`) over a fixed
 *      domain-separation label, a stable per-session subject, the nonce, and
 *      the expiry. The server stores nothing per token: verification recomputes
 *      the binding from the same session subject, so a token minted for one
 *      session cannot be verified under another (design: "stores only a
 *      cryptographic verifier/binding, never the raw token").
 *   2. `verifyCsrfToken(event, token)` — recomputes and constant-time compares
 *      the binding and enforces the embedded expiry. Fails CLOSED.
 *   3. `validateSameOrigin(event)` — validates the request `Origin`/`Referer`
 *      against the server-derived deployment host(s).
 *
 * SAFETY: The raw token value is a session-integrity secret — it is NEVER
 * logged, audited, or persisted (design). Only the cryptographic binding is
 * ever computed, and it is recomputed on demand rather than stored. The HMAC
 * folds a versioned domain-separation label so a CSRF signature can never
 * collide with the actor pseudonym, network pseudonym, or cursor HMACs that
 * reuse the same request-state key.
 */

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import { getAllowedMcpOrigins, getRequestStateKey } from '../../config'

/**
 * Domain-separation label folded into the CSRF HMAC. Versioned so the binding
 * scheme can evolve; keeps a CSRF signature distinct from every other use of
 * the shared request-state key.
 */
const CSRF_SIGNATURE_DOMAIN = 'ghost:oauth-admin:csrf:v1'

/** How long an issued CSRF token remains valid. */
export const CSRF_TOKEN_TTL_MS = 8 * 60 * 60 * 1000

/**
 * Derive the stable per-session subject the CSRF binding is anchored to. Uses
 * the most stable session identity available (`oid`/`sub`/`id`), falling back
 * to the email/username only when no stable subject exists. A missing session
 * yields no subject and the caller must have already passed `requireAdmin`.
 *
 * This mirrors the actor-reference derivation in the access service but is kept
 * separate: the CSRF binding must survive an actor-pseudonym scheme change, and
 * it is intentionally NOT deployment-scoped (a session is a single deployment).
 */
function resolveSessionSubject(event: H3Event): string {
  const user = event.context.auth?.user as Record<string, any> | undefined
  const claims = (user?.claims || {}) as Record<string, any>
  const subject
    = user?.oid || user?.sub || user?.id
    || claims.oid || claims.sub || claims.id
    || user?.email || claims.email || claims.preferred_username
    || 'unknown-subject'
  return String(subject).trim().toLowerCase()
}

/**
 * Compute the HMAC binding signature for a session subject, nonce, and expiry.
 * The signed material is unambiguous: each segment is separated by a NUL byte
 * so distinct field boundaries cannot be confused.
 */
function computeBinding(subject: string, nonce: string, expiresAtMs: number): string {
  const hmac = createHmac('sha256', getRequestStateKey())
  hmac.update(CSRF_SIGNATURE_DOMAIN)
  hmac.update('\u0000')
  hmac.update(subject)
  hmac.update('\u0000')
  hmac.update(nonce)
  hmac.update('\u0000')
  hmac.update(String(expiresAtMs))
  return hmac.digest('base64url')
}

/** Constant-time comparison of two base64url signatures. */
function bindingsMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'base64url')
  const bb = Buffer.from(b, 'base64url')
  if (ab.length !== bb.length || ab.length === 0) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Mint a session-bound CSRF token for the current browser session. The token is
 * self-verifying (`<nonce>.<expiresAtMs>.<signature>`); nothing is stored
 * server-side. The value is a secret — never log or audit it.
 */
export function issueCsrfToken(event: H3Event, now: number = Date.now(), ttlMs: number = CSRF_TOKEN_TTL_MS): string {
  const subject = resolveSessionSubject(event)
  const nonce = randomBytes(18).toString('base64url')
  const expiresAtMs = now + ttlMs
  const signature = computeBinding(subject, nonce, expiresAtMs)
  return `${nonce}.${expiresAtMs}.${signature}`
}

/**
 * Verify a CSRF token against the current session. Fails CLOSED: a malformed,
 * tampered, expired, or cross-session token returns `false`. Verification
 * recomputes the binding from the CURRENT session subject, so a token minted
 * for another session cannot validate here.
 */
export function verifyCsrfToken(event: H3Event, token: unknown, now: number = Date.now()): boolean {
  if (typeof token !== 'string' || token.length === 0) return false
  const parts = token.split('.')
  if (parts.length !== 3) return false
  const [nonce, expiresRaw, providedSignature] = parts
  if (!nonce || !expiresRaw || !providedSignature) return false

  const expiresAtMs = Number(expiresRaw)
  if (!Number.isInteger(expiresAtMs) || expiresAtMs <= now) return false

  const subject = resolveSessionSubject(event)
  const expectedSignature = computeBinding(subject, nonce, expiresAtMs)
  return bindingsMatch(providedSignature, expectedSignature)
}

/**
 * Extract a URL hostname, returning null on malformed input. `Referer` carries
 * a full URL; `Origin` is scheme+host, which `new URL` also parses.
 */
function hostnameOf(value: string | undefined): string | null {
  if (!value) return null
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Validate that a mutation request is same-origin with the deployment. Uses the
 * server-derived allowed origins (the deployment host plus configured origins,
 * with loopback allowed off-production) — never a caller-supplied host. Returns
 * `true` only when an `Origin` or `Referer` header is present AND its host is
 * one of the allowed deployment hosts. A missing Origin/Referer on a
 * state-changing request is treated as a failure (fail closed).
 */
export function validateSameOrigin(event: H3Event): boolean {
  const allowed = new Set(getAllowedMcpOrigins().map(host => host.toLowerCase()))
  const originHost = hostnameOf(getRequestHeader(event, 'origin'))
  const refererHost = hostnameOf(getRequestHeader(event, 'referer'))

  // At least one of Origin/Referer must be present and allowed. If Origin is
  // present it must match; if only Referer is present it must match.
  if (originHost !== null) return allowed.has(originHost)
  if (refererHost !== null) return allowed.has(refererHost)
  return false
}
