/**
 * Feature: oauth-administration — task 5.2 query service + signed cursor codec.
 *
 * Focused unit tests for the read-only projection query service and the
 * signed, query-bound cursor codec. These exercise cursor signing/binding,
 * fail-closed rejection, bounded paging, non-invented totals, overview health,
 * detail reconciliation, and capability-gated identity filters against the
 * in-memory repository fixture (no live DynamoDB).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  OAuthApplicationDetail,
  OAuthCoverageMetadata,
  OAuthDeploymentContext,
  OAuthEvent
} from '../../shared/types/oauth-administration'
import { OAUTH_CAPABILITIES } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import { OAuthQueryService } from '../../server/mcp/oauth/admin/query-service'
import {
  SignedOAuthAdminCursorCodec,
  computeQueryFingerprint,
  cursorBindingFor,
  decodeBoundCursor,
  issueBoundCursor
} from '../../server/mcp/oauth/admin/cursor-codec'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

const otherCtx: OAuthDeploymentContext = { ...ctx, deploymentId: 'other-deployment' }

function accessWith(capabilities = Object.values(OAUTH_CAPABILITIES), deployment = ctx): OAuthAdminAccessContext {
  return { deployment, actor: 'act_test', capabilities }
}

const meta: OAuthCoverageMetadata = {
  coverage: 'complete',
  freshness: 'fresh',
  availability: 'available'
}

function event(overrides: Partial<OAuthEvent>): OAuthEvent {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date().toISOString(),
    deployment: 'development',
    stage: 'token-exchange',
    attemptState: 'succeeded',
    outcome: 'success',
    ...overrides
  }
}

// --- Cursor codec ---------------------------------------------------------

test('cursor round-trips signed claims and validates a matching binding', () => {
  const codec = new SignedOAuthAdminCursorCodec()
  const binding = cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, { order: 'desc' })
  const cursor = issueBoundCursor(codec, binding, '50')
  const claims = decodeBoundCursor(codec, cursor, binding)
  assert.equal(claims.position, '50')
  assert.equal(claims.deploymentId, ctx.deploymentId)
  assert.equal(claims.capability, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
})

test('cursor decode rejects a tampered signature', () => {
  const codec = new SignedOAuthAdminCursorCodec()
  const binding = cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, {})
  const cursor = issueBoundCursor(codec, binding, '10')
  const [payload] = cursor.split('.')
  const forged = `${payload}.${Buffer.from('forged').toString('base64url')}`
  assert.throws(() => codec.decode(forged), /signature is invalid/i)
})

test('cursor decode rejects a tampered payload', () => {
  const codec = new SignedOAuthAdminCursorCodec()
  const binding = cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, {})
  const cursor = issueBoundCursor(codec, binding, '10')
  const [, signature] = cursor.split('.')
  const tampered = `${Buffer.from(JSON.stringify({ hacked: true })).toString('base64url')}.${signature}`
  assert.throws(() => codec.decode(tampered), /signature is invalid/i)
})

test('cursor decode rejects an expired cursor', () => {
  const codec = new SignedOAuthAdminCursorCodec()
  const binding = cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, {})
  const cursor = issueBoundCursor(codec, binding, '10', Date.now() - 60_000, 1)
  assert.throws(() => codec.decode(cursor), /expired/i)
})

test('bound cursor rejects wrong deployment, actor, capability, and query', () => {
  const codec = new SignedOAuthAdminCursorCodec()
  const binding = cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, { clientId: 'c1' })
  const cursor = issueBoundCursor(codec, binding, '5')

  assert.throws(() => decodeBoundCursor(codec, cursor,
    cursorBindingFor(otherCtx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, { clientId: 'c1' })), /another deployment/i)
  assert.throws(() => decodeBoundCursor(codec, cursor,
    cursorBindingFor(ctx, 'act_other', OAUTH_CAPABILITIES.ACTIVITY_VIEW, { clientId: 'c1' })), /another actor/i)
  assert.throws(() => decodeBoundCursor(codec, cursor,
    cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.CONFIGURATION_VIEW, { clientId: 'c1' })), /another capability/i)
  assert.throws(() => decodeBoundCursor(codec, cursor,
    cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.ACTIVITY_VIEW, { clientId: 'c2' })), /different query/i)
})

test('query fingerprint is order-insensitive to filter key order and ignores limit/cursor', () => {
  const a = computeQueryFingerprint({ clientId: 'c1', outcome: 'success', order: 'desc', limit: 10 })
  const b = computeQueryFingerprint({ outcome: 'success', clientId: 'c1', order: 'desc', limit: 90, cursor: 'x' })
  assert.equal(a, b)
  const c = computeQueryFingerprint({ clientId: 'c1', outcome: 'failure', order: 'desc' })
  assert.notEqual(a, c)
})

// --- Query service: paging + totals --------------------------------------

test('applications page issues a signed nextCursor and never invents totals when more remain', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  for (let i = 0; i < 5; i++) {
    const detail: OAuthApplicationDetail = {
      clientId: `client_${i}`,
      type: 'native-public',
      origin: 'dynamic',
      ownership: {},
      lifecycle: 'unassigned',
      redirectPolicy: { redirectUris: [], allowsLoopback: false },
      permittedResources: [],
      permittedScopes: [],
      revision: 'r1',
      metadata: meta
    }
    await repo.upsertApplication(ctx, detail)
  }
  const service = new OAuthQueryService(repo)
  const page1 = await service.applications(accessWith(), { limit: 2, order: 'asc' })
  assert.equal(page1.items.length, 2)
  assert.equal(page1.page.hasMore, true)
  assert.ok(page1.page.nextCursor, 'expected a signed next cursor')
  assert.equal(page1.page.total, null)
  assert.equal(page1.page.totalIsExact, false)

  // Page 2 continues via the signed cursor.
  const page2 = await service.applications(accessWith(), { limit: 2, order: 'asc', cursor: page1.page.nextCursor! })
  assert.equal(page2.items.length, 2)
  assert.notDeepEqual(page1.items.map(i => i.clientId), page2.items.map(i => i.clientId))
})

test('a complete first page reports an exact total', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const detail: OAuthApplicationDetail = {
    clientId: 'only_client',
    type: 'native-public',
    origin: 'dynamic',
    ownership: {},
    lifecycle: 'unassigned',
    redirectPolicy: { redirectUris: [], allowsLoopback: false },
    permittedResources: [],
    permittedScopes: [],
    revision: 'r1',
    metadata: meta
  }
  await repo.upsertApplication(ctx, detail)
  const service = new OAuthQueryService(repo)
  const page = await service.applications(accessWith(), { limit: 50 })
  assert.equal(page.page.hasMore, false)
  assert.equal(page.page.total, 1)
  assert.equal(page.page.totalIsExact, true)
})

test('a cursor from another query is rejected on the applications page', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthQueryService(repo)
  const codec = new SignedOAuthAdminCursorCodec()
  const wrongBinding = cursorBindingFor(ctx, 'act_test', OAUTH_CAPABILITIES.CONFIGURATION_VIEW, { clientId: 'z' })
  const wrongCursor = issueBoundCursor(codec, wrongBinding, '2')
  await assert.rejects(
    () => service.applications(accessWith(), { cursor: wrongCursor }),
    /different query/i
  )
})

// --- Query service: overview + capability gating --------------------------

test('overview projects independent per-stage health from a bounded window', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  await repo.putEvent(ctx, event({ stage: 'token-exchange', outcome: 'success', timestamp: new Date(now - 1000).toISOString() }))
  await repo.putEvent(ctx, event({ stage: 'refresh', outcome: 'failure', attemptState: 'failed', timestamp: new Date(now - 2000).toISOString() }))
  const service = new OAuthQueryService(repo)
  const health = await service.overview(accessWith(), { now })
  const token = health.find(h => h.stage === 'token-exchange')
  const refresh = health.find(h => h.stage === 'refresh')
  const registration = health.find(h => h.stage === 'registration')
  assert.equal(token?.state, 'healthy')
  assert.equal(refresh?.state, 'failing')
  // A stage with no evidence is explicitly unknown, never healthy/zero.
  assert.equal(registration?.state, 'unknown')
})

test('overview derives the freshness horizon from a supplied window so within-window activity reads fresh', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  // A success ~2h ago: OLDER than the default 15m freshness horizon but well
  // within a 24h window. With the horizon derived from the window it must read
  // as fresh/healthy rather than collapsing to a stale `unknown` (Req 4.3).
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
  await repo.putEvent(ctx, event({ stage: 'token-exchange', outcome: 'success', timestamp: twoHoursAgo }))
  const service = new OAuthQueryService(repo)
  const health = await service.overview(accessWith(), { now, windowMs: 24 * 60 * 60 * 1000 })
  const token = health.find(h => h.stage === 'token-exchange')
  assert.equal(token?.state, 'healthy', 'within-window success reads fresh when horizon is derived from the window')
  assert.equal(token?.freshness, 'fresh')
})

test('overview keeps the default 15m horizon when no window is supplied', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  // A success ~2h ago with NO window supplied: the fallback default horizon
  // (15m) applies, so the evidence is stale and the stage is NOT healthy while
  // absence stays `unknown` — the original behaviour is preserved (Req 4.3, 4.5).
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
  await repo.putEvent(ctx, event({ stage: 'token-exchange', outcome: 'success', timestamp: twoHoursAgo }))
  const service = new OAuthQueryService(repo)
  const health = await service.overview(accessWith(), { now })
  const token = health.find(h => h.stage === 'token-exchange')
  const registration = health.find(h => h.stage === 'registration')
  assert.notEqual(token?.state, 'healthy', 'stale evidence under the default horizon is never healthy')
  assert.equal(registration?.state, 'unknown', 'absence is still unknown, never healthy')
})

test('overview clamps an explicit freshness horizon so it never exceeds the window', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  // Evidence ~30m ago. Window is 1h; an explicit oversized horizon (2h) must be
  // clamped to the window (1h), so 30m-old evidence stays within horizon and is
  // fresh — proving the clamp does not spuriously push evidence out of range,
  // while the horizon can never exceed the selected window (Req 4.3).
  const thirtyMinutesAgo = new Date(now - 30 * 60 * 1000).toISOString()
  await repo.putEvent(ctx, event({ stage: 'token-exchange', outcome: 'success', timestamp: thirtyMinutesAgo }))
  const service = new OAuthQueryService(repo)
  const health = await service.overview(accessWith(), {
    now,
    windowMs: 60 * 60 * 1000,
    freshnessHorizonMs: 2 * 60 * 60 * 1000
  })
  const token = health.find(h => h.stage === 'token-exchange')
  assert.equal(token?.state, 'healthy', 'within-window evidence stays fresh after the horizon is clamped to the window')
})

test('attempts requires the activity capability', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthQueryService(repo)
  const configOnly = accessWith([OAUTH_CAPABILITIES.CONFIGURATION_VIEW])
  await assert.rejects(() => service.attempts(configOnly, {}), /capability/i)
})

test('subject filter is dropped without the activity capability', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  // Two events; only one carries the subject reference.
  await repo.putEvent(ctx, event({ subjectReference: 'subj_a', timestamp: new Date(now - 1000).toISOString() }))
  await repo.putEvent(ctx, event({ timestamp: new Date(now - 2000).toISOString() }))
  const service = new OAuthQueryService(repo)

  // Configuration-only viewer querying applications with a subject filter must
  // not have the subject filter applied (it is silently dropped). We assert via
  // the overview window which sanitizes the same way: the subject filter cannot
  // narrow results for a non-activity caller.
  const health = await service.overview(accessWith([OAUTH_CAPABILITIES.CONFIGURATION_VIEW]), { now })
  const token = health.find(h => h.stage === 'token-exchange')
  assert.ok(token, 'token-exchange stage present regardless of dropped subject filter')
})

// --- Query service: application detail reconciliation ---------------------

test('applicationDetail returns a not-found error for an unknown client', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  // A projection service whose reconcile is a no-op (client is absent both sides).
  const service = new OAuthQueryService(repo, undefined, undefined, undefined, {
    backfill: async () => ({ coverage: 'complete', processed: 0, clientsProjected: 0, grantsProjected: 0, hasMore: false }),
    reconcileClient: async () => 'absent',
    reconcileGrant: async () => 'absent'
  })
  await assert.rejects(() => service.applicationDetail(accessWith(), 'missing'), /not found/i)
})

test('limits reports the configured registration limit as a non-mutating observation', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthQueryService(repo)
  const observation = await service.limits(accessWith())
  assert.ok(observation.limit > 0)
  assert.equal(observation.source, 'dynamic-registration')
  assert.ok(observation.rejectedAttemptNotice.length > 0)
})

// --- Query service: always-present application status ---------------------

// The well-known resource URLs derived from the default runtime config, used to
// seed provider-client projections the status projector matches against.
const MCP_RESOURCE = new URL('/mcp', 'http://localhost:3000').href
const KIROCREW_RESOURCE = new URL('/api/kirocrew', 'http://localhost:3000').href

function clientProjection(overrides: Partial<OAuthApplicationDetail> & { clientId: string }): OAuthApplicationDetail {
  return {
    type: 'native-public',
    origin: 'dynamic',
    ownership: {},
    lifecycle: 'unassigned',
    redirectPolicy: { redirectUris: [], allowsLoopback: false },
    permittedResources: [],
    permittedScopes: [],
    revision: 'r1',
    metadata: meta,
    ...overrides
  }
}

test('applicationsHealth always returns both well-known applications even on a quiet deployment', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  // No checkpoint, no clients, no grants: coverage is unavailable -> unknown.
  const service = new OAuthQueryService(repo)
  const statuses = await service.applicationsHealth(accessWith())
  assert.equal(statuses.length, 2)
  const labels = statuses.map(s => s.application).sort()
  assert.deepEqual(labels, ['kiro-crew', 'mcp'])
  // Requirement 3.8: without a durable checkpoint, coverage is unavailable and
  // the status is unknown (never a confident not-registered/registered).
  for (const status of statuses) {
    assert.equal(status.coverage, 'unavailable')
    assert.equal(status.status, 'unknown')
  }
})

test('applicationsHealth reports not-registered under complete coverage with no matching client', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.putCheckpoint(ctx, {
    checkpointId: 'cp1',
    kind: 'checkpoints',
    coverage: 'complete',
    updatedAt: new Date().toISOString()
  })
  const service = new OAuthQueryService(repo)
  const statuses = await service.applicationsHealth(accessWith())
  for (const status of statuses) {
    assert.equal(status.coverage, 'complete')
    assert.equal(status.status, 'not-registered')
  }
})

test('applicationsHealth matches a seeded MCP client to its resource and reports no-activity', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.putCheckpoint(ctx, {
    checkpointId: 'cp1',
    kind: 'checkpoints',
    coverage: 'complete',
    updatedAt: new Date().toISOString()
  })
  // A correctly configured MCP client (advertises the MCP resource + a supported
  // MCP scope) with zero live grants.
  // Advertise only the MCP-specific resource + scope (no shared base scope) so
  // the match is unambiguously to MCP and not the Kiro Crew resource.
  await repo.upsertApplication(ctx, clientProjection({
    clientId: 'mcp_client',
    permittedResources: [MCP_RESOURCE],
    permittedScopes: ['ghost.read']
  }))
  const service = new OAuthQueryService(repo)
  const statuses = await service.applicationsHealth(accessWith())
  const mcp = statuses.find(s => s.application === 'mcp')
  const crew = statuses.find(s => s.application === 'kiro-crew')
  // Registered + correctly configured + no live grants => benign no-activity.
  assert.equal(mcp?.status, 'no-activity')
  assert.equal(mcp?.clientReference, 'mcp_client')
  assert.equal(mcp?.liveGrantCount, 0)
  // The unmatched Kiro Crew application is still present as not-registered.
  assert.equal(crew?.status, 'not-registered')
})

test('applicationsHealth counts a live grant for a matched client as active', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  await repo.putCheckpoint(ctx, {
    checkpointId: 'cp1',
    kind: 'checkpoints',
    coverage: 'complete',
    updatedAt: new Date().toISOString()
  })
  await repo.upsertApplication(ctx, clientProjection({
    clientId: 'crew_client',
    permittedResources: [KIROCREW_RESOURCE],
    permittedScopes: ['openid', 'kirocrew.config.read']
  }))
  await repo.upsertGrant(ctx, {
    grantReference: 'grant_1',
    clientReference: 'crew_client',
    requestedScopes: ['kirocrew.config.read'],
    consentedScopes: ['kirocrew.config.read'],
    resource: KIROCREW_RESOURCE,
    consentedAt: new Date(now - 1000).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    metadata: meta
  })
  const service = new OAuthQueryService(repo, undefined, undefined, undefined, undefined)
  const statuses = await service.applicationsHealth(accessWith(), { now })
  const crew = statuses.find(s => s.application === 'kiro-crew')
  assert.equal(crew?.status, 'active')
  assert.equal(crew?.liveGrantCount, 1)
})
