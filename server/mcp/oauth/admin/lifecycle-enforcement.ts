/**
 * OAuth Administration — managed lifecycle & resource/scope policy enforcement
 * (task 8.2).
 *
 * This module is the SINGLE, shared implementation of the design lifecycle
 * matrix at the provider boundaries. Every boundary (authorization, code
 * exchange, refresh, and consent) resolves its enforcement decision through the
 * pure functions here so the matrix is implemented exactly once (design
 * "Managed policy and operation flow": "The lifecycle matrix is enforced on the
 * provider boundaries, not just in the panel").
 *
 * CRITICAL — UNMANAGED CLIENTS ARE UNCHANGED (Req 7.7, 18.2, 18.3):
 *   A client with no managed-policy extension resolves to a `null` policy
 *   ({@link readManagedPolicy} returns `null`) and EVERY function here returns
 *   an ALLOW decision with no restriction. Enforcement applies ONLY to managed
 *   clients, and only per their stored policy. There is no code path that can
 *   deny, narrow, or otherwise alter the behavior of an unmanaged dynamic
 *   client — it behaves exactly as it does today.
 *
 * WHAT THIS TASK ENFORCES NOW (issuance restrictions — no grant revocation):
 *   - Lifecycle `blocked`: deny NEW authorization and code exchange; existing
 *     access tokens and refresh continue to normal expiry (matrix "Block").
 *   - Lifecycle `retired`: deny NEW authorization, code exchange, AND refresh
 *     (matrix "Retire: access expires" — the issuance-restriction half). The
 *     revoke-grants half is task 9.
 *   - Lifecycle `deprecated`: allowed with advisory status (no denial).
 *   - Lifecycle `active`: allowed under current policy.
 *   - Resource/scope policy: a managed client cannot obtain a resource or scope
 *     outside its approved `permittedResources` / `permittedScopes` at
 *     authorization/consent (Req 7.8). Expansion beyond the approved policy
 *     requires normal user consent and is NEVER auto-granted here.
 *
 * WHAT THIS TASK DOES NOT DO (task 9 integration seam):
 *   - Selected-grant revocation, retire-with-revocation cleanup, and
 *     reduce-policy grant revocation depend on the selected-grant mechanism
 *     from task 9. This module NEVER revokes a grant. It exposes
 *     {@link isGrantRevoked}, a hook the task 9 revocation service replaces to
 *     reject a marked grant at these same boundaries. Until task 9 wires it,
 *     the hook reports "not revoked" so no grant is affected (Req 9.2 seam).
 */

import type { OAuthApplicationLifecycle } from '#shared/types/oauth-administration'
import type { ManagedPolicyExtension } from './managed-policy-service'

/** The provider boundaries the matrix is enforced at. */
export type LifecycleBoundary = 'authorize' | 'exchange' | 'refresh' | 'consent'

/** Safe, stable reason codes surfaced when a managed policy denies a boundary. */
export type LifecycleDenyReason =
  | 'client_blocked'
  | 'client_retired'
  | 'resource_not_permitted'
  | 'scope_not_permitted'
  // A grant under a selected-grant revocation marker (task 9.2). Grant-scoped,
  // not client-scoped: surfaced at the refresh issuance boundary when the
  // refresh token's grant is fenced.
  | 'grant_revoked'

/** The result of evaluating the managed lifecycle/policy at one boundary. */
export interface LifecycleDecision {
  /** True when the boundary may proceed for this (managed or unmanaged) client. */
  allowed: boolean
  /** Safe reason code when `allowed` is false. */
  reason?: LifecycleDenyReason
  /** Safe, human-readable description for logs/telemetry (never secret). */
  description?: string
}

/** A definitive allow decision (shared instance to avoid churn). */
const ALLOW: LifecycleDecision = { allowed: true }

/**
 * Which lifecycle states deny NEW authorization/code exchange for a MANAGED
 * client. `blocked` and `retired` deny; `active`/`deprecated` allow (deprecated
 * is advisory only). This is the "Authorization/code exchange" matrix column.
 */
function deniesNewIssuance(lifecycle: OAuthApplicationLifecycle): LifecycleDenyReason | undefined {
  if (lifecycle === 'blocked') return 'client_blocked'
  if (lifecycle === 'retired') return 'client_retired'
  return undefined
}

/**
 * Whether a MANAGED client's refresh is denied by lifecycle. Per the matrix a
 * `retired` client's refresh is DENIED; a `blocked` client's existing refresh
 * CONTINUES to normal expiry (only new issuance is blocked). `active`/
 * `deprecated` allow refresh.
 */
function deniesRefresh(lifecycle: OAuthApplicationLifecycle): LifecycleDenyReason | undefined {
  if (lifecycle === 'retired') return 'client_retired'
  return undefined
}

/**
 * Evaluate the managed LIFECYCLE at a boundary for a resolved policy. A `null`
 * policy (unmanaged client) is always allowed — this is the invariant that
 * keeps unmanaged clients unchanged (Req 7.7).
 *
 * - `authorize` / `exchange`: `blocked` or `retired` deny; else allow.
 * - `refresh`: `retired` denies; `blocked` allows (existing refresh continues).
 * - `consent`: same as authorize — a blocked/retired client cannot complete
 *   consent.
 */
