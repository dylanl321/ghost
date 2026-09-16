/**
 * Shared Investigations — Collaboration_API support layer (task 9.1).
 *
 * Owner: Ghostv2 Nitro routes and collaboration services under
 * `/api/kirocrew/v1/collaboration`.
 *
 * The Nitro route handlers stay thin: transport framing only. All of the
 * request-shaping and cross-cutting API rules the versioned Collaboration_API
 * owns live here, as pure, storage-neutral helpers that are unit-testable
 * without a running server:
 *
 *   - **128 KiB JSON limit before domain parsing** — `enforceJsonBodyLimit`
 *     rejects any body over 128 KiB with a `payload_too_large` envelope BEFORE
 *     the bytes are parsed into a domain command (Requirement 11.4).
 *   - **Safe consistent error envelope** — `toErrorEnvelope` / `httpStatusFor`
 *     map every `CollaborationAuthorizationError` (and any unexpected error) to
 *     the one documented `ErrorEnvelope` shape and its HTTP status, never
 *     leaking object existence, tokens, group ids, or storage detail
 *     (Requirement 19.10, 19.13, 24.2).
 *   - **Bounded pages** — `parsePageSize` clamps to default 50 / maximum 200
 *     (Requirement 19.3).
 *   - **Reauthorized presence** — `CollaborationPresenceService` batch-queries
 *     current non-expired presence by stable Subject_Reference and renews a
 *     directly observed lease, evaluating a per-subject reauthorization callback
 *     so every subject (and the optional Investigation/Run metadata) is
 *     authorized before its presence is read or written (Requirement 15.2-15.5,
 *     15.11, 19.10).
 *   - **Route authorization facade** — `CollaborationApi` binds the identity
 *     gate (`authorizeCollaboration`) and the current Team_Space gate
 *     (`TeamSpaceAuthorizer`) so each route reauthorizes its exact operation,
 *     creation lookup, page, and stream (Requirement 4.11, 19.1-19.12, 21.1).
 *
 * Nothing here decodes an Opaque_Access_Token; identity always comes from the
 * existing GHOST_Token_Identity_Path via `authorizeCollaboration`.
 */

import { authorizeCollaboration, type AuthorizeOptions, type CollaborationPrincipal } from './authorizer'
import { CollaborationAuthorizationError, forbidden, payloadTooLarge } from './errors'

import type {
  TeamSpaceAuthorizer,
  CollaborationOperation,
  TeamSpaceAuthorization
} from './team-space-authorizer'
import type { PresenceActivityKind, PresenceObserver, SpaceScope } from './keys'
import { presenceLeaseKey, presencePartition } from './keys'
import type { SubjectReference } from './subject'
import type { CollaborationAccess } from './types'
import { clampPageSize } from './api-schemas'

export { CollaborationAuthorizationError }

// ---------------------------------------------------------------------------
// 128 KiB JSON body limit (before domain parsing).
// ---------------------------------------------------------------------------

/** Hard ceiling on a collaboration JSON mutation body, in bytes (Requirement 11.4). */
export const MAX_JSON_BODY_BYTES = 128 * 1024

/**
 * Enforce the 128 KiB JSON body limit BEFORE parsing into a domain command.
 * Accepts the raw request bytes (or `null`/empty for a bodyless request) and
 * returns the parsed JSON value. Throws a non-disclosing `payload_too_large`
 * denial when the raw bytes exceed the ceiling, and a `validation_failed`
 * denial when the bytes are not valid JSON — in both cases WITHOUT attempting to
 * interpret the body as a command (Requirement 11.4, 19.13).
 *
 * The byte count is measured on the raw bytes actually received, not on a
 * re-serialization, so an oversized body is rejected even if it would shrink
 * when re-encoded.
 */
