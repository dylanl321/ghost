/**
 * Ghostv2 protected delegated Graph handling for current membership (task 2.2).
 *
 * Verifies that collaboration resolves current Team_Space membership through a
 * persisted, renewable protected delegation — never a grant-time group snapshot —
 * and that every failure surfaces as a distinct typed outcome that fails closed:
 *  - `available` returns a current delegated Graph access token to query live
 *    membership, reusing a still-fresh cached token and renewing an expired one;
 *  - `missing` when no delegation is persisted;
 *  - `revoked` when Entra rejects the refresh credential (and the dead grant is
 *    purged so it is not retried);
 *  - `insufficient` when the delegation lacks the directory read permission;
 *  - `temporarily_unavailable` for transient store/Entra failures (retryable).
 *
 * Validates: Requirements 3.6, 3.7, 4.3, 4.4, 4.5, 4.6, 24.3.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  REQUIRED_GRAPH_MEMBERSHIP_SCOPE,
  resolveCollaborationGraphDelegation,
  type CollaborationGraphDelegationRuntime,
  type CollaborationGraphDelegationStore,
  type EntraTokenResponse,
  type LoadedCollaborationDelegation
} from '../../server/kirocrew/collaboration/delegation'

const SUBJECT = 'subject-1'
const TENANT = 'tenant-1'

/** An in-memory delegation store that records save/remove calls. */
function memoryStore(seed?: LoadedCollaborationDelegation | null): CollaborationGraphDelegationStore & {
  records: Map<string, LoadedCollaborationDelegation>
  removed: string[]
} {
  const records = new Map<string, LoadedCollaborationDelegation>()
  if (seed) records.set(SUBJECT, seed)
  const removed: string[] = []
  return {
    records,
    removed,
    async load(subject) {
      return records.get(subject) ?? null
    },
    async save(subject, tenantId, delegation) {
      records.set(subject, { tenantId, delegation })
      return true
    },
    async remove(subject) {
      removed.push(subject)
      records.delete(subject)
    }
  }
}

interface RuntimeOptions {
  store: CollaborationGraphDelegationStore
  exchange?: (input: { tenantId: string; refreshToken: string }) => Promise<EntraTokenResponse>
  now?: number
}

function runtime(options: RuntimeOptions): CollaborationGraphDelegationRuntime & { exchanges: string[] } {
  const exchanges: string[] = []
  return {
    exchanges,
    store: options.store,
    async exchangeRefreshToken(input) {
      exchanges.push(input.refreshToken)
      if (options.exchange) return options.exchange(input)
      return {
        ok: true,
        status: 200,
        access_token: 'graph-access-token',
        refresh_token: 'rotated-refresh',
        expires_in: 3600,
        scope: `openid ${REQUIRED_GRAPH_MEMBERSHIP_SCOPE}`
      }
    },
    now() {
      return options.now ?? 1_000_000
    }
  }
}

test('a persisted delegation renews and returns a current delegated access token', async () => {
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({ store, now: 1_000_000 })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)

  assert.equal(result.status, 'available')
  if (result.status !== 'available') return
  assert.equal(result.accessToken, 'graph-access-token')
  assert.equal(result.tenantId, TENANT)
  assert.equal(result.expiresAt, 1_000_000 + 3600 * 1000)
  // The renewed (rotated) credential + cached access token are persisted.
  assert.equal(store.records.get(SUBJECT)?.delegation.refreshToken, 'rotated-refresh')
  assert.equal(store.records.get(SUBJECT)?.delegation.accessToken, 'graph-access-token')
})

test('membership never reads a grant-time group snapshot: only the delegation answers', async () => {
  // The store carries only a refresh credential — there is nowhere to read a
  // group snapshot from, and resolution still requires a live Entra exchange.
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({ store })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'available')
  assert.deepEqual(rt.exchanges, ['seed-refresh'])
})

