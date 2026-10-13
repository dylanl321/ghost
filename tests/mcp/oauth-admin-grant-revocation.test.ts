/**
 * Feature: oauth-administration — task 9.1 selected-grant revocation, durable
 * revocation marker/fence, and idempotent cleanup/reconciliation.
 *
 * Focused unit tests for {@link OAuthGrantRevocationService} against the
 * in-memory repository + in-memory marker store with a coordinated stub
 * provider + adapter (no live DynamoDB / provider). Covers:
 *   - preview returns subject/client/resources/scopes/credential impact WITHOUT
 *     accepting any raw browser token.
 *   - revoke commits the durable marker (isGrantRevoked true) BEFORE reporting
 *     complete; the operation stays `verifying` until reconcile confirms.
 *   - cleanup targets ONLY the selected grant + its credentials.
 *   - reconcile finalizes verifying -> completed and is safe to run repeatedly.
 *   - retry is idempotent (no additional grant affected).
 *   - a reason is required.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type Provider from 'oidc-provider'
import type {
  OAuthDeploymentContext,
  OAuthGrantSummary,
  OAuthRevokeGrantRequest
} from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'
import {
  OAuthGrantRevocationService,
  InMemoryGrantRevocationMarkerStore,
  type GrantCredentialAdapter
} from '../../server/mcp/oauth/admin/grant-revocation-service'
import { OAuthAdminOperationService } from '../../server/mcp/oauth/admin/operation-service'
import { isGrantRevoked, setGrantRevocationFence } from '../../server/mcp/oauth/admin/lifecycle-enforcement'

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
  return { deployment: ctx, actor, capabilities: ['oauth.grants.revoke'] }
}

const COVERAGE = { coverage: 'complete' as const, observedAt: '2024-01-01T00:00:00.000Z' }

function grant(reference: string, overrides: Partial<OAuthGrantSummary> = {}): OAuthGrantSummary {
  return {
    grantReference: reference,
    clientReference: 'client_a',
    subjectReference: 'sub_user_1',
    subjectDisplay: 'User One',
    requestedScopes: ['openid', 'offline_access', 'mcp.read'],
    consentedScopes: ['openid', 'offline_access', 'mcp.read'],
    resource: 'https://mcp.example.test/',
    consentedAt: '2024-01-01T00:00:00.000Z',
    metadata: COVERAGE,
    ...overrides
  }
}

/**
 * A coordinated stub provider Grant model + grant-id adapter, backed by a shared
 * store so cleanup is observable. `revokeByGrantId` records EVERY grant id it is
 * called with so tests can prove only the selected grant is affected.
 */
function makeStubs(seedGrants: string[] = []) {
  // Provider Grant artifact store keyed by grant id.
  const grantArtifacts = new Map<string, Record<string, unknown>>()
  for (const id of seedGrants) grantArtifacts.set(id, { grantId: id })

  // Per-grant credential store: grantId -> set of credential artifact ids.
  const credentials = new Map<string, Set<string>>()
  for (const id of seedGrants) credentials.set(id, new Set([`at_${id}`, `rt_${id}`, `ac_${id}`]))

  const revokedGrantIds: string[] = []
  const destroyedGrantIds: string[] = []

  const adapter: GrantCredentialAdapter = {
    async revokeByGrantId(grantId: string) {
      revokedGrantIds.push(grantId)
      credentials.delete(grantId)
    }
  }

  const GrantModel: any = {
    adapter: {
      async find(id: string) {
        return grantArtifacts.get(id)
      },
      async destroy(id: string) {
        destroyedGrantIds.push(id)
        grantArtifacts.delete(id)
      }
    }
  }
  const provider = { Grant: GrantModel } as unknown as Provider

  return { provider, adapter, grantArtifacts, credentials, revokedGrantIds, destroyedGrantIds }
}

function makeService(
  repository: InMemoryOAuthAdminRepository,
  seedGrants: string[] = []
) {
  const stubs = makeStubs(seedGrants)
  const markerStore = new InMemoryGrantRevocationMarkerStore()
  const service = new OAuthGrantRevocationService(
    repository,
    markerStore,
    new OAuthAdminOperationService(repository),
    async () => stubs.provider,
    () => stubs.adapter
  )
  return { service, markerStore, ...stubs }
}

function revokeRequest(overrides: Partial<OAuthRevokeGrantRequest> = {}): OAuthRevokeGrantRequest {
  return {
    csrfToken: 'csrf',
    idempotencyKey: 'idem-1',
    reason: 'Investigating suspected misuse',
    ...overrides
  }
}

// --- preview ---------------------------------------------------------------

test('preview returns subject/client/resources/scopes/credential impact without raw tokens', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  const { service } = makeService(repository, ['grant_1'])

  const preview = await service.preview(accessWith(), 'grant_1')

  assert.equal(preview.grantReference, 'grant_1')
  assert.equal(preview.clientReference, 'client_a')
  assert.equal(preview.subjectReference, 'sub_user_1')
  assert.equal(preview.subjectDisplay, 'User One')
  assert.equal(preview.resource, 'https://mcp.example.test/')
  assert.equal(preview.credentialImpact.hasResource, true)
  assert.deepEqual(preview.credentialImpact.consentedScopes, ['openid', 'offline_access', 'mcp.read'])
  assert.deepEqual(preview.credentialImpact.requestedScopes, ['openid', 'offline_access', 'mcp.read'])
  assert.equal(preview.credentialImpact.revokesAssociatedCredentials, true)
  assert.equal(preview.reasonRequired, true)
  assert.equal(preview.alreadyMarked, false)
  // The preview carries no token/code/secret fields.
  assert.equal('accessToken' in (preview as Record<string, unknown>), false)
})

