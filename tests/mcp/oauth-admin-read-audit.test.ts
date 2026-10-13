/**
 * Feature: oauth-administration — task 12.1 restricted-read audit + audit query.
 *
 * Focused unit tests for the restricted-read audit helper and the audit read
 * path. These prove:
 *   - A restricted, identity-bearing read (grants / attempts / issue detail /
 *     the audit trail itself) writes exactly ONE safe `referenceKind: 'read'`
 *     audit record with a 90-day logical expiry and no raw filter values.
 *   - A non-restricted read (configuration / overview / applications list /
 *     limits) does NOT write any `read` audit record.
 *   - The audit query returns operation records carrying safe change diffs
 *     (changedFields + before/after) and verification evidence, and EXCLUDES
 *     logically-expired rows (>90 days).
 *
 * All tests run against the in-memory repository fixture (no live DynamoDB).
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  OAuthApplicationDetail,
  OAuthAuditRecord,
  OAuthCoverageMetadata,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthGrantSummary,
  OAuthIssue
} from '../../shared/types/oauth-administration'
import { OAUTH_CAPABILITIES } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import { OAuthQueryService } from '../../server/mcp/oauth/admin/query-service'
import { OAuthReadAuditWriter, readQueryFingerprint } from '../../server/mcp/oauth/admin/read-audit'
import { logicalExpiryFor } from '../../server/mcp/oauth/admin/repository-support'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'

process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function accessWith(capabilities = Object.values(OAUTH_CAPABILITIES)): OAuthAdminAccessContext {
  return { deployment: ctx, actor: 'act_test', capabilities }
}

const meta: OAuthCoverageMetadata = {
  coverage: 'complete',
  freshness: 'fresh',
  availability: 'available'
}

/** Read ALL audit records for the deployment (a 90-day window desc page). */
async function allAudit(repo: InMemoryOAuthAdminRepository): Promise<OAuthAuditRecord[]> {
  const page = await repo.queryAuditRecords(ctx, { limit: 100, order: 'desc' })
  return page.items
}

function grant(overrides: Partial<OAuthGrantSummary> = {}): OAuthGrantSummary {
  return {
    grantReference: `grant_${Math.random().toString(36).slice(2)}`,
    clientReference: 'client_a',
    requestedScopes: ['read'],
    consentedScopes: ['read'],
    metadata: meta,
    ...overrides
  } as OAuthGrantSummary
}

function issue(overrides: Partial<OAuthIssue> = {}): OAuthIssue {
  return {
    groupId: 'issue_1',
    groupKey: 'development#token-exchange#invalid_grant',
    windowStart: new Date().toISOString(),
    windowEnd: new Date().toISOString(),
    count: 3,
    firstObservedAt: new Date().toISOString(),
    lastObservedAt: new Date().toISOString(),
    anonymousCount: 1,
    identifiedCount: 2,
    severity: 'medium',
    category: 'grant',
    disposition: 'open',
    verification: 'unverified',
    revision: 'rev_1',
    ...overrides
  } as OAuthIssue
}

function event(overrides: Partial<OAuthEvent> = {}): OAuthEvent {
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

// --- read fingerprint -----------------------------------------------------

test('read query fingerprint is order-insensitive and never contains raw filter values', () => {
  const a = readQueryFingerprint({ subject: 'user@example.test', clientId: 'c1', outcome: 'failure' })
  const b = readQueryFingerprint({ outcome: 'failure', clientId: 'c1', subject: 'user@example.test' })
  const c = readQueryFingerprint({ clientId: 'c1', outcome: 'failure' })
  assert.equal(a, b, 'same filters in any order share a fingerprint')
  assert.notEqual(a, c, 'a different filter set changes the fingerprint')
  // The fingerprint is an opaque hash, never the raw identity-bearing value.
  assert.ok(!a.includes('user@example.test'))
  assert.ok(!a.includes('example'))
})

test('read fingerprint ignores paging controls so paged reads share it', () => {
  const a = readQueryFingerprint({ clientId: 'c1', limit: 10, order: 'asc', cursor: 'x' })
  const b = readQueryFingerprint({ clientId: 'c1', limit: 90, order: 'desc', cursor: 'y' })
  assert.equal(a, b)
})

// --- restricted reads write a single safe `read` audit --------------------

test('reading grants writes one safe read audit record with no raw filter values', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertGrant(ctx, grant())
  const service = new OAuthQueryService(repo)

  await service.grants(accessWith(), { subject: 'user@example.test', order: 'desc' })

  const reads = (await allAudit(repo)).filter(r => r.referenceKind === 'read')
  assert.equal(reads.length, 1, 'exactly one read audit per restricted read')
  const [record] = reads
  assert.equal(record.referenceKind, 'read')
  assert.equal(record.referenceId, 'read:grants')
  assert.equal(record.capability, OAUTH_CAPABILITIES.ACTIVITY_VIEW)
  assert.equal(record.actor, 'act_test')
  assert.equal(record.deployment, 'development')
  assert.equal(record.outcome, 'success')
  // 90-day logical expiry present.
  assert.ok(record.logicalExpiresAt)
  assert.ok(record.ttl && record.ttl > 0)
  // Evidence is bounded/safe and never carries the raw subject.
  const serialized = JSON.stringify(record)
  assert.ok(!serialized.includes('user@example.test'), 'raw subject filter is never persisted')
  assert.equal((record.evidence as any)?.resource, 'grants')
  assert.ok(typeof (record.evidence as any)?.queryFingerprint === 'string')
})

