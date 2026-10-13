/**
 * OAuth Administration — managed client-policy metadata, adoption,
 * revision-checked edits, and lifecycle operation previews (task 8.1).
 *
 * `OAuthManagedPolicyService` is the action-specific layer that plugs its
 * effects into {@link OAuthAdminOperationService.run} for the `application.adopt`
 * and `application.update` operation types (design "Managed policy and operation
 * flow"; component table row `OAuthManagedPolicyService`). The operation service
 * owns the durable, idempotent, revision-checked, audited lifecycle; this module
 * owns only:
 *
 *   1. Managed client-policy metadata — how managed lifecycle + approved
 *      resource/scope policy + accountable ownership are stored and read.
 *   2. Adoption — attach managed policy to an existing (unmanaged, dynamic)
 *      client WITHOUT changing its credentials or behavior.
 *   3. Revision-checked edits — ownership/metadata transfer and redirect edits.
 *   4. Lifecycle previews — the SAFE described effect of a lifecycle action per
 *      the design lifecycle matrix, WITHOUT applying it (enforcement is 8.2 and
 *      grant revocation is task 9).
 *
 * STORAGE APPROACH (design "Managed policy and operation flow": "Store managed
 * lifecycle and approved resource/scope policy in supported provider client
 * metadata extensions; their projection is a read model."):
 *   - Managed policy is stored on the SUPPORTED provider Client metadata under a
 *     single namespaced extension field, {@link MANAGED_POLICY_METADATA_KEY}
 *     (`ghost_managed_policy`). `oidc-provider` preserves unrecognized client
 *     metadata fields (it does not strip extra keys), so this rides along the
 *     same `new provider.Client(metadata)` + `adapter.upsert` path task 7.2 uses
 *     for creation. The admin projection ({@link OAuthApplicationDetail}) remains
 *     the READ MODEL.
 *   - An UNMANAGED dynamic client carries NO extension field, so it stays
 *     `origin: 'dynamic'`, `lifecycle: 'unassigned'`, and keeps its exact current
 *     metadata / behavior / credentials until an explicit adoption (Req 5.2, 7.7).
 *
 * SAFETY:
 *   - Ownership is accountable contact metadata only and NEVER changes a user's
 *     permissions (Req 7.1). It lives in the managed extension + projection, not
 *     in any provider authorization decision.
 *   - Registration access credentials cannot alter admin-only policy: the policy
 *     extension is written only through this admin path, guarded by the operation
 *     service's capability/revision/audit machinery.
 *   - Redirect edits reuse creation-grade validation (reject wildcard/unsupported
 *     scheme/fragment, preserve loopback) and apply prospectively without
 *     silently revoking unrelated grants (Req 7.6).
 *   - Previews are pure/read-only descriptions; they never mutate provider state
 *     (Req 7.2, 7.8).
 */

import type Provider from 'oidc-provider'
import type {
  IsoDateTime,
  OAuthApplicationDetail,
  OAuthApplicationLifecycle,
  OAuthApplicationOwnership,
  OAuthDeploymentContext,
  OAuthLifecycleAction,
  OAuthUpdateApplicationRequest,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRepository, OAuthProviderArtifactReader } from './types'
import { oauthAdminErrors } from './access-service'
import { oauthAdminRedactor } from './redactor'
import {
  OAuthAdminOperationService,
  computeRequestFingerprint,
  type EffectOutcome
} from './operation-service'
import { mapClientArtifact } from './projection-mappers'
import { oauthProviderArtifactReader } from './provider-artifact-reader'
import { getOAuthProvider } from '../provider'

/**
 * The namespaced client-metadata extension key the managed policy is stored
 * under on the provider Client. A dynamic client without this key is unmanaged.
 */
export const MANAGED_POLICY_METADATA_KEY = 'ghost_managed_policy'

/** Current schema version of the stored managed-policy extension payload. */
export const MANAGED_POLICY_VERSION = 1

