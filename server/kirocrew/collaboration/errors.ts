/**
 * Non-disclosing collaboration authorization denials.
 *
 * Feature: shared-investigations (task 2.1). These typed outcomes back
 * Requirements 3.4, 4.10, 24.2, 24.25: an Authorization_Denial returns no
 * protected content, never distinguishes object existence, and never leaks
 * tokens, group object identifiers, or storage credentials. The codes and the
 * safe-message-only shape mirror the canonical wire-contract `ErrorEnvelope`
 * / `ErrorCode` owned by the cross-repository contract (task 1.1).
 */

/**
 * Subset of the wire-contract `ErrorCode` enum that the authorization layer can
 * emit. Persistence, pagination, and artifact layers add the remaining codes.
 */
export type CollaborationDenialCode =
  | 'reauth_required'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'revision_conflict'
  | 'payload_mismatch'
  | 'unresolved'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'validation_failed'

export interface CollaborationDenial {
  readonly code: CollaborationDenialCode
  /** Operator-safe message. Never carries protected object fields. */
  readonly safeMessage: string
  readonly retryable: boolean
  /**
   * For a stale-Revision conflict, the current expected Revision the client
   * should re-read to. Safe scalar only; never protected content
   * (Requirement 7.9, 12.4).
   */
  readonly expectedRevision?: number
}

/**
 * A denial that carries only the safe fields the wire contract permits. It is a
 * plain Error so route handlers can `throw` it, but it exposes `toEnvelope()` so
 * a boundary can serialize exactly the documented `ErrorEnvelope` shape and
 * nothing else.
 */
export class CollaborationAuthorizationError extends Error implements CollaborationDenial {
  readonly code: CollaborationDenialCode
  readonly safeMessage: string
  readonly retryable: boolean
  readonly expectedRevision?: number

  constructor(denial: CollaborationDenial) {
    super(denial.safeMessage)
    this.name = 'CollaborationAuthorizationError'
    this.code = denial.code
    this.safeMessage = denial.safeMessage
    this.retryable = denial.retryable
    this.expectedRevision = denial.expectedRevision
  }

  toEnvelope(): {
    code: CollaborationDenialCode
    safeMessage: string
    retryable: boolean
    expectedRevision?: number
  } {
    const envelope: {
      code: CollaborationDenialCode
      safeMessage: string
      retryable: boolean
      expectedRevision?: number
    } = { code: this.code, safeMessage: this.safeMessage, retryable: this.retryable }
    if (typeof this.expectedRevision === 'number') {
      envelope.expectedRevision = this.expectedRevision
    }
    return envelope
  }
}

/**
 * The token could not be resolved to a stored identity, is expired, or lacks the
 * Crew resource audience. The client resolves this by renewing/reauthorizing;
 * it is deliberately indistinguishable from a missing collaboration grant so a
 * caller cannot probe which precondition failed (Requirement 3.4, 3.9).
 */
export function reauthRequired(
  safeMessage = 'Collaboration authorization is required.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'reauth_required', safeMessage, retryable: false })
}

/**
 * A valid Crew identity that lacks the exact collaboration scope, current
 * membership, containment, source scope, or policy needed for this operation.
 * Configuration-only grants and non-GHOST sessions land here without disclosing
 * the missing predicate (Requirement 3.3, 4.10, 24.1, 24.2).
 */
export function forbidden(
  safeMessage = 'You do not have access to this collaboration resource.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'forbidden', safeMessage, retryable: false })
}

/**
 * An identifier that is unknown or outside the caller's audience. Returned in
 * place of a distinguishable existence signal so callers cannot enumerate
 * objects they cannot access (Requirement 4.7, 24.2).
 */
export function notFound(
  safeMessage = 'The requested collaboration resource was not found.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'not_found', safeMessage, retryable: false })
}

/**
 * A repeated Artifact identifier supplied different bytes than the object
 * already stored. The stored write-once object is never replaced; the caller is
 * told only that the request conflicts (Requirement 8.10). Carries no stored
 * content, checksum, or storage detail.
 */
export function artifactConflict(
  safeMessage = 'A different artifact is already stored for this identifier.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'conflict', safeMessage, retryable: false })
}

/**
 * A reservation retry reused an Operation_ID with a different declared payload.
 * The original reservation is left unchanged (Requirement 8.4 idempotency).
 */
export function payloadMismatch(
  safeMessage = 'This operation was already used with a different request.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'payload_mismatch', safeMessage, retryable: false })
}

/**
 * The upload could not be reconciled to a known reservation/object state, so no
 * further bytes may be sent yet. The client retries reconciliation
 * (Requirement 8.9).
 */
export function unresolved(
  safeMessage = 'The upload could not be reconciled yet.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'unresolved', safeMessage, retryable: true })
}

/**
 * A durable mutation could not be applied because it collides with existing
 * accepted state that is not an idempotent replay — for example an
 * explicit-new creation whose Operation_ID was reused with a different payload,
 * or a check-finished payload that differs from the one already recorded for the
 * same `(Investigation_ID, Check_ID)` (Requirement 7.7, 10.17, 14.5). The
 * conflicting request is never applied and existing state is unchanged.
 */
export function conflict(
  safeMessage = 'This request conflicts with existing collaboration state.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'conflict', safeMessage, retryable: false })
}

/**
 * Mutable Investigation metadata was updated with a stale expected Revision.
 * Maps to HTTP 409 at the boundary; no metadata changes (Requirement 7.8, 7.9,
 * 12.3, 12.4). Optionally carries the current expected Revision so the client
 * can re-read and retry.
 */
export function revisionConflict(
  expectedRevision?: number,
  safeMessage = 'This resource was modified; reload and retry.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({
    code: 'revision_conflict',
    safeMessage,
    retryable: false,
    expectedRevision
  })
}

/**
 * An Explicit_Artifact exceeds the hard 10 MiB ceiling (or the Team_Space
 * Evidence_Policy's narrower `maxExplicitArtifactBytes`). The upload is rejected
 * with a limit-specific error and the bytes are never truncated to fit
 * (Requirements 11.7, 11.8). Carries no stored content or storage detail.
 */
export function payloadTooLarge(
  safeMessage = 'The artifact exceeds the maximum allowed size and cannot be shared.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'payload_too_large', safeMessage, retryable: false })
}

/**
 * An Explicit_Artifact declares or resolves to a media type that is not on the
 * first-release allow-list (or is not permitted by the Team_Space
 * Evidence_Policy). The Artifact is rejected outright with no raw-content
 * fallback (Requirements 11.9, 11.10).
 */
export function unsupportedMediaType(
  safeMessage = 'This artifact type cannot be shared.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'unsupported_media_type', safeMessage, retryable: false })
}

/**
 * Uploaded bytes did not satisfy declared size/checksum, required
 * metadata/provenance, or the Team_Space Evidence_Policy. The manifest is
 * retained in a non-ready state and citation stays unavailable (Requirements
 * 8.7, 8.8, 11.2). The safe message never carries the stored bytes, the
 * expected/actual checksums, or any policy internals.
 */
export function validationFailed(
  safeMessage = 'The uploaded artifact failed validation and was not published.'
): CollaborationAuthorizationError {
  return new CollaborationAuthorizationError({ code: 'validation_failed', safeMessage, retryable: false })
}
