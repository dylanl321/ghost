/**
 * TeamSpaceAuthorizer — current Team_Space authorization for collaboration.
 *
 * Feature: shared-investigations (task 2.3). Owner: Ghostv2 collaboration domain.
 *
 * `CollaborationTokenAuthorizer` (task 2.1) is the first gate: it resolves the
 * Opaque_Access_Token to a stored `AuthenticatedSubject` and enforces the Crew
 * resource audience and exact read/write scope. This module is the SECOND gate,
 * run on EVERY collaboration operation and EVERY page/content stream
 * (Requirement 4.2, 4.11, 4.12, design "Authorization": evaluated for spaces,
 * subject lookup, search, objects, Runs, Events, feeds, cursors, Checkpoints,
 * manifests, upload/download, presence — every page and content stream is
 * reauthorized).
 *
 * On every call it evaluates, as a conjunction (design "Authorization" order:
 * Tenant, current published Team_Space, current membership, route/object
 * containment, Source_Binding/source scope, Evidence_Policy):
 *
 *   1. Tenant containment       — the subject's Tenant matches the profile's
 *                                 published tenant (Requirement 4.2).
 *   2. Published Team_Space      — the space is present AND enabled in the
 *                                 CURRENT profile revision (Requirement 4.2,
 *                                 22.1). Disabled/unknown → non-disclosing
 *                                 not-found.
 *   3. Current membership        — the subject is currently in one of the
 *                                 space's published Entra group object ids,
 *                                 resolved LIVE via the protected delegation
 *                                 (task 2.2), never a grant-time snapshot
 *                                 (Requirement 4.3). Cached at most five minutes
 *                                 keyed by (tenantId, objectId, spaceId,
 *                                 profileRevision); fails closed after expiry or
 *                                 Graph failure (Requirement 4.4, 4.5, 4.6,
 *                                 24.3).
 *   4. Object containment        — an object identifier, when supplied, must
 *                                 belong to the space; unknown/foreign objects
 *                                 return a non-disclosing not-found
 *                                 (Requirement 4.7, 4.11).
 *   5. Source scope              — a Subject_Reference, when supplied, must fall
 *                                 inside the space's Source_Binding/source scope
 *                                 (Requirement 4.2). Subject-keyed presence is
 *                                 authorized against source scope even when no
 *                                 Investigation exists (design).
 *   6. Evidence_Policy           — evidence-bearing operations must reference an
 *                                 evidence class the space's Evidence_Policy
 *                                 permits (Requirement 4.2, 4.8).
 *   7. Route capability          — the route's required access maps to the
 *                                 scope the principal actually holds
 *                                 (Requirement 4.2).
 *
 * Every failed predicate throws a non-disclosing `CollaborationAuthorizationError`
 * (`not_found` for anything that would reveal object/space existence, `forbidden`
 * for a valid-but-unauthorized identity). No group object id, delegation
 * detail, policy internal, or object content is ever leaked (Requirement 4.7,
 * 24.2).
 */

import type { CollaborationPrincipal } from './authorizer'
import {
  resolveCollaborationGraphDelegation,
  type CollaborationDelegationResult,
  type CollaborationGraphDelegationRuntime
} from './delegation'
import { forbidden, notFound } from './errors'
import type {
  CollaborationSection,
  CollaborationTeamSpace
} from './profile-schema'
import { scopeForAccess, type CollaborationAccess, type SubjectReference } from './types'

/** Maximum lifetime of a cached Current_Membership result (Requirement 4.4). */
export const MEMBERSHIP_CACHE_TTL_MS = 5 * 60 * 1000

/**
 * A resolved snapshot of the CURRENT Organization_Profile the authorizer works
 * against. `revision` is the monotonic identifier of the published revision the
 * `section` came from; it is part of the membership cache key so a new profile
 * publication (which changes `revision`) invalidates every cached membership
 * result for the prior revision (Requirement 4.4 "profile invalidation", design:
 * "cached by (tenantId, objectId, spaceId, profileRevision) until the lesser of
 * five minutes or profile invalidation").
 */