/** Bounds mirroring the creation service so edits stay within the same limits. */
const MAX_TEXT_LENGTH = 200
const MAX_REDIRECT_URIS = 10

/** Redirect URI schemes a native public client may register (matches creation). */
const ALLOWED_REDIRECT_SCHEMES = new Set(['https:', 'http:'])

/**
 * The managed-policy extension payload persisted on the provider Client under
 * {@link MANAGED_POLICY_METADATA_KEY}. This is the authoritative record of
 * administrator-owned policy; the projection is derived from it. It carries NO
 * secret material — only accountable ownership, managed lifecycle, and the
 * approved resource/scope policy.
 */
export interface ManagedPolicyExtension {
  version: number
  /** Managed lifecycle state (never `unassigned` once adopted). */
  lifecycle: Exclude<OAuthApplicationLifecycle, 'unassigned'>
  ownership: OAuthApplicationOwnership
  /** Approved resource policy (subset of the deployment's configured resources). */
  permittedResources: string[]
  /** Approved scope policy (subset of the deployment's supported scopes). */
  permittedScopes: string[]
  /** ISO time the client was adopted into management. */
  adoptedAt: IsoDateTime
  /** ISO time the policy was last edited. */
  updatedAt: IsoDateTime
}

/** A single row of the lifecycle matrix, describing the SAFE effect of an action. */
export interface LifecycleMatrixEffect {
  /** Effect on new authorization / code exchange. */
  authorizationCodeExchange: string
  /** Effect on existing access tokens. */
  existingAccessTokens: string
  /** Effect on refresh and grants. */
  refreshGrants: string
}

/**
 * The design lifecycle matrix (design "Managed policy and operation flow"). This
 * is the single source of truth the preview describes; enforcement (task 8.2)
 * and grant revocation (task 9) act on the same matrix at provider boundaries.
 */
export const LIFECYCLE_MATRIX: Record<OAuthLifecycleAction, LifecycleMatrixEffect> = {
  deprecate: {
    authorizationCodeExchange: 'Allowed with advisory status',
    existingAccessTokens: 'Unchanged',
    refreshGrants: 'Unchanged'
  },
  block: {
    authorizationCodeExchange: 'Denied, including pending code exchange',
    existingAccessTokens: 'Continue to normal expiry',
    refreshGrants: 'Continue to normal expiry unless explicitly revoked'
  },
  reactivate: {
    authorizationCodeExchange: 'Allowed under current policy',
    existingAccessTokens: 'Unchanged',
    refreshGrants: 'Deleted grants are not restored'
  },
  'retire-access-expires': {
    authorizationCodeExchange: 'Denied',
    existingAccessTokens: 'Continue to normal expiry',
    refreshGrants: 'Refresh denied; grant history retained'
  },
  'retire-revoke-grants': {
    authorizationCodeExchange: 'Denied',
    existingAccessTokens: 'Rejected by grant enforcement/cleanup',
    refreshGrants: 'Associated grants/credentials revoked'
  },
  'reduce-policy': {
    authorizationCodeExchange: 'New restriction enforced',
    existingAccessTokens: 'Affected grants revoked after preview',
    refreshGrants: 'Affected grants revoked; later expansion requires normal consent'
  },
  'expand-policy': {
    authorizationCodeExchange: 'Newly requested scope may proceed',
    existingAccessTokens: 'Existing scopes unchanged',
    refreshGrants: 'User must grant additional scope through normal consent'
  },
  'redirect-edit': {
    authorizationCodeExchange: 'New redirect policy applies prospectively',
    existingAccessTokens: 'Unchanged',
    refreshGrants: 'Existing grants unchanged'
  },
  'metadata-owner-transfer': {
    authorizationCodeExchange: 'New redirect policy applies prospectively',
    existingAccessTokens: 'Unchanged',
    refreshGrants: 'Existing grants unchanged'
  }
}

/**
 * The SAFE described effect of a lifecycle action, returned by
 * {@link OAuthManagedPolicyService.preview} WITHOUT applying it.
 */
