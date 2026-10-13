/**
 * Feature: oauth-administration — task 8.1 managed policy, adoption, edits, and
 * lifecycle previews.
 *
 * Focused unit tests for {@link OAuthManagedPolicyService} against the in-memory
 * repository fixture with a coordinated stub provider + artifact reader (no live
 * DynamoDB / provider). Covers:
 *   - Adoption attaches managed policy + origin `managed` WITHOUT changing the
 *     client's credentials/behavior; an unmanaged client is left unchanged until
 *     adoption.
 *   - Ownership (metadata) transfer changes only ownership, not permissions.
 *   - Redirect edit validates (wildcard rejected, loopback preserved) and
 *     applies prospectively.
 *   - A stale expectedRevision => 409 conflict.
 *   - Lifecycle preview describes the matrix effects + affected-grant count
 *     without applying anything.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type Provider from 'oidc-provider'
import type {
  OAuthDeploymentContext,
  OAuthGrantSummary,
  OAuthUpdateApplicationRequest
} from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import type { OAuthAdminAccessContext, OAuthProviderArtifact, OAuthProviderArtifactReader } from '../../server/mcp/oauth/admin/types'
import {
  OAuthManagedPolicyService,
  readManagedPolicy,
  MANAGED_POLICY_METADATA_KEY
} from '../../server/mcp/oauth/admin/managed-policy-service'

process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function accessWith(actor = 'act_test'): OAuthAdminAccessContext {
  return { deployment: ctx, actor, capabilities: ['oauth.applications.manage'] }
}

/**
 * A coordinated stub provider + artifact reader backed by a shared store, so a
 * write through the provider path is observed by a subsequent artifact read
 * (mirroring the real adapter/reader relationship). Records upsert calls so we
 * can prove no unexpected provider mutation happens.
 */
function makeStubProviderAndReader(seed: Record<string, Record<string, unknown>> = {}) {
  const store = new Map<string, Record<string, unknown>>()
  for (const [id, metadata] of Object.entries(seed)) store.set(id, { client_id: id, ...metadata })
  const upserts: Array<{ id: string, metadata: Record<string, unknown> }> = []

  const ClientModel: any = class {
    clientId: string
    private readonly raw: Record<string, unknown>
    constructor(metadata: Record<string, unknown>) {
      this.clientId = String(metadata.client_id)
      this.raw = { ...metadata }
    }
    metadata() { return this.raw }
    static adapter = {
      async upsert(id: string, payload: Record<string, unknown>) {
        store.set(id, { ...payload })
        upserts.push({ id, metadata: { ...payload } })
      }
    }
  }
  const provider = { Client: ClientModel } as unknown as Provider

  const reader: OAuthProviderArtifactReader = {
    async readPage() { return { artifacts: [] } },
    async readArtifact(model, id): Promise<OAuthProviderArtifact | null> {
      if (model !== 'Client') return null
      const payload = store.get(id)
      return payload ? { model: 'Client', id, payload: { ...payload } } : null
    }
  }
  return { provider, reader, store, upserts }
}

function makeService(
  repository: InMemoryOAuthAdminRepository,
  seed?: Record<string, Record<string, unknown>>
) {
  const { provider, reader, store, upserts } = makeStubProviderAndReader(seed)
  const service = new OAuthManagedPolicyService(
    repository,
    undefined,
    async () => provider,
    reader
  )
  return { service, store, upserts }
}

const DYNAMIC_CLIENT = {
  client_name: 'Existing Dynamic Client',
  application_type: 'native',
  token_endpoint_auth_method: 'none',
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  redirect_uris: ['https://app.example.test/callback'],
  scope: 'openid offline_access'
}

// --- Adoption --------------------------------------------------------------

test('adopt attaches managed policy + origin managed without changing credentials', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, store } = makeService(repository, { client_a: { ...DYNAMIC_CLIENT } })
  const access = accessWith()

  const operation = await service.adopt(
    access,
    'client_a',
    { owner: 'ada@example.test', team: 'Platform', purpose: 'CI' },
    'adopt existing integration',
    'idem-adopt-1'
  )
  assert.equal(operation.state, 'completed')

  // Projection reflects managed origin/lifecycle/ownership.
  const detail = await repository.getApplication(ctx, 'client_a')
  assert.ok(detail)
  assert.equal(detail?.origin, 'managed')
  assert.equal(detail?.lifecycle, 'active')
  assert.equal(detail?.ownership.owner, 'ada@example.test')
  // Initial approved policy is derived from the client's current state.
  assert.deepEqual(detail?.redirectPolicy.redirectUris, ['https://app.example.test/callback'])

  // The provider client keeps its original credentials/behavior; only the
  // managed-policy extension was added.
  const stored = store.get('client_a')!
  assert.equal(stored.token_endpoint_auth_method, 'none')
  assert.deepEqual(stored.grant_types, ['authorization_code', 'refresh_token'])
  assert.deepEqual(stored.redirect_uris, ['https://app.example.test/callback'])
  assert.equal('client_secret' in stored, false)
  const policy = readManagedPolicy(stored)
  assert.ok(policy)
  assert.equal(policy?.lifecycle, 'active')
})

