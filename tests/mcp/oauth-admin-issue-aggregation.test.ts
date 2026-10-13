/**
 * Feature: oauth-administration — task 5.4 idempotent issue aggregation.
 *
 * Focused unit tests for the pure grouping/classification transform and the
 * aggregation service. These exercise fixed-window/dimension grouping, event-ID
 * idempotency (no double counting), separate anonymous vs identified counts,
 * category classification with unverified client-side causes, and the rule that
 * aggregation never fabricates recovery or an administrator disposition. They
 * run against the in-memory repository fixture (no live DynamoDB).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  OAuthDeploymentContext,
  OAuthEvent
} from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import {
  OAuthIssueAggregationService,
  aggregateIssueGroups,
  classifyIssueCategory,
  windowStartMsFor,
  ISSUE_WINDOW_MS
} from '../../server/mcp/oauth/admin/issue-aggregation-service'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

/** A fixed base time floored to a window boundary for deterministic windows. */
const BASE_MS = windowStartMsFor(new Date('2026-08-14T15:07:00.000Z').getTime())

function failEvent(overrides: Partial<OAuthEvent> = {}): OAuthEvent {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date(BASE_MS + 1000).toISOString(),
    deployment: 'development',
    stage: 'token-exchange',
    attemptState: 'failed',
    outcome: 'failure',
    errorCode: 'invalid_grant',
    ...overrides
  }
}

// --- Pure transform: grouping --------------------------------------------

test('groups failures by deployment/stage/error/client/resource/fixed window', () => {
  const events: OAuthEvent[] = [
    failEvent({ eventId: 'a', clientReference: 'c1', resourceReference: 'r1' }),
    failEvent({ eventId: 'b', clientReference: 'c1', resourceReference: 'r1' }),
    // Different client => different group.
    failEvent({ eventId: 'c', clientReference: 'c2', resourceReference: 'r1' }),
    // Different stage => different group.
    failEvent({ eventId: 'd', stage: 'refresh', clientReference: 'c1', resourceReference: 'r1' })
  ]
  const groups = aggregateIssueGroups(ctx, events)
  assert.equal(groups.length, 3)
  const c1 = groups.find(g => g.clientReference === 'c1' && g.stage === 'token-exchange')
  assert.ok(c1)
  assert.equal(c1?.count, 2)
})

test('events in different 15-minute windows form different groups', () => {
  const events: OAuthEvent[] = [
    failEvent({ eventId: 'a', timestamp: new Date(BASE_MS + 1000).toISOString() }),
    failEvent({ eventId: 'b', timestamp: new Date(BASE_MS + ISSUE_WINDOW_MS + 1000).toISOString() })
  ]
  const groups = aggregateIssueGroups(ctx, events)
  assert.equal(groups.length, 2)
  for (const g of groups) assert.equal(g.count, 1)
})

test('only failure/denied outcomes are aggregated; success is ignored', () => {
  const events: OAuthEvent[] = [
    failEvent({ eventId: 'a' }),
    failEvent({ eventId: 'b', outcome: 'denied', attemptState: 'denied' }),
    failEvent({ eventId: 'c', outcome: 'success', attemptState: 'succeeded' }),
    failEvent({ eventId: 'd', outcome: 'unknown', attemptState: 'unknown' })
  ]
  const groups = aggregateIssueGroups(ctx, events)
  // 'a' (failure) and 'b' (denied) share the same group; success/unknown drop.
  const total = groups.reduce((sum, g) => sum + g.count, 0)
  assert.equal(total, 2)
})

// --- Idempotency ----------------------------------------------------------

test('a repeated event ID never double-counts', () => {
  const events: OAuthEvent[] = [
    failEvent({ eventId: 'dup' }),
    failEvent({ eventId: 'dup' }),
    failEvent({ eventId: 'dup' })
  ]
  const groups = aggregateIssueGroups(ctx, events)
  assert.equal(groups.length, 1)
  assert.equal(groups[0]?.count, 1)
})

test('re-aggregating the same window yields identical counts and group ids', () => {
  const events: OAuthEvent[] = [
    failEvent({ eventId: 'a' }),
    failEvent({ eventId: 'b' })
  ]
  const first = aggregateIssueGroups(ctx, events)
  const second = aggregateIssueGroups(ctx, [...events, ...events])
  assert.equal(first.length, second.length)
  assert.equal(first[0]?.groupId, second[0]?.groupId)
  assert.equal(first[0]?.count, second[0]?.count)
})

// --- Anonymous vs identified ----------------------------------------------