export interface LifecyclePreview {
  clientId: OpaqueReference
  action: OAuthLifecycleAction
  /** Managed lifecycle state the action would transition to, when applicable. */
  resultingLifecycle?: OAuthApplicationLifecycle
  /** The matrix row describing the effect at each provider boundary. */
  effect: LifecycleMatrixEffect
  /**
   * How many existing grants WOULD be affected by a grant-affecting action
   * (`reduce-policy` / `retire-revoke-grants`). Null when coverage is
   * incomplete so it is never reported as a confident zero. Undefined for
   * actions that do not touch grants.
   */
  affectedGrantCount?: number | null
  /** Whether this action requires the grant mechanism (task 9) to enforce. */
  requiresGrantMechanism: boolean
  /** Whether this preview describes an enforcement change vs advisory only. */
  advisoryOnly: boolean
  /** Human-readable, safe summary lines. */
  notes: string[]
}

/** Map a lifecycle action to the managed lifecycle state it transitions to. */
function lifecycleForAction(action: OAuthLifecycleAction): OAuthApplicationLifecycle | undefined {
  switch (action) {
    case 'deprecate': return 'deprecated'
    case 'block': return 'blocked'
    case 'reactivate': return 'active'
    case 'retire-access-expires':
    case 'retire-revoke-grants': return 'retired'
    // reduce/expand/redirect/owner transfer do not change the lifecycle state.
    default: return undefined
  }
}

/** Which actions are state transitions this task can apply as managed-policy edits. */
const APPLICABLE_STATE_TRANSITIONS = new Set<OAuthLifecycleAction>(['deprecate', 'block', 'reactivate'])

/** Which actions require the grant mechanism (task 9) before they can enforce. */
const GRANT_AFFECTING_ACTIONS = new Set<OAuthLifecycleAction>(['reduce-policy', 'retire-revoke-grants'])

function requireText(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw oauthAdminErrors.badRequest({ message: `Missing required field: ${field}`, data: { field } })
  }
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    throw oauthAdminErrors.badRequest({ message: `Field must not be empty: ${field}`, data: { field } })
  }
  if (trimmed.length > MAX_TEXT_LENGTH) {
    throw oauthAdminErrors.badRequest({ message: `Field is too long: ${field}`, data: { field } })
  }
  return trimmed
}

function optionalText(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requireText(value, field)
}

/** Normalize accountable ownership metadata (owner required, team/purpose optional). */
export function normalizeOwnership(ownership: OAuthApplicationOwnership | undefined): OAuthApplicationOwnership {
  const owner = requireText(ownership?.owner, 'ownership.owner')
  const team = optionalText(ownership?.team, 'ownership.team')
  const purpose = optionalText(ownership?.purpose, 'ownership.purpose')
  return { owner, ...(team ? { team } : {}), ...(purpose ? { purpose } : {}) }
}

/**
 * Validate & normalize a single redirect URI for a native public client. Reuses
 * the exact creation rules: reject wildcards / unsupported schemes / fragments /
 * malformed URIs, and PRESERVE native loopback addresses (Req 7.6).
 */
export function normalizeRedirectUri(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'Redirect URI must be a non-empty string',
      data: { reason: 'INVALID_REDIRECT' }
    })
  }
  const uri = raw.trim()
  if (uri.includes('*')) {
    throw oauthAdminErrors.badRequest({
      message: 'Wildcard redirect URIs are not permitted',
      data: { reason: 'WILDCARD_REDIRECT', redirectUri: uri }
    })
  }
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw oauthAdminErrors.badRequest({
      message: 'Redirect URI is not a valid absolute URI',
      data: { reason: 'MALFORMED_REDIRECT', redirectUri: uri }
    })
  }
  if (!ALLOWED_REDIRECT_SCHEMES.has(parsed.protocol)) {
    throw oauthAdminErrors.badRequest({
      message: `Unsupported redirect URI scheme: ${parsed.protocol}`,
      data: { reason: 'UNSUPPORTED_SCHEME', redirectUri: uri }
    })
  }
  if (parsed.hash) {
    throw oauthAdminErrors.badRequest({
      message: 'Redirect URI must not contain a fragment',
      data: { reason: 'REDIRECT_FRAGMENT', redirectUri: uri }
    })
  }
  return parsed.href
}

