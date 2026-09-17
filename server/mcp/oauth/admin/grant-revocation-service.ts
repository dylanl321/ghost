/**
 * OAuth Administration — selected-grant revocation, issuance fencing, and
 * idempotent cleanup/reconciliation (task 9.1).
 *
 * `OAuthGrantRevocationService` is the action-specific layer that plugs its
 * effect into {@link OAuthAdminOperationService.run} for the `grant.revoke`
 * operation type (design "Managed policy and operation flow"; component table
 * row `OAuthGrantRevocationService`). The operation service owns the durable,
 * idempotent, revision-checked, audited lifecycle; this module owns only the
 * grant-specific preview, the durable revocation MARKER + issuance/revocation
 * FENCE, the provider/model cleanup, and the reconciliation that finalizes a
 * `verifying` operation.
 *
 * DESIGN (design "Managed policy and operation flow", selected-grant paragraph):
 *   "A selected-grant revocation first commits a durable provider-side
 *    revocation marker and issuance/revocation fence. Authorization, code
 *    exchange, refresh, and every opaque-token consumer must reject a marked
 *    grant while credentials/indexes are being cleaned up. Cleanup then deletes
 *    associated authorization codes, access tokens, refresh tokens, and the
 *    grant through supported adapter/model operations and remains `verifying`
 *    until consistency conditions are met. The selected grant is the only
 *    target unless a separately previewed lifecycle operation explicitly lists
 *    more grants."
 *
 * ORDER OF EFFECTS (the invariant this task enforces):
 *   1. reserve durable operation intent (operation service; BEFORE any effect)
 *   2. commit the durable revocation MARKER for the selected grant — the fence
 *      immediately reports `isGrantRevoked(grantId) === true` so authorization,
 *      code exchange, refresh, and every opaque-token consumer reject the grant
 *      (the token-verifier already consults {@link isGrantRevoked}; task 9.2
 *      wires the same fence into more consumers).
 *   3. cleanup: delete the grant's authorization codes / access tokens / refresh
 *      tokens via `adapter.revokeByGrantId(grantId)` and destroy the grant via
 *      the provider Grant model — targeting ONLY the selected grant.
 *   4. stay `verifying` until reconcile confirms the marker is committed and no
 *      provider artifacts remain for the grant, then `markVerified`.
 *
 * SAFETY:
 *   - NO raw browser tokens anywhere (Req 9.2). The target is a `grantReference`
 *     resolved from the grant projection/provider; the browser never supplies a
 *     token, code, or credential.
 *   - ONLY the selected grant and its credentials are touched (Req 9.2, 9.6).
 *     `revokeByGrantId` filters by `GrantIdIndex` on the exact grant id and the
 *     Grant destroy targets the exact id; no unrelated grant is affected.
 *   - Idempotent: a retry with the same idempotency key + request fingerprint
 *     reconciles the existing operation rather than re-running cleanup, and the
 *     marker commit / cleanup are themselves idempotent, so a retry never
 *     affects an additional grant (Req 9.6, 13.3).
 *   - The Graph-delegation last-live-grant decision is TASK 9.3 (a seam here);
 *     provider-wide marker application beyond the token-verifier is TASK 9.2
 *     (the fence installed here is what 9.2 wires into more consumers).
 */

import type Provider from 'oidc-provider'
import type {
  IsoDateTime,
  OAuthGrantSummary,
  OAuthRevokeGrantRequest,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRepository } from './types'
import { oauthAdminErrors } from './access-service'
import {
  OAuthAdminOperationService,
  computeRequestFingerprint,
  type EffectOutcome
} from './operation-service'
import { setGrantRevocationFence, type GrantRevocationFence } from './lifecycle-enforcement'
import { DynamoOidcAdapter } from '../adapter'
import { getOAuthProvider } from '../provider'
import { getItem, putItem } from '../../../utils/dynamodb'
import { getOAuthAdminTableConfig, useDurableOAuthAdminStore } from '../../config'

/**
 * A durable revocation MARKER for a single grant. Persisted BEFORE cleanup so
 * the fence rejects the grant while credentials/indexes are being cleaned up.
 * Carries no secret material — only the grant reference, the marking actor, and
 * timestamps used by reconciliation. Markers persist per enforcement state (not
 * the 90-day telemetry window): a grant stays fenced until its cleanup is
 * confirmed and the marker itself remains as durable evidence the grant is
 * revoked (design "revocation markers ... persist according to
 * provider/enforcement state").
 */