export function evaluateLifecycle(
  policy: ManagedPolicyExtension | null,
  boundary: LifecycleBoundary
): LifecycleDecision {
  // Unmanaged client: no managed policy, no enforcement (Req 7.7, 18.2).
  if (!policy) return ALLOW

  if (boundary === 'refresh') {
    const reason = deniesRefresh(policy.lifecycle)
    if (reason) {
      return {
        allowed: false,
        reason,
        description: 'A retired managed client may not refresh tokens.'
      }
    }
    return ALLOW
  }

  // authorize / exchange / consent all use the new-issuance column.
  const reason = deniesNewIssuance(policy.lifecycle)
  if (reason) {
    return {
      allowed: false,
      reason,
      description: reason === 'client_blocked'
        ? 'A blocked managed client may not begin new authorization or exchange a code.'
        : 'A retired managed client may not begin new authorization or exchange a code.'
    }
  }
  return ALLOW
}

/**
 * Evaluate the managed RESOURCE/SCOPE policy for a requested resource + scopes.
 * A `null` policy (unmanaged client) is always allowed (Req 7.7). For a managed
 * client, a requested resource outside `permittedResources`, or any requested
 * scope outside `permittedScopes`, is rejected (Req 7.8).
 *
 * IMPORTANT (Req 7.8, matrix "Expand policy"): this rejects requests OUTSIDE the
 * approved policy. Widening the approved policy is an administrative action; a
 * user granting an already-approved scope proceeds through NORMAL consent. This
 * function never auto-grants or silently expands anything — it only permits or
 * rejects the requested set against the approved policy.
 *
 * An EMPTY approved list is treated as "no restriction recorded" for that
 * dimension, so a freshly adopted client whose approved policy mirrors its
 * current registration is not accidentally locked out. Enforcement narrows only
 * when an administrator has recorded an explicit approved set.
 */
export function evaluateResourceScopePolicy(
  policy: ManagedPolicyExtension | null,
  request: { resource?: string, scopes?: readonly string[] }
): LifecycleDecision {
  if (!policy) return ALLOW

  const requestedResource = request.resource
  if (
    requestedResource
    && policy.permittedResources.length > 0
    && !policy.permittedResources.includes(requestedResource)
  ) {
    return {
      allowed: false,
      reason: 'resource_not_permitted',
      description: 'The requested resource is outside this managed client\'s approved policy.'
    }
  }

  if (policy.permittedScopes.length > 0) {
    const requested = request.scopes || []
    const disallowed = requested.find(scope => !policy.permittedScopes.includes(scope))
    if (disallowed) {
      return {
        allowed: false,
        reason: 'scope_not_permitted',
        description: 'A requested scope is outside this managed client\'s approved policy.'
      }
    }
  }

  return ALLOW
}

/**
 * Combined boundary decision: lifecycle first, then (for authorize/consent) the
 * resource/scope policy. Returns the FIRST denial. A `null` policy short-circuits
 * to allow. This is the one call the provider boundaries make.
 */
export function evaluateBoundary(
  policy: ManagedPolicyExtension | null,
  boundary: LifecycleBoundary,
  request: { resource?: string, scopes?: readonly string[] } = {}
): LifecycleDecision {
  if (!policy) return ALLOW

  const lifecycle = evaluateLifecycle(policy, boundary)
  if (!lifecycle.allowed) return lifecycle

  // Resource/scope policy is checked where a resource/scope is chosen: at the
  // authorization request and at the consent boundary (Req 7.8). Refresh and
  // exchange reuse the already-consented grant, so they do not re-narrow scope.
  if (boundary === 'authorize' || boundary === 'consent') {
    return evaluateResourceScopePolicy(policy, request)
  }
  return ALLOW
}

/**
 * TASK 9 INTEGRATION SEAM — grant-revocation fence.
 *
 * Selected-grant revocation, retire-with-revocation, and reduce-policy grant
 * revocation are owned by task 9 (`OAuthGrantRevocationService`). Those effects
 * are NOT enabled here. This function is the single hook every opaque-token /
 * issuance boundary consults to reject a REVOKED grant while task 9's cleanup is
 * in flight (design: "Authorization, code exchange, refresh, and every
 * opaque-token consumer must reject a marked grant").
 *
 * Until task 9 replaces {@link grantRevocationFence}, this reports every grant
 * as NOT revoked, so no grant is ever affected by this task (Req 9.2 seam). The
 * block/retire ISSUANCE restrictions above are fully enforced now and do not
 * depend on this seam.
 */
export interface GrantRevocationFence {
  /** True when the given grant id is under a revocation marker/fence. */
  isRevoked(grantId: string): boolean | Promise<boolean>
}

/**
 * The active grant-revocation fence. Task 9 replaces this with its durable
 * marker-backed implementation via {@link setGrantRevocationFence}; until then
 * it is a no-op that never marks a grant revoked.
 */
let grantRevocationFence: GrantRevocationFence = {
  isRevoked: () => false
}

/**
 * Task 9 seam: install the durable grant-revocation fence. Called once by the
 * task 9 revocation service during initialization so all boundaries share the
 * same marker check without importing task 9 internals.
 */
export function setGrantRevocationFence(fence: GrantRevocationFence): void {
  grantRevocationFence = fence
}

/**
 * Consult the grant-revocation fence for a grant id. Boundaries call this to
 * reject a marked grant. Returns `false` (not revoked) until task 9 installs a
 * real fence, so no grant is affected by this task.
 */
export async function isGrantRevoked(grantId: string | undefined | null): Promise<boolean> {
  if (!grantId) return false
  return Boolean(await grantRevocationFence.isRevoked(grantId))
}
