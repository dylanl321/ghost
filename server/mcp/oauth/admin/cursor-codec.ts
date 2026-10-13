/**
 * OAuth Administration — signed, query-bound cursor codec.
 *
 * Implements {@link OAuthAdminCursorCodec}: it mints and verifies the opaque
 * continuation cursors the read-only query services hand back with each page
 * (design "Proposed API contract" list-request rules, Requirements 5.1, 8.1,
 * 16.3, 17.4).
 *
 * A cursor binds, and is signed over:
 *   - `deploymentId`     — the server-derived deployment (never caller-supplied)
 *   - `actor`            — the opaque browser actor reference
 *   - `capability`       — the capability scope the page was read under
 *   - `queryFingerprint` — a stable hash of the allowlisted filters + order
 *   - `order`            — the sort direction the page was produced in
 *   - `position`         — the opaque continuation key for the next page
 *   - `expiresAt`        — an absolute expiry after which the cursor is rejected
 *
 * SAFETY (fail closed — Requirement 17.4):
 *   `decode()` REJECTS (throws a typed `oauthAdminErrors` error) a cursor that
 *   is malformed, carries a tampered/forged signature, was minted for another
 *   deployment/actor/capability, was bound to a different query fingerprint, or
 *   has expired. A rejected cursor is never partially trusted — the caller
 *   discards the page request. Signature verification uses a constant-time
 *   comparison so a forged signature cannot be probed byte-by-byte.
 *
 * The signing key is the shared MCP request-state key (`getRequestStateKey`),
 * folded with a fixed domain-separation label so a cursor signature can never
 * collide with the actor pseudonym or network pseudonym HMACs that reuse the
 * same key.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  OAuthCapability,
  OAuthCursorClaims,
  OAuthDeploymentContext,
  OAuthListQuery,
  OAuthSortOrder
} from '#shared/types/oauth-administration'
import type { OAuthAdminCursorCodec } from './types'
import { oauthAdminErrors } from './access-service'
import { resolveOrder } from './repository-support'
import { getRequestStateKey } from '../../config'

/**
 * Domain-separation label folded into the cursor HMAC. Keeps a cursor signature
 * from colliding with any other use of the request-state key (actor reference,
 * network pseudonyms). Versioned so the signing scheme can evolve.
 */
const CURSOR_SIGNATURE_DOMAIN = 'ghost:oauth-admin:cursor:v1'

/**
 * The allowlisted filter fields that participate in a query fingerprint, in a
 * FIXED order so the fingerprint is stable regardless of the order the caller
 * supplied them. `limit` and `cursor` are intentionally excluded: paging
 * forward with the same filters at a different page size must still be
 * recognised as the same logical query, and the cursor cannot include itself.
 * `order` is folded in separately (it is a cursor claim in its own right).
 */
const FINGERPRINT_FILTER_FIELDS = [
  'from',
  'to',
  'clientId',
  'subject',
  'resource',
  'outcome',
  'stage',
  'diagnosticReference'
] as const

/** How long a minted cursor remains valid. Bounds replay of a stale cursor. */
export const DEFAULT_CURSOR_TTL_MS = 15 * 60 * 1000

/**
 * Compute a stable query fingerprint from an {@link OAuthListQuery}'s
 * allowlisted filters plus its resolved order. Only the documented filter
 * fields are consulted; any other property on the object is ignored, so a
 * caller cannot smuggle an unfingerprinted filter past the binding. The
 * resulting string is a compact, deterministic JSON of the present fields.
 */