export interface OAuthGrantRevocationMarker {
  grantReference: OpaqueReference
  /** ISO time the marker was committed (fence became active). */
  markedAt: IsoDateTime
  /** Safe, opaque actor reference that committed the marker. */
  markedBy: OpaqueReference
  /** Operation id that owns this marker (for reconciliation). */
  operationId: OpaqueReference
  /** ISO time cleanup was confirmed complete, when known. */
  cleanupConfirmedAt?: IsoDateTime
}

/**
 * Durable store for grant revocation markers, keyed by grant reference. The
 * fence reads it synchronously via an in-process cache seeded from durable
 * reads; the operation service commits it before cleanup. Two implementations:
 * a DynamoDB-backed durable store (isolated within the OAuth administration
 * table partition) and an in-memory store for tests / memory-only deployments.
 */
export interface OAuthGrantRevocationMarkerStore {
  /** Commit (idempotently) the durable marker for a grant. */
  put(marker: OAuthGrantRevocationMarker): Promise<void>
  /** Read the durable marker for a grant, or null when not marked. */
  get(grantReference: OpaqueReference): Promise<OAuthGrantRevocationMarker | null>
  /** True when a marker exists (fence check). May consult a warm cache. */
  isMarked(grantReference: OpaqueReference): boolean | Promise<boolean>
}

/**
 * In-memory revocation marker store. Used by tests and a memory-only
 * deployment; the fence check is synchronous against the same map.
 */
export class InMemoryGrantRevocationMarkerStore implements OAuthGrantRevocationMarkerStore {
  private readonly markers = new Map<string, OAuthGrantRevocationMarker>()

  async put(marker: OAuthGrantRevocationMarker): Promise<void> {
    // Idempotent commit: a re-commit preserves the original markedAt so retries
    // do not disturb the fence's activation time.
    const existing = this.markers.get(marker.grantReference)
    this.markers.set(marker.grantReference, {
      ...marker,
      markedAt: existing?.markedAt || marker.markedAt
    })
  }

  async get(grantReference: OpaqueReference): Promise<OAuthGrantRevocationMarker | null> {
    return this.markers.get(grantReference) ?? null
  }

  isMarked(grantReference: OpaqueReference): boolean {
    return this.markers.has(grantReference)
  }

  /** Test helper: clear all markers. */
  clear(): void {
    this.markers.clear()
  }
}

/**
 * DynamoDB-backed durable revocation marker store. Persists a marker row in the
 * OAuth administration table under a dedicated `grant-markers` kind, isolated
 * from the provider artifact table. Keeps a warm in-process set so the fence
 * check stays synchronous on the hot path after the first durable read; the
 * durable row is authoritative on a cold start / cross-process check.
 */
export class DynamoGrantRevocationMarkerStore implements OAuthGrantRevocationMarkerStore {
  private readonly warm = new Set<string>()

  constructor(
    private readonly tableConfig: () => { tableName: string, environment: 'commercial' | 'govcloud', accountId?: string },
    private readonly deps = { putItem, getItem }
  ) {}

  private key(grantReference: OpaqueReference) {
    return { artifactId: `oauth-admin#grant-markers#${grantReference}` }
  }

  async put(marker: OAuthGrantRevocationMarker): Promise<void> {
    const config = this.tableConfig()
    await this.deps.putItem(
      config.tableName,
      { ...this.key(marker.grantReference), kind: 'grant-markers', ...marker },
      config.environment,
      config.accountId
    )
    this.warm.add(marker.grantReference)
  }

  async get(grantReference: OpaqueReference): Promise<OAuthGrantRevocationMarker | null> {
    const config = this.tableConfig()
    const row = await this.deps.getItem(config.tableName, this.key(grantReference), config.environment, config.accountId)
    if (!row) return null
    this.warm.add(grantReference)
    return {
      grantReference: row.grantReference,
      markedAt: row.markedAt,
      markedBy: row.markedBy,
      operationId: row.operationId,
      cleanupConfirmedAt: row.cleanupConfirmedAt
    }
  }

