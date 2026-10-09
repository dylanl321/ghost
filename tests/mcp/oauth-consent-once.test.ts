/**
 * Feature: consent-once (pure SSO) grant reuse.
 *
 * Native public clients (MCP, Kiro Crew) were prompted for the "Allow access"
 * consent button on every `codex mcp login` because a fresh browser context has
 * no OIDC session association to reuse. `loadReusableGhostGrant` additionally
 * consults the durable `(subject, clientId)` grant pointer so a previously
 * approved grant is reused across sessions — approve once, then sign in silently.
 *
 * These focused tests prove the reuse is GATED, not blind:
 *   - a matching grant is reused (pointer + session/result sources),
 *   - a revoked grant is never reused,
 *   - a blocked / retired managed client is never silently reused,
 *   - an account/client identity mismatch is ignored,
 *   - an unmanaged client is reused with no behavior change,
 *   - the pointer store round-trips through the in-memory dev path.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type { ManagedPolicyExtension } from '../../server/mcp/oauth/admin/managed-policy-service'
import { MANAGED_POLICY_METADATA_KEY } from '../../server/mcp/oauth/admin/managed-policy-service'
import { setGrantRevocationFence } from '../../server/mcp/oauth/admin/lifecycle-enforcement'
import { loadReusableGhostGrant } from '../../server/mcp/oauth/provider'
import {
  findGrantPointer,
  resetDevelopmentGrantPointers,
  saveGrantPointer
} from '../../server/mcp/oauth/grant-pointer'

process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'

function managedPolicy(overrides: Partial<ManagedPolicyExtension> = {}): ManagedPolicyExtension {
  return {
    version: 1,
    lifecycle: 'active',
    ownership: { owner: 'ada@example.test' },
    permittedResources: [],
    permittedScopes: [],
    adoptedAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  }
}

interface StubGrant {
  jti: string
  accountId?: string
  clientId?: string
}

/**
 * Build a minimal OIDC `ctx` for `loadReusableGhostGrant`. `grants` seeds the
 * provider's Grant.find; `clientMetadata` optionally attaches a managed policy;
 * `resultGrantId` / `sessionGrantId` exercise the default (non-pointer) sources.
 */
function makeCtx(options: {
  accountId?: string
  clientId?: string
  clientMetadata?: Record<string, unknown>
  grants?: Record<string, StubGrant>
  resultGrantId?: string
  sessionGrantId?: string
}) {
  const grants = options.grants ?? {}
  const metadata = options.clientMetadata
  return {
    oidc: {
      provider: {
        Grant: { async find(id: string) { return grants[id] } }
      },
      account: options.accountId ? { accountId: options.accountId } : undefined,
      client: options.clientId
        ? { clientId: options.clientId, metadata: metadata ? () => metadata : undefined }
        : undefined,
      result: options.resultGrantId ? { consent: { grantId: options.resultGrantId } } : undefined,
      session: { grantIdFor: (_clientId: string) => options.sessionGrantId }
    }
  } as any
}

test.beforeEach(() => {
  resetDevelopmentGrantPointers()
  setGrantRevocationFence({ isRevoked: () => false })
})

test('grant pointer round-trips through the in-memory dev store', async () => {
  assert.equal(await findGrantPointer('tenant:user', 'client_a'), undefined)
  await saveGrantPointer('tenant:user', 'client_a', 'grant_1')
  assert.equal(await findGrantPointer('tenant:user', 'client_a'), 'grant_1')
  // A newer approval overwrites the pointer (newest approved grant wins).
  await saveGrantPointer('tenant:user', 'client_a', 'grant_2')
  assert.equal(await findGrantPointer('tenant:user', 'client_a'), 'grant_2')
  // Distinct client id is a distinct pointer.
  assert.equal(await findGrantPointer('tenant:user', 'client_b'), undefined)
})

test('a previously approved grant is reused across sessions via the pointer (consent-once)', async () => {
  await saveGrantPointer('tenant:user', 'mcp_client', 'grant_1')
  const ctx = makeCtx({
    accountId: 'tenant:user',
    clientId: 'mcp_client',
    grants: { grant_1: { jti: 'grant_1', accountId: 'tenant:user', clientId: 'mcp_client' } }
  })
  const grant = await loadReusableGhostGrant(ctx) as StubGrant | undefined
  assert.equal(grant?.jti, 'grant_1')
})

test('the in-flight consent result grant id takes precedence over the pointer', async () => {
  await saveGrantPointer('tenant:user', 'mcp_client', 'pointer_grant')
  const ctx = makeCtx({
    accountId: 'tenant:user',
    clientId: 'mcp_client',
    resultGrantId: 'result_grant',
    grants: {
      result_grant: { jti: 'result_grant', accountId: 'tenant:user', clientId: 'mcp_client' },
      pointer_grant: { jti: 'pointer_grant', accountId: 'tenant:user', clientId: 'mcp_client' }
    }
  })
  const grant = await loadReusableGhostGrant(ctx) as StubGrant | undefined
  assert.equal(grant?.jti, 'result_grant')
})