export interface CurrentProfileSnapshot {
  readonly revision: string
  readonly section: CollaborationSection
}

/** Resolves the CURRENT published profile snapshot for authorization. */
export type CurrentProfileResolver = () => Promise<CurrentProfileSnapshot>

/**
 * Live current-membership query. Given the subject's Entra object id, the
 * space's published group object ids, and a delegated Graph access token, it
 * answers whether the subject is CURRENTLY a member of at least one group.
 * Production wiring performs a Microsoft Graph `checkMemberGroups`/`memberOf`
 * query; the authorizer only ever consumes the boolean answer and never a group
 * list, so no group object id is retained past this seam.
 */
export interface CurrentMembershipQuery {
  isMemberOfAny(input: {
    tenantId: string
    entraObjectId: string
    groupObjectIds: readonly string[]
    delegatedAccessToken: string
  }): Promise<boolean>
}

/**
 * An object whose containment must be checked. An operation that targets an
 * existing object (an Investigation, Run, feed cursor, Artifact manifest, etc.)
 * supplies the Team_Space the object is recorded under; the authorizer checks it
 * matches the space being authorized. A mismatch is a non-disclosing not-found
 * so a caller cannot probe which space an object lives in (Requirement 4.7).
 */
export interface ObjectContainment {
  /** The Team_Space id the target object is stored under. */
  readonly spaceId: string
}

/**
 * A single operation to authorize. `access` and `spaceId` are always required;
 * the remaining fields are supplied only when the operation targets them, and
 * each is checked for containment when present.
 */
export interface CollaborationOperation {
  /** The route capability the operation needs (Requirement 4.2). */
  readonly access: CollaborationAccess
  /** The Team_Space the operation is scoped to. */
  readonly spaceId: string
  /**
   * The object the operation targets, if any. When present its recorded space
   * must equal `spaceId` (Requirement 4.7, 4.11). Cross-space access is denied
   * without disclosing existence.
   */
  readonly object?: ObjectContainment
  /**
   * The subject the operation concerns (subject lookup, presence, subject-keyed
   * work). When present it must fall inside the space's Source_Binding/source
   * scope. Subject-keyed presence is authorized against source scope even with
   * no Investigation (design).
   */
  readonly subject?: SubjectReference
  /**
   * The evidence class the operation contributes/reads, if evidence-bearing.
   * When present it must be permitted by the space's Evidence_Policy
   * (Requirement 4.2, 4.8).
   */
  readonly evidenceClass?: string
}

/** Successful authorization result: the authorized principal + resolved space. */
export interface TeamSpaceAuthorization {
  readonly principal: CollaborationPrincipal
  readonly spaceId: string
  /** The profile revision the decision was made against. */
  readonly profileRevision: string
}

/**
 * Injectable dependencies. Production wiring supplies the real profile resolver,
 * the delegated-Graph runtime (task 2.2), a Graph membership query, and the
 * system clock; tests supply controllable fakes (notably `now` around the
 * five-minute boundary — Property 7).
 */
export interface TeamSpaceAuthorizerDeps {
  resolveCurrentProfile: CurrentProfileResolver
  membershipQuery: CurrentMembershipQuery
  /** Delegated-Graph runtime passed through to `resolveCollaborationGraphDelegation`. */
  delegationRuntime?: CollaborationGraphDelegationRuntime
  now?: () => number
}

interface CachedMembership {
  readonly isMember: boolean
  /** Epoch ms when this cached result must no longer be reused (Requirement 4.4). */
  readonly expiresAt: number
}

/**
 * Build the membership cache key. Keyed by the subject Tenant + Entra object id,
 * the Team_Space, AND the profile revision so a new publication (revision change)
 * never reuses a membership decision made against the prior published groups
 * (Requirement 4.4 profile invalidation, design cache key).
 */