/** Validate & normalize a redirect-URI list (bounded, de-duplicated). */
export function normalizeRedirectUris(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : []
  if (list.length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'At least one redirect URI is required',
      data: { reason: 'REDIRECT_REQUIRED' }
    })
  }
  if (list.length > MAX_REDIRECT_URIS) {
    throw oauthAdminErrors.badRequest({ message: 'Too many redirect URIs', data: { reason: 'TOO_MANY_REDIRECTS' } })
  }
  return [...new Set(list.map(normalizeRedirectUri))]
}

/**
 * Read the managed policy extension from a provider Client artifact payload.
 * Returns `null` when the client carries no managed extension (i.e. it is an
 * unmanaged dynamic client) or the extension is malformed (Req 5.2, 7.7).
 */
export function readManagedPolicy(payload: Record<string, unknown>): ManagedPolicyExtension | null {
  const raw = payload[MANAGED_POLICY_METADATA_KEY]
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as Record<string, unknown>
  const lifecycle = record.lifecycle
  const validLifecycle = lifecycle === 'active' || lifecycle === 'deprecated'
    || lifecycle === 'blocked' || lifecycle === 'retired'
  if (!validLifecycle) return null
  const ownership = (record.ownership && typeof record.ownership === 'object' && !Array.isArray(record.ownership))
    ? record.ownership as OAuthApplicationOwnership
    : {}
  const permittedResources = Array.isArray(record.permittedResources)
    ? record.permittedResources.filter((entry): entry is string => typeof entry === 'string')
    : []
  const permittedScopes = Array.isArray(record.permittedScopes)
    ? record.permittedScopes.filter((entry): entry is string => typeof entry === 'string')
    : []
  const adoptedAt = typeof record.adoptedAt === 'string' ? record.adoptedAt : ''
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : adoptedAt
  return {
    version: typeof record.version === 'number' ? record.version : MANAGED_POLICY_VERSION,
    lifecycle,
    ownership,
    permittedResources,
    permittedScopes,
    adoptedAt,
    updatedAt
  }
}

/**
 * The managed-policy service. Wires `application.adopt` and `application.update`
 * through {@link OAuthAdminOperationService.run}, supplying the provider policy
 * write and the managed projection upsert. The provider accessor and artifact
 * reader are injected so tests can supply stubs.
 */
export class OAuthManagedPolicyService {
  constructor(
    private readonly repository: OAuthAdminRepository,
    private readonly operations: OAuthAdminOperationService = new OAuthAdminOperationService(repository),
    private readonly providerAccessor: () => Promise<Provider> = getOAuthProvider,
    private readonly artifactReader: OAuthProviderArtifactReader = oauthProviderArtifactReader,
    private readonly now: () => number = Date.now
  ) {}

  private isoNow(): IsoDateTime {
    return new Date(this.now()).toISOString()
  }

  /**
   * Read the current authoritative provider Client artifact for a client id, or
   * throw a typed 404 when the provider has no such client.
   */
  private async reconcileClientArtifact(clientId: OpaqueReference) {
    const artifact = await this.artifactReader.readArtifact('Client', clientId)
    if (!artifact) {
      throw oauthAdminErrors.notFound({
        message: 'No provider client exists for this reference.',
        data: { reason: 'CLIENT_NOT_FOUND', clientId }
      })
    }
    return artifact
  }