export function computeQueryFingerprint(query: OAuthListQuery): string {
  const normalized: Record<string, string> = {}
  for (const field of FINGERPRINT_FILTER_FIELDS) {
    const value = query[field]
    // Only include fields that were actually supplied. An absent filter and an
    // empty-string filter are treated identically (both omitted) so the
    // fingerprint is not sensitive to falsy noise.
    if (value === undefined || value === null || value === '') continue
    normalized[field] = String(value)
  }
  normalized.order = resolveOrder(query.order)
  // Stable stringify: keys are emitted in the fixed field order above followed
  // by `order`, so the serialization is deterministic for equal queries.
  const ordered: Record<string, string> = {}
  for (const field of FINGERPRINT_FILTER_FIELDS) {
    const value = normalized[field]
    if (value !== undefined) ordered[field] = value
  }
  ordered.order = normalized.order
  return JSON.stringify(ordered)
}

/** base64url-encode a UTF-8 string. */
function encodeBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

/** base64url-decode to a UTF-8 string; throws on invalid input. */
function decodeBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

/**
 * Compute the HMAC signature over the canonical payload segment. The payload is
 * signed as its already-encoded base64url segment so the exact bytes verified
 * are the exact bytes transported (no re-serialization ambiguity).
 */
function sign(encodedPayload: string): string {
  const hmac = createHmac('sha256', getRequestStateKey())
  hmac.update(CURSOR_SIGNATURE_DOMAIN)
  hmac.update('\u0000')
  hmac.update(encodedPayload)
  return hmac.digest('base64url')
}

/** Constant-time comparison of two base64url signatures. */
function signaturesMatch(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'base64url')
  const bb = Buffer.from(b, 'base64url')
  if (ab.length !== bb.length || ab.length === 0) return false
  return timingSafeEqual(ab, bb)
}

/**
 * The default signed-cursor codec. Stateless; reads the signing key per call so
 * a rotated key is observed without a restart (a rotation invalidates
 * outstanding cursors, which fail closed on the next `decode`).
 */
export class SignedOAuthAdminCursorCodec implements OAuthAdminCursorCodec {
  /**
   * Encode and sign a set of claims into an opaque `<payload>.<signature>`
   * cursor string. The payload is the base64url of a canonical JSON object.
   */
  encode(claims: OAuthCursorClaims): string {
    const payload = {
      deploymentId: claims.deploymentId,
      actor: claims.actor,
      capability: claims.capability,
      queryFingerprint: claims.queryFingerprint,
      order: claims.order,
      position: claims.position,
      expiresAt: claims.expiresAt
    }
    const encodedPayload = encodeBase64Url(JSON.stringify(payload))
    return `${encodedPayload}.${sign(encodedPayload)}`
  }

  /**
   * Verify and decode a cursor into its claims. Fails closed: any structural,
   * signature, or expiry problem throws a typed 409 conflict so the caller
   * discards the page request. Cross-deployment/actor/capability/query binding
   * is enforced separately by {@link decodeBound} (which callers use); this
   * method only proves the cursor is authentic, well-formed, and unexpired.
   */
  decode(cursor: string): OAuthCursorClaims {
    if (typeof cursor !== 'string' || cursor.length === 0) {
      throw cursorRejected('Cursor is missing or malformed')
    }
    const separator = cursor.lastIndexOf('.')
    if (separator <= 0 || separator === cursor.length - 1) {
      throw cursorRejected('Cursor is malformed')
    }
    const encodedPayload = cursor.slice(0, separator)
    const providedSignature = cursor.slice(separator + 1)

    // Verify the signature BEFORE trusting any byte of the payload. A tampered
    // payload changes the expected signature and is rejected here.
    if (!signaturesMatch(providedSignature, sign(encodedPayload))) {
      throw cursorRejected('Cursor signature is invalid')
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(decodeBase64Url(encodedPayload))
    } catch {
      throw cursorRejected('Cursor payload is malformed')
    }

    const claims = coerceClaims(parsed)
    if (!claims) throw cursorRejected('Cursor payload is incomplete')

    // Expiry check (Requirement 17.4): a stale cursor cannot be replayed.
    const expiresMs = new Date(claims.expiresAt).getTime()
    if (!Number.isFinite(expiresMs) || expiresMs <= Date.now()) {
      throw cursorRejected('Cursor has expired')
    }

    return claims
  }
}