export function enforceJsonBodyLimit(raw: Buffer | string | null | undefined): unknown {
  if (raw === null || raw === undefined) return undefined
  const bytes = typeof raw === 'string' ? Buffer.byteLength(raw, 'utf8') : raw.byteLength
  if (bytes > MAX_JSON_BODY_BYTES) {
    throw payloadTooLarge('The request body exceeds the maximum allowed size.')
  }
  const text = typeof raw === 'string' ? raw : raw.toString('utf8')
  if (text.trim().length === 0) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new CollaborationAuthorizationError({
      code: 'validation_failed',
      safeMessage: 'The request body could not be parsed.',
      retryable: false
    })
  }
}

// ---------------------------------------------------------------------------
// Error envelope + HTTP status mapping.
// ---------------------------------------------------------------------------

/** The safe wire error envelope (mirrors `ErrorEnvelope` in api-schemas). */
export interface ErrorEnvelope {
  code: CollaborationAuthorizationError['code']
  safeMessage: string
  retryable: boolean
  expectedRevision?: number
}

/**
 * Map any error thrown out of a collaboration route to the one safe, consistent
 * `ErrorEnvelope`. A typed `CollaborationAuthorizationError` serializes exactly
 * its safe fields; any other (unexpected) error collapses to a generic
 * non-disclosing `forbidden` envelope so an internal failure never leaks a
 * stack, message, or object existence (Requirement 19.10, 24.2).
 */
export function toErrorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof CollaborationAuthorizationError) {
    return error.toEnvelope()
  }
  return forbidden().toEnvelope()
}

/** The HTTP status the given error code is served with. */
export function httpStatusFor(code: CollaborationAuthorizationError['code']): number {
  switch (code) {
    case 'reauth_required':
      return 401
    case 'forbidden':
      return 403
    case 'not_found':
    case 'unresolved':
      return 404
    case 'conflict':
    case 'revision_conflict':
    case 'payload_mismatch':
      return 409
    case 'payload_too_large':
      return 413
    case 'unsupported_media_type':
      return 415
    case 'validation_failed':
      return 422
    default:
      return 403
  }
}

/** The HTTP status for a whole error object (typed or not). */
export function httpStatusForError(error: unknown): number {
  if (error instanceof CollaborationAuthorizationError) return httpStatusFor(error.code)
  return 403
}

// ---------------------------------------------------------------------------
// Pagination.
// ---------------------------------------------------------------------------

/**
 * Parse a requested page size (query string or number) into `[1, 200]`,
 * defaulting to 50 (Requirement 19.3). Re-exported so both routes and tests use
 * the same clamp as the schema layer.
 */
export function parsePageSize(requested: string | number | undefined): number {
  if (requested === undefined) return clampPageSize(undefined)
  const numeric = typeof requested === 'number' ? requested : Number(requested)
  return clampPageSize(Number.isFinite(numeric) ? numeric : undefined)
}

// ---------------------------------------------------------------------------
// Route authorization facade.
// ---------------------------------------------------------------------------

/** Dependencies the API authorization facade binds. */
export interface CollaborationApiDeps {
  teamSpaceAuthorizer: TeamSpaceAuthorizer
  /** Test seam forwarded to the identity gate (audience / identity path). */
  authorizeOptions?: AuthorizeOptions
}

/**
 * Binds the two collaboration authorization gates so a route reauthorizes its
 * exact operation. Every route (and every page and content stream) calls
 * `authorize` (Requirement 4.11): first the identity/scope gate against the
 * Opaque_Access_Token via the existing GHOST_Token_Identity_Path, then the
 * current Team_Space gate (Tenant, current membership, containment, source
 * scope, Evidence_Policy, route capability).
 */
export class CollaborationApi {
  constructor(private readonly deps: CollaborationApiDeps) {}

  /**
   * Authorize one collaboration operation from the raw `Authorization` header.
   * Returns the authorized principal + Team_Space authorization. Throws a
   * non-disclosing `CollaborationAuthorizationError` on any failed predicate.
   */
  async authorize(
    authorization: string | undefined | null,
    operation: CollaborationOperation
  ): Promise<{ principal: CollaborationPrincipal; authorization: TeamSpaceAuthorization }> {
    const principal = await authorizeCollaboration(authorization, operation.access, this.deps.authorizeOptions)
    const authorization2 = await this.deps.teamSpaceAuthorizer.authorize(principal, operation)
    return { principal, authorization: authorization2 }
  }

