/**
 * Collaboration identity and authorization types.
 *
 * Feature: shared-investigations (task 2.1). These mirror the language-neutral
 * `AuthenticatedSubject`, `DestinationScope`, and `ValidatedTokenContext` models
 * in design.md and the canonical wire contract. Collaboration authorization is
 * the conjunction of the stored identity and current validated predicates
 * (Requirements 3.1-3.4, 3.12, 3.13, 4.1, 24.1, 24.2, 24.25); this module carries
 * only the identity/scope half. Team_Space membership, containment, source scope,
 * and Evidence_Policy are added by the TeamSpaceAuthorizer (task 2.3).
 */

import { COLLABORATION_READ_SCOPE, COLLABORATION_WRITE_SCOPE, type CollaborationScope } from '../types'

export { COLLABORATION_READ_SCOPE, COLLABORATION_WRITE_SCOPE }
export type { CollaborationScope }

/**
 * Tenant-scoped human identity loaded by the existing GHOST_Token_Identity_Path.
 * Never derived from client actor fields (Requirement 4.1, 24.25).
 */
export interface AuthenticatedSubject {
  readonly tenantId: string
  readonly entraObjectId: string
}

/**
 * Validated token context returned by the GHOST_Token_Identity_Path adapter. The
 * collaboration module obtains this ONLY by passing the Opaque_Access_Token to
 * the existing path; it never decodes the token, verifies a signature, or
 * interprets bearer claims (Requirement 3.12, 3.13).
 */
export interface ValidatedTokenContext {
  /** Stored Authenticated_Subject. Authorship derives from this alone. */
  readonly subject: AuthenticatedSubject
  /** Opaque resource identifier the token was minted for. */
  readonly resourceAudience: string
  /** Returned authorization context (granted scopes). */
  readonly tokenScopes: ReadonlySet<string>
}

/**
 * The kind of collaboration access an operation needs. Read operations require
 * the Collaboration_Read_Scope; contributing operations require the
 * Collaboration_Write_Scope (Requirement 3.1, 3.2). Neither implies GHOST
 * administrative deletion authority (Requirement 4.10).
 */
export type CollaborationAccess = 'read' | 'write'

/** Maps a required access kind to the exact OAuth scope enforced for it. */
export function scopeForAccess(access: CollaborationAccess): CollaborationScope {
  return access === 'write' ? COLLABORATION_WRITE_SCOPE : COLLABORATION_READ_SCOPE
}

/**
 * Source_System subject types recognized by the wire contract. A subject's
 * identity is the tuple (Source_Binding, source type, Stable_Source_ID); the
 * displayed label is mutable and never part of identity (Requirement 6.6, 6.10).
 */
export type SourceType = 'jira' | 'servicenow' | 'gitlab' | 'aws' | 'extension'

/**
 * Subject_Reference: the stable subject identity used for scope-contained
 * storage keys and Team_Space authorization. Mirrors the canonical wire-contract
 * `SubjectReference`. Shared here because both the authorization gate and the
 * persistence layer (task 3.2) key work by this reference.
 */
export interface SubjectReference {
  readonly sourceBindingId: string
  readonly sourceType: SourceType
  readonly stableSourceId: string
  /** Mutable presentation label; never part of subject identity. */
  readonly displayLabel?: string
}