function membershipCacheKey(
  tenantId: string,
  entraObjectId: string,
  spaceId: string,
  profileRevision: string
): string {
  return [tenantId, entraObjectId, spaceId, profileRevision].join('\u0000')
}

export class TeamSpaceAuthorizer {
  private readonly deps: TeamSpaceAuthorizerDeps
  private readonly now: () => number
  private readonly membershipCache = new Map<string, CachedMembership>()

  constructor(deps: TeamSpaceAuthorizerDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => Date.now())
  }

  /**
   * Authorize a single collaboration operation. Throws a non-disclosing
   * `CollaborationAuthorizationError` on any failed predicate; returns the
   * authorization on success.
   */
  async authorize(
    principal: CollaborationPrincipal,
    operation: CollaborationOperation
  ): Promise<TeamSpaceAuthorization> {
    // Route capability: the principal must actually hold the scope this route
    // requires. task 2.1 already enforced the principal's scope matched its own
    // declared access, but an operation may require write where the principal
    // authorized read — re-check here so per-operation capability is explicit
    // (Requirement 4.2).
    const requiredScope = scopeForAccess(operation.access)
    if (!principal.tokenScopes.has(requiredScope)) throw forbidden()

    const { revision, section } = await this.deps.resolveCurrentProfile()

    // Tenant containment. A subject from another Tenant can never be authorized
    // against this profile; treat it as not-found so no cross-tenant existence
    // is revealed (Requirement 4.2, 4.7).
    if (!section.enabled || section.tenantId !== principal.subject.tenantId) {
      throw notFound()
    }

    // Published Team_Space: present AND enabled in the CURRENT revision. An
    // unknown or disabled space is a non-disclosing not-found (Requirement 4.2,
    // 22.1, 4.7).
    const space = section.teamSpaces.find(candidate => candidate.spaceId === operation.spaceId)
    if (!space || !space.enabled) throw notFound()

    // Object containment: a targeted object must belong to this space. A
    // foreign/unknown object is not-found, never a distinguishable "wrong
    // space" (Requirement 4.7, 4.11).
    if (operation.object && operation.object.spaceId !== space.spaceId) {
      throw notFound()
    }

    // Source scope: a targeted Subject_Reference must fall inside one of the
    // space's Source_Binding/source scopes (Requirement 4.2). Subject-keyed
    // presence is authorized here even when no Investigation exists (design).
    if (operation.subject && !this.subjectInScope(space, operation.subject)) {
      throw notFound()
    }

    // Evidence_Policy: an evidence-bearing operation must reference a class the
    // space's Evidence_Policy permits (Requirement 4.2, 4.8). Out-of-policy
    // evidence is withheld (the Coverage_Gap surface is appended by the capture
    // layer; here we simply deny access to the class).
    if (operation.evidenceClass && !this.evidenceClassPermitted(section, space, operation.evidenceClass)) {
      throw forbidden()
    }

    // Current membership: resolved LIVE (task 2.2 delegation), cached at most
    // five minutes keyed by (tenantId, objectId, spaceId, profileRevision), and
    // fail-closed after expiry or Graph failure (Requirement 4.3-4.6, 24.3).
    const isMember = await this.resolveCurrentMembership(principal, space, revision)
    if (!isMember) throw forbidden()

    return { principal, spaceId: space.spaceId, profileRevision: revision }
  }

  /**
   * Authorize each page of a paginated read. Because authorization is re-run per
   * page, a membership change (or profile publication) between pages denies the
   * next page without returning protected records (Requirement 4.12). This is a
   * thin wrapper that makes the per-page contract explicit at call sites.
   */
  async authorizePage(
    principal: CollaborationPrincipal,
    operation: CollaborationOperation
  ): Promise<TeamSpaceAuthorization> {
    return this.authorize(principal, operation)
  }

  /**
   * Resolve whether the subject is CURRENTLY a member of the space. Reuses a
   * cached result only while it is strictly younger than five minutes AND was
   * computed against the SAME profile revision. Otherwise it resolves live and,
   * on any inability to validate (missing/revoked/insufficient/temporarily
   * unavailable delegation, or a Graph query failure), fails CLOSED — an expired
   * cache is never authorization (Requirement 4.5, 4.6, 24.3; design "An expired
   * membership cache is not authorization").
   */
  private async resolveCurrentMembership(
    principal: CollaborationPrincipal,
    space: CollaborationTeamSpace,
    profileRevision: string
  ): Promise<boolean> {
    const key = membershipCacheKey(
      principal.subject.tenantId,
      principal.subject.entraObjectId,
      space.spaceId,
      profileRevision
    )
    const now = this.now()

    const cached = this.membershipCache.get(key)
    if (cached) {
      if (now < cached.expiresAt) return cached.isMember
      // Expired: never reuse it. Drop it and re-resolve live.
      this.membershipCache.delete(key)
    }

    let delegation: CollaborationDelegationResult
    try {
      delegation = await resolveCollaborationGraphDelegation(
        principal.subject.entraObjectId,
        this.deps.delegationRuntime
      )
    } catch {
      // Delegation resolution itself faulted: fail closed, cache nothing.
      return false
    }

    if (delegation.status !== 'available') {
      // missing / revoked / insufficient / temporarily_unavailable all fail
      // closed with no grant-snapshot fallback (Requirement 4.6, 24.3). Nothing
      // is cached so a later retry re-resolves.
      return false
    }

    let isMember: boolean
    try {
      isMember = await this.deps.membershipQuery.isMemberOfAny({
        tenantId: delegation.tenantId,
        entraObjectId: principal.subject.entraObjectId,
        groupObjectIds: space.memberGroupObjectIds,
        delegatedAccessToken: delegation.accessToken
      })
    } catch {
      // A live Graph failure fails closed and is NOT cached, so it cannot be
      // reused as a positive result (Requirement 4.5, 24.3).
      return false
    }

    // Cache the live result for at most five minutes. The delegated access
    // token may itself expire sooner; we never extend membership beyond the
    // five-minute ceiling regardless (Requirement 4.4). We cache both member
    // and non-member results so a denied subject is not re-queried on every
    // request within the window, but the ceiling still bounds staleness.
    this.membershipCache.set(key, { isMember, expiresAt: now + MEMBERSHIP_CACHE_TTL_MS })
    return isMember
  }

  /**
   * True when the Subject_Reference falls inside one of the space's source
   * scopes. A scope matches when its Source_Binding matches the subject's
   * binding; when the scope narrows by stable source-side ids, the subject's
   * `stableSourceId` must be among them (profile schema `sourceScope`). The
   * mutable `displayLabel` is never consulted (Requirement 6.10).
   */
  private subjectInScope(space: CollaborationTeamSpace, subject: SubjectReference): boolean {
    return space.sourceScopes.some(scope => {
      if (scope.bindingId !== subject.sourceBindingId) return false
      if (!scope.includeStableIds || scope.includeStableIds.length === 0) return true
      return scope.includeStableIds.includes(subject.stableSourceId)
    })
  }

  /**
   * True when the space's Evidence_Policy permits the given evidence class. The
   * space references its policy by id; the policy's `permittedEvidenceClasses`
   * is the allow-list (profile schema `evidencePolicy`). An unknown policy id or
   * a class not on the list is not permitted.
   */
  private evidenceClassPermitted(
    section: CollaborationSection,
    space: CollaborationTeamSpace,
    evidenceClass: string
  ): boolean {
    const policy = section.evidencePolicies.find(candidate => candidate.policyId === space.evidencePolicyId)
    if (!policy) return false
    return (policy.permittedEvidenceClasses as readonly string[]).includes(evidenceClass)
  }

  /** Test/diagnostic seam: current number of cached membership entries. */
  cachedMembershipCount(): number {
    return this.membershipCache.size
  }
}