  isMarked(grantReference: OpaqueReference): boolean | Promise<boolean> {
    if (this.warm.has(grantReference)) return true
    // Cold: consult the durable row and warm the cache for subsequent checks.
    return this.get(grantReference).then(marker => marker !== null)
  }
}

/**
 * The credential impact a revocation WOULD have, surfaced in the preview so the
 * administrator sees what will be cleaned up before confirming (Req 9.1). These
 * are counts/flags derived from the projection — never raw tokens.
 */
export interface OAuthGrantCredentialImpact {
  /** Whether the grant currently has an MCP/Crew resource association. */
  hasResource: boolean
  /** Consented scopes that would be revoked with the grant. */
  consentedScopes: string[]
  /** Requested scopes recorded for the grant (kept distinct from consented). */
  requestedScopes: string[]
  /**
   * Whether cleanup will target associated authorization codes, access tokens,
   * and refresh tokens for the grant. Always true for a live grant (the adapter
   * revokes by grant id); surfaced so the impact is explicit in the preview.
   */
  revokesAssociatedCredentials: boolean
}

/** The SAFE preview of a selected-grant revocation, returned WITHOUT applying it. */
export interface OAuthGrantRevocationPreview {
  grantReference: OpaqueReference
  clientReference: OpaqueReference
  /** The authorized subject reference (present per the projection's coverage). */
  subjectReference?: OpaqueReference
  /** Subject display, present only when the projection carries it. */
  subjectDisplay?: string
  /** Affected resource (single-resource grant), when known. */
  resource?: string
  /** Credential impact the revocation would have. */
  credentialImpact: OAuthGrantCredentialImpact
  /** A reason is REQUIRED at execute time (Req 9.1). */
  reasonRequired: true
  /** Whether the grant is already under a revocation marker (idempotent view). */
  alreadyMarked: boolean
}

/** Distinct evidence surfaced when reporting a revocation (Req 9.4). */
export interface OAuthGrantRevocationResult {
  operationId: OpaqueReference
  grantReference: OpaqueReference
  /** Operation lifecycle state: `verifying` until reconcile confirms cleanup. */
  state: 'verifying' | 'completed' | 'failed'
  /** True once the durable marker is committed (fence active). */
  markerCommitted: boolean
  /** True once provider cleanup has been confirmed by reconciliation. */
  cleanupConfirmed: boolean
}

/**
 * Minimal provider Grant model surface used for cleanup. `find` is used by
 * reconciliation to confirm the grant artifact is gone; `adapter.destroy`
 * targets the exact grant id.
 */
interface ProviderGrantModel {
  adapter: { find(id: string): Promise<Record<string, unknown> | undefined>, destroy(id: string): Promise<void> }
}

/** A minimal adapter surface for grant-id-scoped credential cleanup. */
export interface GrantCredentialAdapter {
  revokeByGrantId(grantId: string): Promise<void>
}

/**
 * The selected-grant revocation service. Constructed with an injected
 * repository, marker store, operation service, provider accessor, and adapter
 * factory so tests exercise the full lifecycle against in-memory fixtures with
 * NO live DynamoDB / provider.
 */
export class OAuthGrantRevocationService {
  private fenceInstalled = false

  constructor(
    private readonly repository: OAuthAdminRepository,
    private readonly markerStore: OAuthGrantRevocationMarkerStore = new InMemoryGrantRevocationMarkerStore(),
    private readonly operations: OAuthAdminOperationService = new OAuthAdminOperationService(repository),
    private readonly providerAccessor: () => Promise<Provider> = getOAuthProvider,
    private readonly adapterFactory: (model: string) => GrantCredentialAdapter = model => new DynamoOidcAdapter(model),
    private readonly now: () => number = Date.now
  ) {}

  private isoNow(): IsoDateTime {
    return new Date(this.now()).toISOString()
  }

  /**
   * Install this service's durable marker store as the shared grant-revocation
   * fence (task 9.1 seam fill). After this, {@link isGrantRevoked} returns true
   * for any marked grant, so the token-verifier (and, once task 9.2 wires them,
   * every other opaque-token consumer) rejects a marked grant. Idempotent.
   */
  installFence(): void {
    if (this.fenceInstalled) return
    const fence: GrantRevocationFence = {
      isRevoked: (grantId: string) => this.markerStore.isMarked(grantId)
    }
    setGrantRevocationFence(fence)
    this.fenceInstalled = true
  }