  /**
   * Identity gate only: resolve the Opaque_Access_Token to a stored subject and
   * enforce the Crew audience + exact read/write scope, WITHOUT a specific
   * Team_Space (used by `GET /spaces`, which lists authorized spaces before any
   * space is known). Throws a non-disclosing denial when the identity/scope is
   * insufficient (Requirement 3.1-3.3, 24.1).
   */
  async authorizeIdentity(
    authorization: string | undefined | null,
    access: CollaborationAccess
  ): Promise<CollaborationPrincipal> {
    return authorizeCollaboration(authorization, access, this.deps.authorizeOptions)
  }

  /**
   * Build a per-page reauthorization predicate bound to `operation`. Passed to
   * the feed service so every page is reauthorized before protected records are
   * returned (Requirement 19.10). The principal is re-checked against the CURRENT
   * Team_Space predicates on each call, so a mid-walk membership/profile change
   * denies the next page.
   */
  reauthorizePage(
    principal: CollaborationPrincipal,
    operation: CollaborationOperation
  ): () => Promise<boolean> {
    return async () => {
      try {
        await this.deps.teamSpaceAuthorizer.authorizePage(principal, operation)
        return true
      } catch {
        return false
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Presence: subject-keyed batch query + renewal.
// ---------------------------------------------------------------------------

/** A stored Presence_Lease row keyed by the stable Subject_Reference. */
export interface PresenceLeaseRecord {
  subject: SubjectReference
  observer: PresenceObserver
  /** Optional validated context; never part of subject identity. */
  investigationId?: string
  runId?: string
  /** Epoch ms after which the lease is expired and must not be returned. */
  expiresAtMs: number
}

/** A safe presence row returned to a querying client. */
export interface PresenceRowProjection {
  subject: SubjectReference
  activityKind: PresenceActivityKind
  gatewayId: string
  investigationId?: string
  runId?: string
  expiresAt: string
}

/**
 * Storage port for presence. Keyed strictly by the stable Subject_Reference
 * partition (`presencePartition`) and the observer tuple (`presenceLeaseKey`),
 * so a display-label change never moves a lease and two gateways / activity
 * kinds are distinct rows (Requirement 6.10, 15.11). The in-memory
 * implementation below models exactly these keys; a DynamoDB implementation
 * (task 3.2 access patterns) fans a strongly consistent Query per subject.
 */
export interface PresenceStore {
  /** Upsert one lease row (idempotent renewal keyed by subject + observer). */
  put(scope: SpaceScope, record: PresenceLeaseRecord): Promise<void>
  /** All current (possibly expired) lease rows for ONE subject partition. */
  listForSubject(scope: SpaceScope, subject: SubjectReference): Promise<PresenceLeaseRecord[]>
}

/** How long a renewed presence lease is valid, in ms (server-time expiry). */
export const PRESENCE_LEASE_TTL_MS = 60 * 1000

/**
 * Reads and renews subject-keyed presence. Expiry is evaluated against a
 * server-supplied clock, never a client timestamp (Requirement 15.4). Query
 * batches by Subject_Reference and applies the optional Investigation/Run filter
 * on the returned rows, never in the subject key, so filtering cannot change
 * subject identity (Requirement 15.11).
 */
export class CollaborationPresenceService {
  constructor(
    private readonly store: PresenceStore,
    private readonly now: () => number = () => Date.now(),
    private readonly ttlMs: number = PRESENCE_LEASE_TTL_MS
  ) {}

  /**
   * Batch-query current non-expired presence for many subjects. `reauthorize`
   * is evaluated for EVERY subject (and the optional Investigation/Run context)
   * before that subject's rows are read; a subject the caller is not authorized
   * for is silently omitted rather than disclosed (Requirement 15.2, 19.10).
   */
  async query(
    scope: SpaceScope,
    input: { subjects: SubjectReference[]; investigationId?: string; runId?: string },
    reauthorize: (subject: SubjectReference) => Promise<boolean> | boolean
  ): Promise<PresenceRowProjection[]> {
    const now = this.now()
    const out: PresenceRowProjection[] = []
    for (const subject of input.subjects) {
      if (!(await reauthorize(subject))) continue
      const rows = await this.store.listForSubject(scope, subject)
      for (const row of rows) {
        if (row.expiresAtMs <= now) continue // server-time expiry
        if (input.investigationId && row.investigationId !== input.investigationId) continue
        if (input.runId && row.runId !== input.runId) continue
        out.push(this.project(row))
      }
    }
    return out
  }

  /**
   * Renew (upsert) a directly observed viewing/working lease for one subject.
   * The caller must have reauthorized the subject and optional context first;
   * this method persists the lease with a fresh server-time expiry and returns
   * a safe acknowledgement (Requirement 15.3, 15.4).
   */
  async renew(
    scope: SpaceScope,
    input: {
      subject: SubjectReference
      observer: PresenceObserver
      investigationId?: string
      runId?: string
    }
  ): Promise<{ subject: SubjectReference; activityKind: PresenceActivityKind; expiresAt: string }> {
    const expiresAtMs = this.now() + this.ttlMs
    const record: PresenceLeaseRecord = {
      subject: input.subject,
      observer: input.observer,
      investigationId: input.investigationId,
      runId: input.runId,
      expiresAtMs
    }
    await this.store.put(scope, record)
    return {
      subject: input.subject,
      activityKind: input.observer.activityKind,
      expiresAt: new Date(expiresAtMs).toISOString()
    }
  }

  private project(row: PresenceLeaseRecord): PresenceRowProjection {
    return {
      subject: row.subject,
      activityKind: row.observer.activityKind,
      gatewayId: row.observer.gatewayId,
      investigationId: row.investigationId,
      runId: row.runId,
      expiresAt: new Date(row.expiresAtMs).toISOString()
    }
  }
}

/**
 * In-memory {@link PresenceStore} for tests and local development. Rows are
 * stored per subject partition and keyed by the observer tuple exactly as
 * `presenceLeaseKey` defines, so a renewal replaces the same row and distinct
 * gateways/activity kinds stay separate.
 */
export class InMemoryPresenceStore implements PresenceStore {
  private readonly partitions = new Map<string, Map<string, PresenceLeaseRecord>>()

  async put(scope: SpaceScope, record: PresenceLeaseRecord): Promise<void> {
    const pk = presencePartition(scope, record.subject)
    const { sk } = presenceLeaseKey(scope, record.subject, record.observer)
    const rows = this.partitions.get(pk) ?? new Map<string, PresenceLeaseRecord>()
    rows.set(sk, { ...record })
    this.partitions.set(pk, rows)
  }

  async listForSubject(scope: SpaceScope, subject: SubjectReference): Promise<PresenceLeaseRecord[]> {
    const rows = this.partitions.get(presencePartition(scope, subject))
    if (!rows) return []
    return [...rows.values()].map(row => ({ ...row }))
  }
}

// ---------------------------------------------------------------------------
// Operation builders — keep route intent explicit and consistent.
// ---------------------------------------------------------------------------

/** A read operation on a whole space (list/search/feed/presence-query). */
export function spaceReadOp(spaceId: string): CollaborationOperation {
  return { access: 'read', spaceId }
}

/** A write operation on a whole space (create Investigation, renew presence). */
export function spaceWriteOp(spaceId: string): CollaborationOperation {
  return { access: 'write', spaceId }
}

/** A read/write operation targeting one object contained in `spaceId`. */
export function objectOp(
  access: CollaborationAccess,
  spaceId: string
): CollaborationOperation {
  return { access, spaceId, object: { spaceId } }
}