test('preview throws a typed 404 for an unknown grant reference', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const { service } = makeService(repository)
  await assert.rejects(() => service.preview(accessWith(), 'missing'), /No grant exists/)
})

// --- revoke: marker committed BEFORE complete, stays verifying -------------

test('revoke commits the durable marker (fence active) and stays verifying', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  const { service, markerStore, destroyedGrantIds } = makeService(repository, ['grant_1'])

  const result = await service.revoke(accessWith(), revokeRequest(), 'grant_1')

  // Marker committed => fence active before the operation is reported complete.
  assert.equal(result.markerCommitted, true)
  assert.equal(markerStore.isMarked('grant_1'), true)
  // Cleanup ran (grant destroyed) but the operation stays verifying until
  // reconcile confirms the consistency conditions.
  assert.equal(result.state, 'verifying')
  assert.equal(result.cleanupConfirmed, false)
  assert.deepEqual(destroyedGrantIds, ['grant_1'])
})

test('installed fence reports a marked grant as revoked to opaque-token consumers', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  const { service } = makeService(repository, ['grant_1'])
  try {
    service.installFence()
    assert.equal(await isGrantRevoked('grant_1'), false)
    await service.revoke(accessWith(), revokeRequest(), 'grant_1')
    // The token-verifier and every opaque-token consumer now reject this grant.
    assert.equal(await isGrantRevoked('grant_1'), true)
    // An unrelated grant id is never fenced.
    assert.equal(await isGrantRevoked('grant_other'), false)
  } finally {
    // Restore the default no-op fence so other suites are unaffected.
    setGrantRevocationFence({ isRevoked: () => false })
  }
})

// --- cleanup targets ONLY the selected grant -------------------------------

test('cleanup targets only the selected grant and its credentials', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  await repository.upsertGrant(ctx, grant('grant_2', { subjectReference: 'sub_user_1' }))
  const { service, revokedGrantIds, destroyedGrantIds, credentials, grantArtifacts } = makeService(repository, ['grant_1', 'grant_2'])

  await service.revoke(accessWith(), revokeRequest(), 'grant_1')

  // Only grant_1's credentials/artifacts are revoked/destroyed.
  assert.deepEqual(revokedGrantIds, ['grant_1'])
  assert.deepEqual(destroyedGrantIds, ['grant_1'])
  assert.equal(credentials.has('grant_1'), false)
  // The unrelated grant is completely untouched.
  assert.equal(credentials.has('grant_2'), true)
  assert.equal(grantArtifacts.has('grant_2'), true)
})

// --- verifying until reconcile confirms ------------------------------------

test('operation stays verifying until reconcile confirms cleanup, then completes', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  const { service } = makeService(repository, ['grant_1'])
  const access = accessWith()

  const revoked = await service.revoke(access, revokeRequest(), 'grant_1')
  assert.equal(revoked.state, 'verifying')

  const reconciled = await service.reconcile(access, revoked.operationId)
  assert.equal(reconciled.state, 'completed')
  assert.equal(reconciled.markerCommitted, true)
  assert.equal(reconciled.cleanupConfirmed, true)

  // Reconcile is safe to run repeatedly.
  const again = await service.reconcile(access, revoked.operationId)
  assert.equal(again.state, 'completed')
  assert.equal(again.cleanupConfirmed, true)
})

// --- idempotent retry (no additional grant affected) -----------------------

test('retry with the same idempotency key is idempotent and affects no additional grant', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  const { service, revokedGrantIds, destroyedGrantIds } = makeService(repository, ['grant_1'])
  const access = accessWith()

  const first = await service.revoke(access, revokeRequest(), 'grant_1')
  const retry = await service.revoke(access, revokeRequest(), 'grant_1')

  // Same operation id; the effect did not run twice.
  assert.equal(retry.operationId, first.operationId)
  assert.deepEqual(revokedGrantIds, ['grant_1'])
  assert.deepEqual(destroyedGrantIds, ['grant_1'])
})

test('a retry with a different request fingerprint is a conflict', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  await repository.upsertGrant(ctx, grant('grant_2'))
  const { service } = makeService(repository, ['grant_1', 'grant_2'])
  const access = accessWith()

  await service.revoke(access, revokeRequest(), 'grant_1')
  // Same idempotency key, different target grant => fingerprint conflict.
  await assert.rejects(
    () => service.revoke(access, revokeRequest(), 'grant_2'),
    /different request/
  )
})

// --- reason required -------------------------------------------------------

test('revoke requires a non-empty reason', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  await repository.upsertGrant(ctx, grant('grant_1'))
  const { service } = makeService(repository, ['grant_1'])

  await assert.rejects(
    () => service.revoke(accessWith(), revokeRequest({ reason: '  ' }), 'grant_1'),
    /reason is required/
  )
})