  /**
   * Load the grant projection for a reference or throw a typed 404. The
   * projection is the READ source for preview/cleanup targeting; the browser
   * never supplies a raw token (Req 9.2).
   */
  private async loadGrant(access: OAuthAdminAccessContext, grantReference: OpaqueReference): Promise<OAuthGrantSummary> {
    const grant = await this.repository.getGrant(access.deployment, grantReference)
    if (!grant) {
      throw oauthAdminErrors.notFound({
        message: 'No grant exists for this reference.',
        data: { reason: 'GRANT_NOT_FOUND', grantReference }
      })
    }
    return grant
  }

  /**
   * Preview the selected-grant revocation: the user (subject reference), client,
   * affected resources/scopes, and credential impact, WITHOUT applying anything
   * (Req 9.1). Reads exclusively from the grant projection; accepts NO raw token
   * from the browser (Req 9.2).
   */
  async preview(
    access: OAuthAdminAccessContext,
    grantReference: OpaqueReference
  ): Promise<OAuthGrantRevocationPreview> {
    const grant = await this.loadGrant(access, grantReference)
    const alreadyMarked = Boolean(await this.markerStore.get(grantReference))
    return {
      grantReference: grant.grantReference,
      clientReference: grant.clientReference,
      subjectReference: grant.subjectReference,
      subjectDisplay: grant.subjectDisplay,
      resource: grant.resource,
      credentialImpact: {
        hasResource: Boolean(grant.resource),
        consentedScopes: [...grant.consentedScopes],
        requestedScopes: [...grant.requestedScopes],
        revokesAssociatedCredentials: true
      },
      reasonRequired: true,
      alreadyMarked
    }
  }

  /**
   * Revoke the selected grant. Runs through {@link OAuthAdminOperationService.run}
   * (`grant.revoke`, reason, expectedRevision, idempotency), which reserves
   * durable intent BEFORE effects. The effect:
   *   1. commits the durable revocation MARKER (fence active), THEN
   *   2. cleans up ONLY the selected grant's credentials + the grant itself, THEN
   *   3. returns `verifying` — the operation stays pending verification until
   *      {@link reconcile} confirms the marker + cleanup (Req 9.5).
   *
   * A reason is required (enforced up front). An idempotent retry reconciles the
   * existing operation and never affects an additional grant (Req 9.6).
   */
  async revoke(
    access: OAuthAdminAccessContext,
    request: OAuthRevokeGrantRequest,
    grantReference: OpaqueReference
  ): Promise<OAuthGrantRevocationResult> {
    if (typeof request.reason !== 'string' || request.reason.trim().length === 0) {
      throw oauthAdminErrors.badRequest({
        message: 'A reason is required to revoke a grant.',
        data: { reason: 'REASON_REQUIRED' }
      })
    }
    // Resolve the grant up front so an unknown reference fails before reserving
    // durable intent, and so the fingerprint binds to the resolved target.
    const grant = await this.loadGrant(access, grantReference)
    const reason = request.reason.trim()

    const requestFingerprint = computeRequestFingerprint('grant.revoke', {
      grantReference: grant.grantReference,
      expectedRevision: request.expectedRevision
    })

    const operation = await this.operations.run(
      access,
      {
        type: 'grant.revoke',
        idempotencyKey: request.idempotencyKey,
        requestFingerprint,
        // ONLY the selected grant is a target (Req 9.2, 9.6).
        targetReferences: [grant.grantReference],
        expectedRevision: request.expectedRevision,
        reason
      },
      async (operation): Promise<EffectOutcome> => {
        // 1) Commit the durable marker BEFORE cleanup so the fence rejects the
        //    grant while credentials/indexes are being cleaned up (design).
        await this.markerStore.put({
          grantReference: grant.grantReference,
          markedAt: this.isoNow(),
          markedBy: access.actor,
          operationId: operation.operationId
        })

        // 2) Cleanup: delete the grant's authorization codes / access tokens /
        //    refresh tokens, then destroy the grant — targeting ONLY this grant.
        await this.cleanupGrantArtifacts(grant.grantReference)

        // 3) Remain `verifying` until reconcile confirms consistency (Req 9.5).
        return {
          state: 'verifying',
          result: {
            grantReference: grant.grantReference,
            clientReference: grant.clientReference,
            markerCommitted: true
          },
          changedFields: ['grantRevoked'],
          before: { grantRevoked: false },
          after: { grantRevoked: true },
          evidence: { markerCommitted: true, cleanupInitiated: true }
        }
      }
    )

    const markerCommitted = Boolean(await this.markerStore.get(grant.grantReference))
    return {
      operationId: operation.operationId,
      grantReference: grant.grantReference,
      state: operation.state === 'completed' ? 'completed' : operation.state === 'failed' ? 'failed' : 'verifying',
      markerCommitted,
      cleanupConfirmed: operation.state === 'completed'
    }
  }