test('a still-fresh cached access token is reused without a refresh exchange', async () => {
  const store = memoryStore({
    tenantId: TENANT,
    delegation: {
      refreshToken: 'seed-refresh',
      accessToken: 'cached-access-token',
      accessTokenExpiresAt: 2_000_000
    }
  })
  const rt = runtime({ store, now: 1_000_000 })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'available')
  if (result.status === 'available') assert.equal(result.accessToken, 'cached-access-token')
  assert.deepEqual(rt.exchanges, []) // no renewal needed
})

test('an access token inside the expiry skew is renewed, not reused', async () => {
  const store = memoryStore({
    tenantId: TENANT,
    delegation: {
      refreshToken: 'seed-refresh',
      accessToken: 'cached-access-token',
      accessTokenExpiresAt: 1_000_000 + 30_000 // within the 60s skew
    }
  })
  const rt = runtime({ store, now: 1_000_000 })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'available')
  if (result.status === 'available') assert.equal(result.accessToken, 'graph-access-token')
  assert.deepEqual(rt.exchanges, ['seed-refresh'])
})

test('no persisted delegation fails closed as missing', async () => {
  const rt = runtime({ store: memoryStore(null) })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'missing')
  if (result.status !== 'available') assert.equal(result.retryable, false)
  assert.deepEqual(rt.exchanges, [])
})

test('a rejected refresh credential is revoked and the dead grant is purged', async () => {
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({
    store,
    exchange: async () => ({ ok: false, status: 400, error: 'invalid_grant', error_description: 'expired' })
  })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'revoked')
  if (result.status !== 'available') assert.equal(result.retryable, false)
  assert.deepEqual(store.removed, [SUBJECT])
  assert.equal(store.records.has(SUBJECT), false)
})

test('interaction_required is also treated as revoked and purged', async () => {
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({ store, exchange: async () => ({ ok: false, status: 400, error: 'interaction_required' }) })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'revoked')
  assert.deepEqual(store.removed, [SUBJECT])
})

test('a refresh lacking the directory read permission is insufficient', async () => {
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({
    store,
    exchange: async () => ({ ok: true, status: 200, access_token: 'graph-access-token', scope: 'openid offline_access' })
  })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'insufficient')
  if (result.status !== 'available') assert.equal(result.retryable, false)
})

test('a transient Entra failure is temporarily unavailable and retryable', async () => {
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({ store, exchange: async () => ({ ok: false, status: 503, error: 'temporarily_unavailable' }) })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'temporarily_unavailable')
  if (result.status !== 'available') assert.equal(result.retryable, true)
  // A transient failure must NOT purge the still-valid delegation.
  assert.deepEqual(store.removed, [])
  assert.equal(store.records.has(SUBJECT), true)
})

test('an unreachable store fails closed as temporarily unavailable', async () => {
  const store: CollaborationGraphDelegationStore = {
    async load() {
      throw new Error('dynamodb unreachable')
    },
    async save() {
      return true
    },
    async remove() {}
  }
  const rt = runtime({ store })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'temporarily_unavailable')
  if (result.status !== 'available') assert.equal(result.retryable, true)
})

test('a thrown Entra exchange fails closed as temporarily unavailable', async () => {
  const store = memoryStore({ tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } })
  const rt = runtime({
    store,
    exchange: async () => {
      throw new Error('network reset')
    }
  })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'temporarily_unavailable')
})

test('a successful token is still returned when persisting the rotation fails', async () => {
  const store: CollaborationGraphDelegationStore = {
    async load() {
      return { tenantId: TENANT, delegation: { refreshToken: 'seed-refresh' } }
    },
    async save() {
      throw new Error('kms write failed')
    },
    async remove() {}
  }
  const rt = runtime({ store, now: 1_000_000 })
  const result = await resolveCollaborationGraphDelegation(SUBJECT, rt)
  assert.equal(result.status, 'available')
  if (result.status === 'available') assert.equal(result.accessToken, 'graph-access-token')
})