/**
 * Validate that the (already parsed) object carries every required claim with a
 * plausible type. Returns the typed claims or `null` when any field is missing
 * or the wrong type. No field is defaulted — an incomplete cursor is rejected.
 */
function coerceClaims(value: unknown): OAuthCursorClaims | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const deploymentId = record.deploymentId
  const actor = record.actor
  const capability = record.capability
  const queryFingerprint = record.queryFingerprint
  const order = record.order
  const position = record.position
  const expiresAt = record.expiresAt
  if (
    typeof deploymentId !== 'string'
    || typeof actor !== 'string'
    || typeof capability !== 'string'
    || typeof queryFingerprint !== 'string'
    || (order !== 'asc' && order !== 'desc')
    || typeof position !== 'string'
    || typeof expiresAt !== 'string'
  ) {
    return null
  }
  return {
    deploymentId,
    actor,
    capability: capability as OAuthCapability,
    queryFingerprint,
    order,
    position,
    expiresAt
  }
}

/** A rejected cursor is a 409 conflict — the page request cannot proceed. */
function cursorRejected(message: string) {
  return oauthAdminErrors.conflict({
    message,
    data: { reason: 'CURSOR_REJECTED' }
  })
}

/**
 * Parameters binding a cursor to the current access context and query. A cursor
 * is only usable for the exact deployment/actor/capability/query it was minted
 * for.
 */
export interface CursorBinding {
  deploymentId: string
  actor: string
  capability: OAuthCapability
  queryFingerprint: string
  order: OAuthSortOrder
}

/**
 * Decode a cursor AND enforce that its claims match the caller's binding. This
 * is the method query services use: a cursor minted for another deployment,
 * actor, capability, query, or order is rejected as a conflict (Requirement
 * 16.3 / 17.4) rather than silently serving the wrong page.
 */
export function decodeBoundCursor(
  codec: OAuthAdminCursorCodec,
  cursor: string,
  binding: CursorBinding
): OAuthCursorClaims {
  const claims = codec.decode(cursor)
  if (claims.deploymentId !== binding.deploymentId) throw cursorRejected('Cursor is bound to another deployment')
  if (claims.actor !== binding.actor) throw cursorRejected('Cursor is bound to another actor')
  if (claims.capability !== binding.capability) throw cursorRejected('Cursor is bound to another capability')
  if (claims.queryFingerprint !== binding.queryFingerprint) throw cursorRejected('Cursor is bound to a different query')
  if (claims.order !== binding.order) throw cursorRejected('Cursor is bound to a different ordering')
  return claims
}

/**
 * Mint a signed cursor for the NEXT page from the current binding and the
 * opaque continuation `position`. Bound to the same deployment/actor/capability/
 * query/order the page was produced under so a later request cannot replay it
 * against a different scope.
 */
export function issueBoundCursor(
  codec: OAuthAdminCursorCodec,
  binding: CursorBinding,
  position: string,
  now: number = Date.now(),
  ttlMs: number = DEFAULT_CURSOR_TTL_MS
): string {
  return codec.encode({
    deploymentId: binding.deploymentId,
    actor: binding.actor,
    capability: binding.capability,
    queryFingerprint: binding.queryFingerprint,
    order: binding.order,
    position,
    expiresAt: new Date(now + ttlMs).toISOString()
  })
}

/** Build the cursor binding for a resolved deployment, actor, capability, and query. */
export function cursorBindingFor(
  ctx: OAuthDeploymentContext,
  actor: string,
  capability: OAuthCapability,
  query: OAuthListQuery
): CursorBinding {
  return {
    deploymentId: ctx.deploymentId,
    actor,
    capability,
    queryFingerprint: computeQueryFingerprint(query),
    order: resolveOrder(query.order)
  }
}

/** Shared singleton codec for server request paths. */
export const oauthAdminCursorCodec: OAuthAdminCursorCodec = new SignedOAuthAdminCursorCodec()
