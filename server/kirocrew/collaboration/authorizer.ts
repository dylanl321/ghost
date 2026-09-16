/**
 * CollaborationTokenAuthorizer.
 *
 * Feature: shared-investigations (task 2.1). After the GHOST_Token_Identity_Path
 * adapter resolves the Opaque_Access_Token to a `ValidatedTokenContext`, this
 * authorizer enforces the identity/scope half of collaboration authorization:
 *
 *  - the returned token audience must be the Crew collaboration resource
 *    (Requirement 3.1, 3.2, 24.2);
 *  - the returned scopes must contain the EXACT scope for the operation
 *    (read -> kirocrew.collaboration.read, write -> kirocrew.collaboration.write);
 *  - configuration scopes, Crew dashboard sessions, Kiro CLI login, AWS Identity
 *    Center access, and Source_System authentication are insufficient on their
 *    own (Requirement 3.3, 24.1);
 *  - authorship is derived from the stored Authenticated_Subject only; any
 *    client-supplied actor field is non-authoritative (Requirement 4.1, 24.25);
 *  - collaboration write NEVER implies GHOST administrative deletion authority,
 *    which requires separate current Administrator authorization (Requirement
 *    4.10).
 *
 * Team_Space membership, containment, source scope, and Evidence_Policy are the
 * separate current predicates enforced by the TeamSpaceAuthorizer (task 2.3);
 * this authorizer is the reusable first gate every collaboration operation runs.
 */

import { getKiroCrewResourceUrl } from '../config'
import { forbidden, reauthRequired, type CollaborationAuthorizationError } from './errors'
import {
  resolveCollaborationTokenWithAudiences,
  type GhostTokenIdentityPath
} from './token-identity'
import {
  scopeForAccess,
  type AuthenticatedSubject,
  type CollaborationAccess,
  type ValidatedTokenContext
} from './types'

export interface AuthorizeOptions {
  /** Override the required Crew collaboration resource audience (for tests). */
  resourceAudience?: string
  /** Override the GHOST_Token_Identity_Path (for tests). */
  identityPath?: GhostTokenIdentityPath
}

/**
 * The result of a successful identity/scope authorization. Authorship is fixed
 * to the stored subject; the granted scopes are carried forward so downstream
 * predicate checks (membership, containment) never re-derive identity.
 */
export interface CollaborationPrincipal {
  readonly subject: AuthenticatedSubject
  readonly access: CollaborationAccess
  readonly resourceAudience: string
  readonly tokenScopes: ReadonlySet<string>
}

function requiredAudience(options?: AuthorizeOptions): string {
  return options?.resourceAudience ?? getKiroCrewResourceUrl().href
}

/**
 * Extract the opaque bearer from an `Authorization` header value WITHOUT
 * interpreting the token itself. Only the transport framing (`Bearer <opaque>`)
 * is parsed; the captured value is forwarded unchanged to the identity path.
 */
export function extractBearerToken(authorization: string | undefined | null): string | null {
  const match = /^Bearer ([^\s]+)$/i.exec(authorization || '')
  return match ? match[1]! : null
}

/**
 * Authorize a collaboration operation from a raw `Authorization` header value.
 *
 * Returns a `CollaborationPrincipal` on success. Throws a non-disclosing
 * `CollaborationAuthorizationError`:
 *  - `reauth_required` when no bearer is present or the identity path cannot
 *    resolve the token (missing/expired/unknown identity);
 *  - `forbidden` when a valid identity lacks the Crew audience or the exact
 *    operation scope (this is where configuration-only grants land).
 */
export async function authorizeCollaboration(
  authorization: string | undefined | null,
  access: CollaborationAccess,
  options?: AuthorizeOptions
): Promise<CollaborationPrincipal> {
  const opaqueToken = extractBearerToken(authorization)
  if (!opaqueToken) throw reauthRequired()

  const resolved = await resolveCollaborationTokenWithAudiences(opaqueToken, options?.identityPath)
  if (!resolved) throw reauthRequired()

  return authorizeResolvedToken(resolved.context, resolved.audiences, access, options)
}

/**
 * Authorize an already-resolved `ValidatedTokenContext`. Separated so callers
 * that resolved the token elsewhere (e.g. middleware) reuse the exact same
 * audience + scope enforcement, and so the mandatory property test can drive the
 * conjunction directly.
 */
export function authorizeResolvedToken(
  context: ValidatedTokenContext,
  audiences: string[],
  access: CollaborationAccess,
  options?: AuthorizeOptions
): CollaborationPrincipal {
  const audience = requiredAudience(options)
  if (!audiences.includes(audience)) throw forbidden()

  const required = scopeForAccess(access)
  if (!context.tokenScopes.has(required)) throw forbidden()

  return {
    subject: context.subject,
    access,
    resourceAudience: audience,
    tokenScopes: context.tokenScopes
  }
}

/**
 * Resolves whether the current request carries separate current Administrator
 * authorization, WITHOUT the collaboration layer decoding the token or
 * interpreting bearer claims. The concrete resolver is supplied by the
 * GHOST_Admin_Service (task 4.4); it consults the existing configuration admin
 * authority (current admin group / config admin scope) through the same stored
 * identity/authorization context the GHOST_Token_Identity_Path already produced,
 * and answers only a boolean. The collaboration boundary consumes the boolean
 * and never a group id, admin list, or claim (Requirement 4.10, 24.2, 24.25).
 *
 * It is passed the already-authorized `CollaborationPrincipal` (so it can scope
 * the admin decision to the same stored subject) and the raw `Authorization`
 * header value UNCHANGED (so a resolver that re-consults the identity path is
 * handed the opaque bearer, never a decoded token).
 */
export type AdminAuthorizationResolver = (
  principal: CollaborationPrincipal,
  authorization: string | undefined | null
) => Promise<boolean> | boolean

/**
 * Separate current Administrator authorization for permanent deletion
 * (Requirement 4.10, 24.25). Holding the Collaboration_Write_Scope is NOT
 * sufficient: the caller must present, in addition, the distinct configuration
 * admin authority the GHOST_Admin_Service governs. This function models that
 * separation as an explicit conjunction and never treats a collaboration
 * principal alone as deletion authority.
 *
 * The concrete Administrator authorization check (current admin group / config
 * admin scope) is supplied by the GHOST_Admin_Service in task 4.4; here we only
 * enforce that it is required in addition to a valid collaboration principal.
 * The denial is a non-disclosing `forbidden`: it never reveals whether the
 * missing predicate was the admin authority or something about the target
 * object (Requirement 4.10, 24.2).
 */
export function assertAdminDeletionAuthority(
  principal: CollaborationPrincipal,
  hasCurrentAdministratorAuthorization: boolean
): void {
  // A collaboration principal is a precondition, but by itself it can never
  // authorize deletion — the separate current Administrator check must pass too.
  if (!hasCurrentAdministratorAuthorization) throw forbidden()
  void principal
}

export type { CollaborationAuthorizationError }