  /**
   * Write updated managed policy onto the provider Client through the SAME
   * supported path task 7.2 uses (`new provider.Client(metadata)` +
   * `adapter.upsert`). The existing provider metadata is preserved verbatim and
   * only the {@link MANAGED_POLICY_METADATA_KEY} extension (and any explicitly
   * edited standard field such as `redirect_uris`) is changed — the client's
   * credentials/behavior are otherwise untouched (Req 7.7).
   */
  private async writePolicyToProvider(
    clientId: OpaqueReference,
    existingMetadata: Record<string, unknown>,
    policy: ManagedPolicyExtension,
    overrides: Record<string, unknown> = {}
  ): Promise<void> {
    const provider = await this.providerAccessor()
    const ClientModel = provider.Client as unknown as {
      new (metadata: Record<string, unknown>): { clientId: string, metadata(): Record<string, unknown> }
      adapter: { upsert(id: string, payload: Record<string, unknown>): Promise<void> }
    }
    // Preserve the current provider metadata, apply any edited standard fields,
    // then attach the managed-policy extension. The provider constructor runs
    // its own validation and rejects unsupported metadata.
    const metadata: Record<string, unknown> = {
      ...existingMetadata,
      ...overrides,
      client_id: clientId,
      [MANAGED_POLICY_METADATA_KEY]: policy
    }
    const client = new ClientModel(metadata)
    await ClientModel.adapter.upsert(client.clientId, client.metadata())
  }

  /**
   * Build the managed application projection (read model) from the reconciled
   * provider artifact plus the managed policy. Origin is `managed`; lifecycle
   * comes from the policy. The `revision`/`updatedAt` anchor optimistic
   * concurrency for the next edit.
   */
  private buildManagedProjection(
    ctx: OAuthDeploymentContext,
    clientId: OpaqueReference,
    providerMetadata: Record<string, unknown>,
    policy: ManagedPolicyExtension,
    revision: IsoDateTime
  ): OAuthApplicationDetail {
    // Derive the safe base fields from the provider artifact using the shared
    // mapper, then overlay the managed policy (origin/lifecycle/ownership/policy).
    const base = mapClientArtifact(ctx, { model: 'Client', id: clientId, payload: providerMetadata }, revision)
    return {
      ...base,
      origin: 'managed',
      lifecycle: policy.lifecycle,
      ownership: policy.ownership,
      permittedResources: policy.permittedResources,
      permittedScopes: policy.permittedScopes,
      revision,
      updatedAt: revision
    }
  }

  /**
   * Adopt an existing (unmanaged, dynamic) client into management. Reconciles
   * the client from the provider, attaches managed policy metadata (ownership,
   * lifecycle `active`, and the client's CURRENT redirects/resources/scopes as
   * the initial approved policy), and upserts the managed projection with origin
   * `managed`. Idempotent via the operation service (`application.adopt`).
   *
   * Adoption ONLY adds policy metadata — it never rewrites the client's
   * credentials or protocol behavior (Req 7.7).
   */
  async adopt(
    access: OAuthAdminAccessContext,
    clientId: OpaqueReference,
    ownership: OAuthApplicationOwnership,
    reason: string,
    idempotencyKey: string
  ): Promise<Awaited<ReturnType<OAuthAdminOperationService['run']>>> {
    const normalizedOwnership = normalizeOwnership(ownership)
    const requestFingerprint = computeRequestFingerprint('application.adopt', {
      clientId,
      ownership: normalizedOwnership
    })

    return this.operations.run(
      access,
      {
        type: 'application.adopt',
        idempotencyKey,
        requestFingerprint,
        targetReferences: [clientId],
        reason
      },
      async (): Promise<EffectOutcome> => {
        const artifact = await this.reconcileClientArtifact(clientId)
        const existingPolicy = readManagedPolicy(artifact.payload)
        const revision = this.isoNow()

        // Derive the initial approved policy from the client's CURRENT state.
        const currentProjection = mapClientArtifact(access.deployment, artifact, revision)
        const adoptedAt = existingPolicy?.adoptedAt || revision
        const policy: ManagedPolicyExtension = {
          version: MANAGED_POLICY_VERSION,
          lifecycle: 'active',
          ownership: normalizedOwnership,
          permittedResources: currentProjection.permittedResources,
          permittedScopes: currentProjection.permittedScopes,
          adoptedAt,
          updatedAt: revision
        }

        // Attach the managed policy extension WITHOUT changing any standard
        // provider metadata (no overrides) — the client behaves exactly as
        // before, now with administrator-owned policy attached (Req 7.7).
        await this.writePolicyToProvider(clientId, artifact.payload, policy)

        const detail = this.buildManagedProjection(access.deployment, clientId, artifact.payload, policy, revision)
        await this.repository.upsertApplication(access.deployment, detail)

        return {
          state: 'completed',
          result: { clientId, origin: 'managed', lifecycle: 'active' },
          changedFields: ['origin', 'lifecycle', 'ownership'],
          before: { origin: 'dynamic', lifecycle: existingPolicy?.lifecycle || 'unassigned' },
          after: { origin: 'managed', lifecycle: 'active', ownership: normalizedOwnership }
        }
      }
    )
  }