  /**
   * Reconcile a `verifying` grant.revoke operation: re-check the enforcement +
   * cleanup conditions and finalize `verifying`→`completed` when satisfied. Safe
   * to run repeatedly (idempotent) and after a crash/restart — it re-drives the
   * marker commit and cleanup before confirming, so an interrupted revocation
   * completes without ever affecting another grant (Req 9.5, 9.6, 13.5).
   */
  async reconcile(
    access: OAuthAdminAccessContext,
    operationId: OpaqueReference
  ): Promise<OAuthGrantRevocationResult> {
    const operation = await this.operations.get(access, operationId)
    if (!operation) {
      throw oauthAdminErrors.notFound({
        message: 'No operation exists for this reference.',
        data: { reason: 'OPERATION_NOT_FOUND', operationId }
      })
    }
    if (operation.type !== 'grant.revoke') {
      throw oauthAdminErrors.badRequest({
        message: 'This operation is not a grant revocation.',
        data: { reason: 'NOT_A_REVOCATION', operationId }
      })
    }

    const grantReference = operation.targetReferences[0]
    if (!grantReference) {
      throw oauthAdminErrors.badRequest({
        message: 'The revocation operation has no target grant.',
        data: { reason: 'MISSING_TARGET', operationId }
      })
    }

    // Ensure the marker is committed (idempotent) and cleanup has run, then
    // confirm no provider artifacts remain for the grant.
    let marker = await this.markerStore.get(grantReference)
    if (!marker) {
      await this.markerStore.put({
        grantReference,
        markedAt: this.isoNow(),
        markedBy: operation.actor,
        operationId
      })
      marker = await this.markerStore.get(grantReference)
    }
    // Re-drive cleanup (idempotent: deleting already-deleted artifacts is a
    // no-op) so an interrupted revocation converges.
    await this.cleanupGrantArtifacts(grantReference)
    const cleanupConfirmed = await this.isCleanupComplete(grantReference)

    if (operation.state === 'verifying' && cleanupConfirmed) {
      const verified = await this.operations.markVerified(access, operation, {
        markerCommitted: Boolean(marker),
        cleanupConfirmed: true,
        confirmedAt: this.isoNow()
      })
      // Record cleanup confirmation on the durable marker.
      if (marker) {
        await this.markerStore.put({ ...marker, cleanupConfirmedAt: this.isoNow() })
      }
      return {
        operationId,
        grantReference,
        state: verified.state === 'completed' ? 'completed' : 'verifying',
        markerCommitted: Boolean(marker),
        cleanupConfirmed: true
      }
    }

    return {
      operationId,
      grantReference,
      state: operation.state === 'completed' ? 'completed' : operation.state === 'failed' ? 'failed' : 'verifying',
      markerCommitted: Boolean(marker),
      cleanupConfirmed
    }
  }

  /**
   * Delete the selected grant's associated authorization codes, access tokens,
   * and refresh tokens via the grant-id-scoped adapter, then destroy the grant
   * artifact via the provider Grant model. Targets ONLY the given grant id
   * (Req 9.2, 9.6). Idempotent: deleting already-absent artifacts is a no-op.
   */
  private async cleanupGrantArtifacts(grantReference: OpaqueReference): Promise<void> {
    // Grant-id-indexed credential cleanup (access/refresh tokens, codes, etc.).
    // The adapter model name is irrelevant for a GrantIdIndex query, but a Grant
    // adapter is the natural home for grant-scoped revocation.
    const adapter = this.adapterFactory('Grant')
    await adapter.revokeByGrantId(grantReference)

    // Destroy the grant artifact itself through the provider Grant model.
    const provider = await this.providerAccessor()
    const grantModel = (provider as unknown as { Grant?: ProviderGrantModel }).Grant
    if (grantModel?.adapter?.destroy) {
      await grantModel.adapter.destroy(grantReference)
    }
  }