test('anonymous attempts stay separate from identified users', () => {
  const events: OAuthEvent[] = [
    failEvent({ eventId: 'a' }), // no subject => anonymous
    failEvent({ eventId: 'b', subjectReference: 'sub_1' }),
    failEvent({ eventId: 'c', subjectReference: 'sub_2' })
  ]
  const [group] = aggregateIssueGroups(ctx, events)
  assert.ok(group)
  assert.equal(group?.count, 3)
  assert.equal(group?.anonymousCount, 1)
  assert.equal(group?.identifiedCount, 2)
})

// --- Category classification ----------------------------------------------

test('classifies categories from stage and safe error evidence', () => {
  assert.equal(classifyIssueCategory('protected-resource-discovery'), 'discovery')
  assert.equal(classifyIssueCategory('provider-storage'), 'storage-permission')
  assert.equal(classifyIssueCategory('crew-profile-retrieval'), 'profile')
  assert.equal(classifyIssueCategory('token-exchange', 'invalid_redirect_uri'), 'metadata-redirect')
  assert.equal(classifyIssueCategory('authorization', 'pkce_verification_failed'), 'pkce-state')
  assert.equal(classifyIssueCategory('registration', undefined, 'rate_limited'), 'quota')
  assert.equal(classifyIssueCategory('token-exchange', undefined, 'tls_handshake'), 'transport-tls')
})

test('marks an unobserved client-side authorization failure as unverified', () => {
  const [group] = aggregateIssueGroups(ctx, [
    failEvent({ eventId: 'a', stage: 'authorization', errorCode: 'callback_error' })
  ])
  assert.ok(group)
  assert.equal(group?.unverified, true)
  const [serverGroup] = aggregateIssueGroups(ctx, [
    failEvent({ eventId: 'b', stage: 'token-exchange' })
  ])
  assert.equal(serverGroup?.unverified, false)
})

// --- Service: persistence + disposition/verification separation -----------

test('aggregateBatch persists one projection per group readable via getIssue', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueAggregationService(repo)
  const result = await service.aggregateBatch(ctx, [
    failEvent({ eventId: 'a' }),
    failEvent({ eventId: 'b' })
  ])
  assert.equal(result.groups, 1)
  const groups = aggregateIssueGroups(ctx, [failEvent({ eventId: 'a' }), failEvent({ eventId: 'b' })])
  const stored = await repo.getIssue(ctx, groups[0]!.groupId)
  assert.ok(stored)
  assert.equal(stored?.count, 2)
  assert.equal(stored?.disposition, 'open')
  assert.equal(stored?.verification, 'no-recovery-evidence')
})

test('re-aggregation preserves administrator disposition and never fabricates recovery', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueAggregationService(repo)
  const events = [failEvent({ eventId: 'a' })]
  await service.aggregateBatch(ctx, events)
  const [group] = aggregateIssueGroups(ctx, events)

  // Simulate an administrator disposition + notes set by the operation service.
  const initial = await repo.getIssue(ctx, group!.groupId)
  assert.ok(initial)
  await repo.upsertIssue(ctx, {
    ...initial!,
    disposition: 'investigating',
    owner: 'admin@example.test',
    notes: 'looking into it',
    mitigation: 'temporary workaround'
  })

  // Re-aggregate the same window (idempotent recompute).
  await service.aggregateBatch(ctx, events)
  const after = await repo.getIssue(ctx, group!.groupId)
  assert.ok(after)
  // Administrator-owned fields are preserved.
  assert.equal(after?.disposition, 'investigating')
  assert.equal(after?.owner, 'admin@example.test')
  assert.equal(after?.notes, 'looking into it')
  assert.equal(after?.mitigation, 'temporary workaround')
  // Observed evidence recomputed; recovery never invented.
  assert.equal(after?.count, 1)
  assert.notEqual(after?.verification, 'observed-recovery')
})

test('aggregateWindow reads a bounded window from the repository and projects issues', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = BASE_MS + ISSUE_WINDOW_MS - 1000
  await repo.putEvent(ctx, failEvent({ eventId: 'a', timestamp: new Date(BASE_MS + 1000).toISOString() }))
  await repo.putEvent(ctx, failEvent({ eventId: 'b', timestamp: new Date(BASE_MS + 2000).toISOString() }))
  // A success in-window must not create an issue.
  await repo.putEvent(ctx, failEvent({ eventId: 'c', outcome: 'success', attemptState: 'succeeded' }))

  const service = new OAuthIssueAggregationService(repo)
  const result = await service.aggregateWindow(ctx, { from: new Date(BASE_MS).toISOString(), to: new Date(now).toISOString(), now })
  assert.equal(result.groups, 1)
  assert.equal(result.events, 2)
})