  /**
   * Apply a revision-checked edit to a managed client. Supported actions here:
   *   - `metadata-owner-transfer`: change ownership metadata ONLY. NEVER changes
   *     user permissions (Req 7.1).
   *   - `redirect-edit`: change `redirect_uris` on the provider client through
   *     the supported path, applied prospectively; does not revoke grants
   *     (Req 7.6).
   *   - `deprecate` / `block` / `reactivate`: advisory/managed lifecycle STATE
   *     transitions that do not need the grant mechanism, applied as managed
   *     policy edits (Req 7.2, 7.3). The authorization/exchange ENFORCEMENT of
   *     block is task 8.2.
   *
   * Grant-affecting actions (`reduce-policy`, `retire-*`) and `expand-policy`
   * are NOT applied here (they connect to tasks 8.2 / 9); callers should use
   * {@link preview} for those until enforcement is wired.
   *
   * A stale `expectedRevision` surfaces as a 409 conflict via the repository
   * conditional write (Req 13.4). Every edit captures a reason and audits safe
   * before/after values (Req 13.1, 13.6).
   */
  async edit(
    access: OAuthAdminAccessContext,
    clientId: OpaqueReference,
    request: OAuthUpdateApplicationRequest
  ): Promise<Awaited<ReturnType<OAuthAdminOperationService['run']>>> {
    const action = request.action
    if (action !== 'metadata-owner-transfer' && action !== 'redirect-edit'
      && !APPLICABLE_STATE_TRANSITIONS.has(action)) {
      throw oauthAdminErrors.badRequest({
        message: 'This lifecycle action cannot be applied yet; preview it instead.',
        data: { reason: 'ACTION_NOT_APPLICABLE', action }
      })
    }
    if (typeof request.expectedRevision !== 'string' || request.expectedRevision.length === 0) {
      throw oauthAdminErrors.badRequest({
        message: 'A current revision is required for an edit.',
        data: { reason: 'REVISION_REQUIRED' }
      })
    }

    // Normalize the edit input BEFORE any durable/provider effect so the
    // fingerprint is stable and invalid input is rejected up front.
    let normalizedOwnership: OAuthApplicationOwnership | undefined
    let normalizedRedirects: string[] | undefined
    if (action === 'metadata-owner-transfer') {
      normalizedOwnership = normalizeOwnership(request.ownership)
    } else if (action === 'redirect-edit') {
      normalizedRedirects = normalizeRedirectUris(request.redirectUris)
    }

    const requestFingerprint = computeRequestFingerprint('application.update', {
      clientId,
      action,
      expectedRevision: request.expectedRevision,
      ownership: normalizedOwnership,
      redirectUris: normalizedRedirects
    })

    return this.operations.run(
      access,
      {
        type: 'application.update',
        idempotencyKey: request.idempotencyKey,
        requestFingerprint,
        targetReferences: [clientId],
        expectedRevision: request.expectedRevision,
        reason: request.reason
      },
      async (): Promise<EffectOutcome> => {
        // Load the current managed projection to enforce the revision and to
        // build the safe before/after diff.
        const current = await this.repository.getApplication(access.deployment, clientId)
        if (!current) {
          throw oauthAdminErrors.notFound({
            message: 'No managed application exists for this reference.',
            data: { reason: 'APPLICATION_NOT_FOUND', clientId }
          })
        }
        if (current.origin !== 'managed') {
          // An unmanaged client must be adopted before it can be edited (Req 7.7).
          throw oauthAdminErrors.conflict({
            message: 'This client is not managed; adopt it before editing policy.',
            data: { reason: 'NOT_MANAGED', clientId }
          })
        }
        // Optimistic-concurrency check against the current projection revision.
        if (current.revision !== request.expectedRevision) {
          throw oauthAdminErrors.conflict({
            message: 'The application was modified concurrently; reload and retry.',
            data: { reason: 'REVISION_CONFLICT' }
          })
        }

        const artifact = await this.reconcileClientArtifact(clientId)
        const existingPolicy = readManagedPolicy(artifact.payload) || this.policyFromProjection(current)
        const revision = this.isoNow()

        const outcome = await this.applyEdit(
          access.deployment,
          clientId,
          artifact.payload,
          current,
          existingPolicy,
          action,
          revision,
          { ownership: normalizedOwnership, redirectUris: normalizedRedirects }
        )
        return outcome
      }
    )
  }

