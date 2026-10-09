/**
 * Feature: oauth-administration — task 9.2 collaboration identity path rejects a
 * REVOKED grant.
 *
 * Collaboration is an opaque-token consumer, so the same grant-revocation fence
 * that the token-verifier and Crew config path consult must reject a token whose
 * grant is under a revocation marker (design "Managed policy and operation flow":
 * "Authorization, code exchange, refresh, and every opaque-token consumer must
 * reject a marked grant"). It resolves to the caller's single non-disclosing
 * `reauth_required`/`null` outcome, exactly like an unknown/expired token.
 *
 * CRITICAL (Req 18.2): an UNMARKED grant resolves EXACTLY as today. The revocation
 * check is grant-scoped and only consults the returned stored `grantId`; the raw
 * bearer is still never decoded.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import { COLLABORATION_READ_SCOPE } from '../../server/kirocrew/collaboration/types'
import {
  resolveCollaborationToken,
  resolveCollaborationTokenWithAudiences,
  type GhostTokenIdentityPath
} from '../../server/kirocrew/collaboration/token-identity'
import {
  InMemoryGrantRevocationMarkerStore,
  installGrantRevocationFence,
  resetGrantRevocationFenceInstallForTests
} from '../../server/mcp/oauth/admin/grant-revocation-service'
import { setGrantRevocationFence } from '../../server/mcp/oauth/admin/lifecycle-enforcement'

const CREW_RESOURCE = 'https://ghost.example.test/api/kirocrew'

interface StoredToken {
  accountId?: string
  clientId?: string
  exp?: number
  aud?: string | string[]
  scope?: string
  grantId?: string
}

function fakeIdentityPath(
  tokens: Record<string, StoredToken>,
  identities: Record<string, { oid: string; tenantId: string }>,
  clock = 1_000
): GhostTokenIdentityPath {
  return {
    async findAccessToken(opaqueToken: string) {
      return tokens[opaqueToken] ?? null
    },
    async findIdentity(subject: string) {
      return identities[subject] ?? null
    },
    now() {
      return clock
    }
  }
}

const TOKEN: StoredToken = {
  accountId: 'subject-1',
  clientId: 'crew-cli',
  exp: 10_000,
  aud: CREW_RESOURCE,
  scope: `openid ${COLLABORATION_READ_SCOPE}`,
  grantId: 'grant_1'
}
const IDENTITIES = { 'subject-1': { oid: 'entra-oid-1', tenantId: 'tenant-1' } }

function restoreDefaultFence(): void {
  setGrantRevocationFence({ isRevoked: () => false })
  resetGrantRevocationFenceInstallForTests()
}

test('collaboration resolves a non-revoked grant unchanged', async () => {
  const store = new InMemoryGrantRevocationMarkerStore()
  try {
    resetGrantRevocationFenceInstallForTests()
    installGrantRevocationFence(store)
    const path = fakeIdentityPath({ tok: TOKEN }, IDENTITIES)

    const context = await resolveCollaborationToken('tok', path)
    assert.deepEqual(context?.subject, { tenantId: 'tenant-1', entraObjectId: 'entra-oid-1' })

    const withAud = await resolveCollaborationTokenWithAudiences('tok', path)
    assert.deepEqual(withAud?.audiences, [CREW_RESOURCE])
  } finally {
    restoreDefaultFence()
  }
})

test('collaboration rejects a token whose grant is under a revocation marker', async () => {
  const store = new InMemoryGrantRevocationMarkerStore()
  try {
    resetGrantRevocationFenceInstallForTests()
    installGrantRevocationFence(store)
    await store.put({
      grantReference: 'grant_1',
      markedAt: '2024-01-01T00:00:00.000Z',
      markedBy: 'act_admin',
      operationId: 'op_1'
    })
    const path = fakeIdentityPath({ tok: TOKEN }, IDENTITIES)

    // Both resolvers return null (non-disclosing) for a revoked grant.
    assert.equal(await resolveCollaborationToken('tok', path), null)
    assert.equal(await resolveCollaborationTokenWithAudiences('tok', path), null)
  } finally {
    restoreDefaultFence()
  }
})

test('a token whose grant is NOT the marked one still resolves', async () => {
  const store = new InMemoryGrantRevocationMarkerStore()
  try {
    resetGrantRevocationFenceInstallForTests()
    installGrantRevocationFence(store)
    // Mark an unrelated grant only.
    await store.put({
      grantReference: 'grant_other',
      markedAt: '2024-01-01T00:00:00.000Z',
      markedBy: 'act_admin',
      operationId: 'op_other'
    })
    const path = fakeIdentityPath({ tok: TOKEN }, IDENTITIES)

    const context = await resolveCollaborationToken('tok', path)
    assert.deepEqual(context?.subject, { tenantId: 'tenant-1', entraObjectId: 'entra-oid-1' })
  } finally {
    restoreDefaultFence()
  }
})