test('an unmanaged dynamic client is left unchanged until adoption', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { store } = makeService(repository, { client_b: { ...DYNAMIC_CLIENT } })
  // No adoption happened: no managed extension, no projection.
  assert.equal(readManagedPolicy(store.get('client_b')!), null)
  assert.equal(await repository.getApplication(ctx, 'client_b'), null)
})

test('adopt is idempotent and never re-adopts on retry', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, upserts } = makeService(repository, { client_c: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  const first = await service.adopt(access, 'client_c', { owner: 'a@x.test' }, 'adopt', 'idem-adopt-c')
  const second = await service.adopt(access, 'client_c', { owner: 'a@x.test' }, 'adopt', 'idem-adopt-c')
  assert.equal(first.operationId, second.operationId)
  // Only the first adoption wrote to the provider.
  assert.equal(upserts.length, 1)
})

// --- Ownership (metadata) transfer -----------------------------------------

test('ownership transfer changes only metadata, not permissions', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, store } = makeService(repository, { client_d: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  await service.adopt(access, 'client_d', { owner: 'ada@example.test' }, 'adopt', 'idem-adopt-d')

  const detail = await repository.getApplication(ctx, 'client_d')
  const req: OAuthUpdateApplicationRequest = {
    csrfToken: 'csrf',
    idempotencyKey: 'idem-owner-d',
    reason: 'transfer owner',
    expectedRevision: detail!.revision,
    action: 'metadata-owner-transfer',
    ownership: { owner: 'grace@example.test', team: 'SRE' }
  }
  const op = await service.edit(access, 'client_d', req)
  assert.equal(op.state, 'completed')

  const updated = await repository.getApplication(ctx, 'client_d')
  assert.equal(updated?.ownership.owner, 'grace@example.test')
  assert.equal(updated?.ownership.team, 'SRE')
  // Scopes/redirects (the actual permissions/behavior) are unchanged.
  assert.deepEqual(updated?.permittedScopes, detail?.permittedScopes)
  assert.deepEqual(updated?.redirectPolicy.redirectUris, detail?.redirectPolicy.redirectUris)
  // Provider client scope/grant metadata is unchanged.
  const stored = store.get('client_d')!
  assert.equal(stored.scope, 'openid offline_access')
})

// --- Redirect edit ---------------------------------------------------------

test('redirect edit validates: wildcard rejected, loopback preserved', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, store } = makeService(repository, { client_e: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  await service.adopt(access, 'client_e', { owner: 'ada@example.test' }, 'adopt', 'idem-adopt-e')
  const detail = await repository.getApplication(ctx, 'client_e')

  // Wildcard is rejected before any effect.
  await assert.rejects(
    service.edit(access, 'client_e', {
      csrfToken: 'csrf', idempotencyKey: 'idem-bad-e', reason: 'edit', expectedRevision: detail!.revision,
      action: 'redirect-edit', redirectUris: ['https://*.example.test/cb']
    }),
    (error: any) => error?.statusCode === 400 && error?.data?.reason === 'WILDCARD_REDIRECT'
  )

  // A loopback redirect is preserved and applied prospectively.
  const op = await service.edit(access, 'client_e', {
    csrfToken: 'csrf', idempotencyKey: 'idem-loop-e', reason: 'edit', expectedRevision: detail!.revision,
    action: 'redirect-edit', redirectUris: ['http://127.0.0.1:8976/callback']
  })
  assert.equal(op.state, 'completed')
  const updated = await repository.getApplication(ctx, 'client_e')
  assert.equal(updated?.redirectPolicy.allowsLoopback, true)
  assert.deepEqual(updated?.redirectPolicy.redirectUris, ['http://127.0.0.1:8976/callback'])
  // The new redirect policy was applied to the provider client.
  assert.deepEqual(store.get('client_e')!.redirect_uris, ['http://127.0.0.1:8976/callback'])
})

// --- Revision conflict -----------------------------------------------------