  /** Reconstruct a managed-policy extension from the projection (fallback). */
  private policyFromProjection(detail: OAuthApplicationDetail): ManagedPolicyExtension {
    const lifecycle = detail.lifecycle === 'unassigned' ? 'active' : detail.lifecycle
    return {
      version: MANAGED_POLICY_VERSION,
      lifecycle,
      ownership: detail.ownership,
      permittedResources: detail.permittedResources,
      permittedScopes: detail.permittedScopes,
      adoptedAt: detail.createdAt || detail.revision,
      updatedAt: detail.updatedAt || detail.revision
    }
  }

  /** Apply the normalized edit, write to the provider + projection, and audit. */
  private async applyEdit(
    ctx: OAuthDeploymentContext,
    clientId: OpaqueReference,
    providerMetadata: Record<string, unknown>,
    current: OAuthApplicationDetail,
    existingPolicy: ManagedPolicyExtension,
    action: OAuthLifecycleAction,
    revision: IsoDateTime,
    edits: { ownership?: OAuthApplicationOwnership, redirectUris?: string[] }
  ): Promise<EffectOutcome> {
    let policy: ManagedPolicyExtension = { ...existingPolicy, updatedAt: revision }
    const overrides: Record<string, unknown> = {}
    let changedFields: string[]
    let before: Record<string, unknown>
    let after: Record<string, unknown>

    if (action === 'metadata-owner-transfer') {
      // Ownership metadata ONLY. Never touches redirects, scopes, or any
      // provider authorization decision (Req 7.1).
      policy = { ...policy, ownership: edits.ownership! }
      changedFields = ['ownership']
      before = { ownership: current.ownership }
      after = { ownership: edits.ownership! }
    } else if (action === 'redirect-edit') {
      // Apply the new redirect policy prospectively. Grants are untouched (Req 7.6).
      overrides.redirect_uris = edits.redirectUris!
      changedFields = ['redirectUris']
      before = { redirectUris: current.redirectPolicy.redirectUris }
      after = { redirectUris: edits.redirectUris! }
    } else {
      // Advisory/managed state transition (deprecate/block/reactivate).
      const nextLifecycle = lifecycleForAction(action) as ManagedPolicyExtension['lifecycle']
      policy = { ...policy, lifecycle: nextLifecycle }
      changedFields = ['lifecycle']
      before = { lifecycle: current.lifecycle }
      after = { lifecycle: nextLifecycle }
    }

    // Persist the updated policy (and any edited standard field) through the
    // supported provider path, then update the read-model projection.
    await this.writePolicyToProvider(clientId, providerMetadata, policy, overrides)

    const detail: OAuthApplicationDetail = {
      ...this.buildManagedProjection(ctx, clientId, { ...providerMetadata, ...overrides }, policy, revision)
    }
    // The projection reflects the current provider metadata for redirects and
    // the updated policy for lifecycle/ownership/scope-policy.
    await this.repository.upsertApplication(ctx, detail, { expectedRevision: current.revision })

    return {
      state: 'completed',
      result: { clientId, action, revision },
      changedFields,
      before: oauthAdminRedactor.redact(before),
      after: oauthAdminRedactor.redact(after)
    }
  }