test('the session association is used before the pointer', async () => {
  await saveGrantPointer('tenant:user', 'mcp_client', 'pointer_grant')
  const ctx = makeCtx({
    accountId: 'tenant:user',
    clientId: 'mcp_client',
    sessionGrantId: 'session_grant',
    grants: {
      session_grant: { jti: 'session_grant', accountId: 'tenant:user', clientId: 'mcp_client' },
      pointer_grant: { jti: 'pointer_grant', accountId: 'tenant:user', clientId: 'mcp_client' }
    }
  })
  const grant = await loadReusableGhostGrant(ctx) as StubGrant | undefined
  assert.equal(grant?.jti, 'session_grant')
})

test('no pointer and no session association means no reuse (prompt as before)', async () => {
  const ctx = makeCtx({ accountId: 'tenant:user', clientId: 'mcp_client' })
  assert.equal(await loadReusableGhostGrant(ctx), undefined)
})

test('a revoked grant is never silently reused', async () => {
  await saveGrantPointer('tenant:user', 'mcp_client', 'revoked_grant')
  setGrantRevocationFence({ isRevoked: (id) => id === 'revoked_grant' })
  try {
    const ctx = makeCtx({
      accountId: 'tenant:user',
      clientId: 'mcp_client',
      grants: { revoked_grant: { jti: 'revoked_grant', accountId: 'tenant:user', clientId: 'mcp_client' } }
    })
    assert.equal(await loadReusableGhostGrant(ctx), undefined)
  } finally {
    setGrantRevocationFence({ isRevoked: () => false })
  }
})

test('a blocked managed client is not silently reused (routes back to consent)', async () => {
  await saveGrantPointer('tenant:user', 'blocked_client', 'grant_1')
  const ctx = makeCtx({
    accountId: 'tenant:user',
    clientId: 'blocked_client',
    clientMetadata: { client_id: 'blocked_client', [MANAGED_POLICY_METADATA_KEY]: managedPolicy({ lifecycle: 'blocked' }) },
    grants: { grant_1: { jti: 'grant_1', accountId: 'tenant:user', clientId: 'blocked_client' } }
  })
  assert.equal(await loadReusableGhostGrant(ctx), undefined)
})

test('a retired managed client is not silently reused', async () => {
  await saveGrantPointer('tenant:user', 'retired_client', 'grant_1')
  const ctx = makeCtx({
    accountId: 'tenant:user',
    clientId: 'retired_client',
    clientMetadata: { client_id: 'retired_client', [MANAGED_POLICY_METADATA_KEY]: managedPolicy({ lifecycle: 'retired' }) },
    grants: { grant_1: { jti: 'grant_1', accountId: 'tenant:user', clientId: 'retired_client' } }
  })
  assert.equal(await loadReusableGhostGrant(ctx), undefined)
})

test('an active managed client IS reused (managed does not mean re-prompt)', async () => {
  await saveGrantPointer('tenant:user', 'active_client', 'grant_1')
  const ctx = makeCtx({
    accountId: 'tenant:user',
    clientId: 'active_client',
    clientMetadata: { client_id: 'active_client', [MANAGED_POLICY_METADATA_KEY]: managedPolicy({ lifecycle: 'active' }) },
    grants: { grant_1: { jti: 'grant_1', accountId: 'tenant:user', clientId: 'active_client' } }
  })
  const grant = await loadReusableGhostGrant(ctx) as StubGrant | undefined
  assert.equal(grant?.jti, 'grant_1')
})

test('a grant whose account or client does not match is ignored', async () => {
  await saveGrantPointer('tenant:user', 'mcp_client', 'grant_1')
  const wrongAccount = makeCtx({
    accountId: 'tenant:user',
    clientId: 'mcp_client',
    grants: { grant_1: { jti: 'grant_1', accountId: 'tenant:other', clientId: 'mcp_client' } }
  })
  assert.equal(await loadReusableGhostGrant(wrongAccount), undefined)

  await saveGrantPointer('tenant:user', 'mcp_client', 'grant_2')
  const wrongClient = makeCtx({
    accountId: 'tenant:user',
    clientId: 'mcp_client',
    grants: { grant_2: { jti: 'grant_2', accountId: 'tenant:user', clientId: 'different_client' } }
  })
  assert.equal(await loadReusableGhostGrant(wrongClient), undefined)
})

test('no authenticated account means no reuse', async () => {
  await saveGrantPointer('tenant:user', 'mcp_client', 'grant_1')
  const ctx = makeCtx({
    clientId: 'mcp_client',
    grants: { grant_1: { jti: 'grant_1', accountId: 'tenant:user', clientId: 'mcp_client' } }
  })
  assert.equal(await loadReusableGhostGrant(ctx), undefined)
})