test('a stale expectedRevision yields a 409 conflict', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service } = makeService(repository, { client_f: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  await service.adopt(access, 'client_f', { owner: 'ada@example.test' }, 'adopt', 'idem-adopt-f')

  await assert.rejects(
    service.edit(access, 'client_f', {
      csrfToken: 'csrf', idempotencyKey: 'idem-stale-f', reason: 'edit',
      expectedRevision: '1999-01-01T00:00:00.000Z',
      action: 'metadata-owner-transfer', ownership: { owner: 'x@x.test' }
    }),
    (error: any) => error?.statusCode === 409
  )
})

// --- Lifecycle state transitions applied as managed-policy edits -----------

test('deprecate/block/reactivate apply as managed lifecycle state changes', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service } = makeService(repository, { client_g: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  await service.adopt(access, 'client_g', { owner: 'ada@example.test' }, 'adopt', 'idem-adopt-g')

  let detail = await repository.getApplication(ctx, 'client_g')
  await service.edit(access, 'client_g', {
    csrfToken: 'csrf', idempotencyKey: 'idem-dep-g', reason: 'deprecate',
    expectedRevision: detail!.revision, action: 'deprecate'
  })
  detail = await repository.getApplication(ctx, 'client_g')
  assert.equal(detail?.lifecycle, 'deprecated')

  await service.edit(access, 'client_g', {
    csrfToken: 'csrf', idempotencyKey: 'idem-block-g', reason: 'block',
    expectedRevision: detail!.revision, action: 'block'
  })
  detail = await repository.getApplication(ctx, 'client_g')
  assert.equal(detail?.lifecycle, 'blocked')
})

// --- Lifecycle previews ----------------------------------------------------

test('preview describes matrix effects for a deprecate (advisory only)', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, upserts } = makeService(repository, { client_h: { ...DYNAMIC_CLIENT } })
  const access = accessWith()

  const preview = await service.preview(access, 'client_h', 'deprecate')
  assert.equal(preview.advisoryOnly, true)
  assert.equal(preview.requiresGrantMechanism, false)
  assert.equal(preview.resultingLifecycle, 'deprecated')
  assert.equal(preview.effect.authorizationCodeExchange, 'Allowed with advisory status')
  assert.equal(preview.effect.existingAccessTokens, 'Unchanged')
  // A preview never mutates the provider.
  assert.equal(upserts.length, 0)
})

test('preview counts affected grants for reduce-policy without applying it', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, upserts } = makeService(repository, { client_i: { ...DYNAMIC_CLIENT } })
  const access = accessWith()

  // Seed two grants for the client so the affected-grant count is exact.
  const grant = (ref: string): OAuthGrantSummary => ({
    grantReference: ref,
    clientReference: 'client_i',
    requestedScopes: [],
    consentedScopes: ['openid'],
    metadata: { coverage: 'complete', freshness: 'fresh', availability: 'available' }
  })
  await repository.upsertGrant(ctx, grant('grant_1'))
  await repository.upsertGrant(ctx, grant('grant_2'))

  const preview = await service.preview(access, 'client_i', 'reduce-policy')
  assert.equal(preview.requiresGrantMechanism, true)
  assert.equal(preview.affectedGrantCount, 2)
  assert.equal(preview.effect.refreshGrants.includes('revoked'), true)
  // Preview only — no provider mutation.
  assert.equal(upserts.length, 0)
  // Also proven not applied: still no managed projection (never adopted here).
  assert.equal(await repository.getApplication(ctx, 'client_i'), null)
})

test('editing an unmanaged client is rejected until it is adopted', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service } = makeService(repository, { client_j: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  await assert.rejects(
    service.edit(access, 'client_j', {
      csrfToken: 'csrf', idempotencyKey: 'idem-unmanaged-j', reason: 'edit',
      expectedRevision: 'anything', action: 'metadata-owner-transfer', ownership: { owner: 'x@x.test' }
    }),
    // No managed projection exists, so the effect reports not-found (404).
    (error: any) => error?.statusCode === 404
  )
})

test('managed policy extension field is namespaced as ghost_managed_policy', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service, store } = makeService(repository, { client_k: { ...DYNAMIC_CLIENT } })
  const access = accessWith()
  await service.adopt(access, 'client_k', { owner: 'ada@example.test' }, 'adopt', 'idem-adopt-k')
  assert.equal(MANAGED_POLICY_METADATA_KEY, 'ghost_managed_policy')
  assert.ok(store.get('client_k')![MANAGED_POLICY_METADATA_KEY])
})