  /**
   * Confirm cleanup is complete: the marker is committed AND no provider Grant
   * artifact remains for the reference. Used by reconciliation to finalize
   * `verifying`→`completed` only once the enforcement + cleanup conditions hold
   * (Req 9.5).
   */
  private async isCleanupComplete(grantReference: OpaqueReference): Promise<boolean> {
    const marked = Boolean(await this.markerStore.get(grantReference))
    if (!marked) return false
    const provider = await this.providerAccessor()
    const grantModel = (provider as unknown as { Grant?: ProviderGrantModel }).Grant
    if (grantModel?.adapter?.find) {
      const remaining = await grantModel.adapter.find(grantReference)
      if (remaining) return false
    }
    return true
  }

}

/**
 * Build the durable marker store for the current deployment. Durable DynamoDB
 * store when an administration table is configured; otherwise a shared
 * in-memory store (a memory-only deployment fences within the process).
 */
let sharedMemoryMarkerStore: InMemoryGrantRevocationMarkerStore | undefined

export function getGrantRevocationMarkerStore(useDurable: boolean): OAuthGrantRevocationMarkerStore {
  if (useDurable) {
    return new DynamoGrantRevocationMarkerStore(() => getOAuthAdminTableConfig())
  }
  if (!sharedMemoryMarkerStore) sharedMemoryMarkerStore = new InMemoryGrantRevocationMarkerStore()
  return sharedMemoryMarkerStore
}

/**
 * TASK 9.2 — install the deployment's marker-backed grant-revocation fence once,
 * at server startup, BEFORE any request is served.
 *
 * This is the single startup seam that makes {@link isGrantRevoked} marker-backed
 * in the running app so every opaque-token consumer / issuance boundary rejects a
 * marked (revoked) grant (design "Managed policy and operation flow":
 * "Authorization, code exchange, refresh, and every opaque-token consumer must
 * reject a marked grant"). It wires the SAME durable marker store the revocation
 * service commits to — via {@link getGrantRevocationMarkerStore} keyed on
 * {@link useDurableOAuthAdminStore} — so the fence and the service agree on which
 * grants are marked. A memory-only deployment installs the shared in-memory
 * store (the process-local fence).
 *
 * IDEMPOTENT & SAFE (Req 9.2, 18.2):
 *   - Installing again is a no-op after the first call (guarded by module state),
 *     so a repeated plugin/init invocation never rebinds or double-installs.
 *   - The fence only ever consults the marker store. For an UNMARKED grant the
 *     store returns false and {@link isGrantRevoked} returns false, so an
 *     unmanaged/unmarked grant behaves EXACTLY as today. This installer never
 *     marks a grant — only the revocation service does.
 *
 * Fail-safe on read error: the durable {@link DynamoGrantRevocationMarkerStore}
 * only reports a grant marked on a warm hit or a positive durable read; a read
 * that throws propagates through {@link isGrantRevoked} and is handled by each
 * consumer's own error path (the token-verifier already treats an inability to
 * resolve as an invalid token). No consumer wrongly rejects a valid grant merely
 * because the marker store is empty.
 */
let grantRevocationFenceInstalled = false

export function installGrantRevocationFence(
  markerStore: OAuthGrantRevocationMarkerStore = getGrantRevocationMarkerStore(useDurableOAuthAdminStore())
): void {
  if (grantRevocationFenceInstalled) return
  const fence: GrantRevocationFence = {
    isRevoked: (grantId: string) => markerStore.isMarked(grantId)
  }
  setGrantRevocationFence(fence)
  grantRevocationFenceInstalled = true
}

/**
 * Test-only reset of the install guard so a suite can re-install a fresh fence.
 * Not used on the request/startup path.
 */
export function resetGrantRevocationFenceInstallForTests(): void {
  grantRevocationFenceInstalled = false
}