test('reading attempts writes one read audit bounded to the returned count', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.putEvent(ctx, event())
  const service = new OAuthQueryService(repo)

  await service.attempts(accessWith(), { order: 'desc' })

  const reads = (await allAudit(repo)).filter(r => r.referenceKind === 'read' && r.referenceId === 'read:attempts')
  assert.equal(reads.length, 1)
  assert.equal(typeof (reads[0].evidence as any)?.returned, 'number')
})

test('reading a single issue detail writes a read audit scoped to the issue id', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue({ groupId: 'issue_42' }))
  const service = new OAuthQueryService(repo)

  await service.issueDetail(accessWith(), 'issue_42')

  const reads = (await allAudit(repo)).filter(r => r.referenceKind === 'read')
  assert.equal(reads.length, 1)
  assert.equal(reads[0].referenceId, 'read:issue:issue_42')
})

test('reading the audit trail writes a read audit but does not include its own record in the page', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthQueryService(repo)

  const page = await service.audit(accessWith(), { order: 'desc' })
  // The returned page precedes the audit-of-the-read write, so it is empty.
  assert.equal(page.items.length, 0)

  const reads = (await allAudit(repo)).filter(r => r.referenceKind === 'read')
  assert.equal(reads.length, 1)
  assert.equal(reads[0].referenceId, 'read:audit')
})

// --- non-restricted reads do NOT audit ------------------------------------

test('a non-restricted configuration read writes no audit record', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const service = new OAuthQueryService(repo)

  await service.configuration(accessWith())

  const audit = await allAudit(repo)
  assert.equal(audit.length, 0, 'configuration is not identity-bearing and must not be audited')
})

test('a non-restricted applications-list and limits read writes no audit record', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const detail: OAuthApplicationDetail = {
    clientId: 'client_x',
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

  await service.applications(accessWith(), { limit: 50 })
  await service.limits(accessWith())
  await service.overview(accessWith())

  const audit = await allAudit(repo)
  assert.equal(audit.length, 0, 'inventory list / limits / overview must not be audited')
})

// --- audit query surfaces change diffs + evidence, excludes expired -------

test('audit query returns records carrying safe change diffs and verification evidence', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  const timestamp = new Date(now).toISOString()
  // A representative operation-outcome audit record with a safe diff + evidence.
  await repo.putAuditRecord(ctx, {
    auditId: 'aud_op_outcome',
    timestamp,
    deployment: 'development',
    actor: 'act_test',
    capability: OAUTH_CAPABILITIES.OPERATIONS_MANAGE,
    referenceKind: 'operation',
    referenceId: 'op_123',
    reason: 'investigating',
    changedFields: ['disposition'],
    before: { disposition: 'open' },
    after: { disposition: 'investigating' },
    outcome: 'success',
    evidence: { verificationPreserved: 'unverified' },
    ...logicalExpiryFor(timestamp, now)
  })

  const service = new OAuthQueryService(repo)
  const page = await service.audit(accessWith(), { order: 'desc' })
  const record = page.items.find(r => r.referenceId === 'op_123')
  assert.ok(record, 'the operation audit record is returned')
  assert.deepEqual(record!.changedFields, ['disposition'])
  assert.deepEqual(record!.before, { disposition: 'open' })
  assert.deepEqual(record!.after, { disposition: 'investigating' })
  assert.deepEqual(record!.evidence, { verificationPreserved: 'unverified' })
})

test('audit query excludes logically expired (>90 day) rows', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  const now = Date.now()
  const oldTs = new Date(now - 100 * 24 * 60 * 60 * 1000).toISOString() // 100 days ago
  await repo.putAuditRecord(ctx, {
    auditId: 'aud_expired',
    timestamp: oldTs,
    deployment: 'development',
    actor: 'act_test',
    capability: OAUTH_CAPABILITIES.ACTIVITY_VIEW,
    referenceKind: 'operation',
    referenceId: 'op_expired',
    outcome: 'success',
    ...logicalExpiryFor(oldTs, new Date(oldTs).getTime())
  })

  const service = new OAuthQueryService(repo)
  // A 90-day window ending now cannot include a 100-day-old record; retention
  // filtering also drops it defensively.
  const page = await service.audit(accessWith(), { order: 'desc' })
  assert.ok(!page.items.some(r => r.referenceId === 'op_expired'), 'expired audit row is excluded')
})

// --- best-effort: a read audit failure never fails the read ---------------

test('a read-audit write failure does not fail the restricted read', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertGrant(ctx, grant())
  // A writer whose repository throws on putAuditRecord.
  const failing = new OAuthReadAuditWriter({
    putAuditRecord: async () => { throw new Error('write failed') }
  } as any)
  const service = new OAuthQueryService(repo, undefined, undefined, undefined, undefined, failing)

  const result = await service.grants(accessWith(), {})
  assert.equal(result.items.length, 1, 'the read still succeeds despite an audit write failure')
})