  /**
   * Preview the SAFE effect of a lifecycle action per the design lifecycle
   * matrix WITHOUT applying it (Req 7.2, 7.8). For grant-affecting actions
   * (`reduce-policy`, `retire-revoke-grants`) it counts how many existing grants
   * WOULD be affected via the repository (bounded, indexed query by client id) —
   * never a confident zero when coverage is incomplete.
   *
   * This is a read-only description: it performs no provider mutation.
   */
  async preview(
    access: OAuthAdminAccessContext,
    clientId: OpaqueReference,
    action: OAuthLifecycleAction
  ): Promise<LifecyclePreview> {
    const effect = LIFECYCLE_MATRIX[action]
    if (!effect) {
      throw oauthAdminErrors.badRequest({
        message: 'Unknown lifecycle action.',
        data: { reason: 'UNKNOWN_ACTION', action }
      })
    }

    const resultingLifecycle = lifecycleForAction(action)
    const requiresGrantMechanism = GRANT_AFFECTING_ACTIONS.has(action)
    const advisoryOnly = action === 'deprecate'

    let affectedGrantCount: number | null | undefined
    if (requiresGrantMechanism) {
      affectedGrantCount = await this.countAffectedGrants(access, clientId)
    }

    const notes: string[] = []
    if (advisoryOnly) {
      notes.push('Deprecation is advisory only; existing protocol behavior is preserved.')
    }
    if (action === 'block') {
      notes.push('Blocking denies new authorization and code exchange; existing tokens continue to normal expiry.')
    }
    if (action === 'expand-policy') {
      notes.push('Expansion requires the user to grant the additional scope through normal consent.')
    }
    if (requiresGrantMechanism) {
      notes.push('This action revokes affected grants and is enforced through the selected-grant mechanism.')
      if (affectedGrantCount === null) {
        notes.push('Affected-grant coverage is incomplete; the count is unavailable rather than zero.')
      }
    }
    // Actions beyond the advisory/managed state transitions are previews here;
    // their provider enforcement is wired in task 8.2 (and revocation in task 9).
    if (!APPLICABLE_STATE_TRANSITIONS.has(action)) {
      notes.push('This is a preview; enforcement is applied at the provider boundary by a later step.')
    }

    return {
      clientId,
      action,
      resultingLifecycle,
      effect,
      affectedGrantCount,
      requiresGrantMechanism,
      advisoryOnly,
      notes
    }
  }

  /**
   * Count existing grants that WOULD be affected by a grant-affecting action,
   * via a bounded, indexed repository query by client id. Returns `null` when
   * coverage is partial/rebuilding/unavailable so an incomplete projection is
   * never reported as a confident zero (Req 16.5).
   */
  private async countAffectedGrants(
    access: OAuthAdminAccessContext,
    clientId: OpaqueReference
  ): Promise<number | null> {
    const page = await this.repository.queryGrants(access.deployment, { clientId, limit: 100 })
    if (page.page.coverage !== 'complete') return null
    // When there may be more than one bounded page, we cannot claim an exact
    // total, so report null rather than an undercount.
    if (page.page.hasMore) return null
    return page.items.length
  }
}
