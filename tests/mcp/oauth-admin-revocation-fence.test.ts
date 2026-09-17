/**
 * Feature: oauth-administration — task 9.2 apply revocation markers consistently
 * across provider issuance, opaque-token verification, Crew configuration
 * authorization, and collaboration identity paths.
 *
 * These focused tests cover the SHARED fence seam this task installs and wires:
 *   - `installGrantRevocationFence` installs the marker-backed fence exactly once
 *     (idempotent) so `isGrantRevoked` is marker-backed in the running app.
 *   - A MARKED grant is reported revoked to every opaque-token consumer, and an
 *     UNMARKED grant is reported NOT revoked (unchanged behavior, Req 9.2, 18.2).
 *   - Installing a second time does not rebind the fence to a different store.
 *
 * Consumer-path integration (token-verifier, Crew auth, collaboration identity,
 * refresh gate) is covered by their own suites; this suite proves the fence
 * primitive they all consult behaves correctly.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  InMemoryGrantRevocationMarkerStore,
  installGrantRevocationFence,
  resetGrantRevocationFenceInstallForTests
} from '../../server/mcp/oauth/admin/grant-revocation-service'
import { isGrantRevoked, setGrantRevocationFence } from '../../server/mcp/oauth/admin/lifecycle-enforcement'

function restoreDefaultFence(): void {
  // Restore the module default no-op fence + install guard so other suites in
  // the same process are unaffected.
  setGrantRevocationFence({ isRevoked: () => false })
  resetGrantRevocationFenceInstallForTests()
}

test('installGrantRevocationFence makes isGrantRevoked marker-backed', async () => {
  const store = new InMemoryGrantRevocationMarkerStore()
  try {
    resetGrantRevocationFenceInstallForTests()
    installGrantRevocationFence(store)

    // Unmarked grant: unchanged behavior — not revoked (Req 9.2, 18.2).
    assert.equal(await isGrantRevoked('grant_1'), false)

    // Mark the grant in the SAME store the fence was installed with.
    await store.put({
      grantReference: 'grant_1',
      markedAt: '2024-01-01T00:00:00.000Z',
      markedBy: 'act_admin',
      operationId: 'op_1'
    })

    // Now every opaque-token consumer sees the grant as revoked.
    assert.equal(await isGrantRevoked('grant_1'), true)
    // An unrelated grant is never fenced.
    assert.equal(await isGrantRevoked('grant_other'), false)
    // A null/undefined grant id is never revoked (fail-safe).
    assert.equal(await isGrantRevoked(undefined), false)
    assert.equal(await isGrantRevoked(null), false)
  } finally {
    restoreDefaultFence()
  }
})

test('installGrantRevocationFence is idempotent: a second install does not rebind', async () => {
  const first = new InMemoryGrantRevocationMarkerStore()
  const second = new InMemoryGrantRevocationMarkerStore()
  try {
    resetGrantRevocationFenceInstallForTests()
    installGrantRevocationFence(first)
    // A second call is a no-op — the fence stays bound to `first`.
    installGrantRevocationFence(second)

    // Marking in `second` (the ignored store) has no effect.
    await second.put({
      grantReference: 'grant_x',
      markedAt: '2024-01-01T00:00:00.000Z',
      markedBy: 'act_admin',
      operationId: 'op_x'
    })
    assert.equal(await isGrantRevoked('grant_x'), false)

    // Marking in `first` (the bound store) IS observed.
    await first.put({
      grantReference: 'grant_x',
      markedAt: '2024-01-01T00:00:00.000Z',
      markedBy: 'act_admin',
      operationId: 'op_x'
    })
    assert.equal(await isGrantRevoked('grant_x'), true)
  } finally {
    restoreDefaultFence()
  }
})
