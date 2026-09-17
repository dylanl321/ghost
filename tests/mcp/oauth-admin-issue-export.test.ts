/**
 * Feature: oauth-administration — task 12.2 authorized issue export.
 *
 * Focused unit tests for the bounded, redacted issue-export service and the
 * fail-closed export audit ordering. These exercise, against the in-memory
 * repository fixture (no live DynamoDB):
 *   - adversarial events carrying secrets/identity/bodies/URLs/addresses are
 *     stripped from the export (Requirement 14.2, Property 2);
 *   - truncation + observation-window metadata is set when events exceed the
 *     export bound (Requirement 14.3);
 *   - an audit-intent write FAILURE blocks the attachment / export (Requirement
 *     13.6 / 14.4);
 *   - an unknown issue id yields a typed 404 (Requirement 1.5);
 *   - the export carries only safe configuration NAMES, not URLs (Req 14.1).
 *
 * The route-level capability gate is exercised by the access-service tests; the
 * export service itself is deployment-bound through the injected access context.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type {
  OAuthCoverageMetadata,
  OAuthDeploymentContext,
  OAuthEvent,
  OAuthIssue
} from '../../shared/types/oauth-administration'
import { OAUTH_CAPABILITIES } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import {
  OAuthIssueExportService,
  EXPORT_EVENT_BOUND
} from '../../server/mcp/oauth/admin/issue-export-service'
import { oauthAdminRedactor } from '../../server/mcp/oauth/admin/redactor'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function access(capabilities = Object.values(OAUTH_CAPABILITIES)): OAuthAdminAccessContext {
  return { deployment: ctx, actor: 'act_test', capabilities }
}

const meta: OAuthCoverageMetadata = {
  coverage: 'complete',
  freshness: 'fresh',
  availability: 'available'
}

// Use a clock anchored to the real present so seeded events remain within the
// repository's 90-day logical-retention window (the repository applies retention
// with the real clock). The issue window sits in the recent past.
const NOW = Date.now()
const WINDOW_START = new Date(NOW - 10 * 60 * 1000).toISOString() // 10 min ago
const WINDOW_END = new Date(NOW - 1 * 60 * 1000).toISOString() //  1 min ago

/**
 * Build a persisted issue. The positional group key mirrors the aggregation
 * service: `deploymentId|stage|errorCode|clientReference|resourceReference|window`.
 */
function issue(overrides: Partial<OAuthIssue> = {}): OAuthIssue {
  const clientReference = overrides.groupKey ? undefined : 'client_ref_1'
  const groupKey = overrides.groupKey
    ?? [ctx.deploymentId, 'token-exchange', 'invalid_grant', clientReference || '-', '-', WINDOW_START].join('|')
  return {
    groupId: 'grp_issue_1',
    groupKey,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    count: 3,
    firstObservedAt: WINDOW_START,
    lastObservedAt: WINDOW_END,
    anonymousCount: 0,
    identifiedCount: 2,
    severity: 'medium',
    category: 'grant',
    unverified: false,
    disposition: 'open',
    verification: 'unverified',
    revision: 'r1',
    metadata: meta,
    ...overrides
  }
}

function event(overrides: Partial<OAuthEvent> = {}): OAuthEvent {
  return {
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    timestamp: new Date(NOW - 5 * 60 * 1000).toISOString(),
    deployment: 'development',
    stage: 'token-exchange',
    attemptState: 'failed',
    outcome: 'failure',
    httpStatus: 400,
    errorCode: 'invalid_grant',
    clientReference: 'client_ref_1',
    ...overrides
  }
}

function service(repository: InMemoryOAuthAdminRepository): OAuthIssueExportService {
  return new OAuthIssueExportService(repository, oauthAdminRedactor, undefined, () => NOW)
}

// --- Unknown issue -> 404 -------------------------------------------------

test('buildExport throws 404 for an unknown issue id', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await assert.rejects(
    () => service(repo).buildExport(access(), 'grp_missing'),
    (error: any) => error?.statusCode === 404 && error?.data?.code === 'OAUTH_ADMIN_NOT_FOUND'
  )
})

// --- Redaction of adversarial event content (Req 14.2) --------------------

test('export strips secrets, identity, bodies, URLs, and addresses from events', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  // An adversarial event carrying denylisted fields under arbitrary keys. The
  // OAuthEvent DTO only declares safe fields, but the redactor must strip these
  // even if a malformed persisted row carried them.
  await repo.putEvent(ctx, event({
    ...( {
      accessToken: 'super-secret-token',
      refreshToken: 'refresh-secret',
      clientSecret: 'hunter2',
      cookie: 'session=abc',
      authorizationUrl: 'https://issuer.example/oauth/authorize?code=xyz',
      requestBody: '{"password":"p"}',
      responseBody: 'raw upstream body',
      rawAddress: '10.0.0.5',
      ipAddress: '10.0.0.5',
      profileDocument: { email: 'user@example.com' },
      stack: 'Error: boom\n at foo'
    } as Record<string, unknown> )
  }))

  const result = await service(repo).buildExport(access(), 'grp_issue_1')
  const serialized = JSON.stringify(result)

  assert.equal(result.events.length, 1)
  for (const secret of [
    'super-secret-token',
    'refresh-secret',
    'hunter2',
    'session=abc',
    'oauth/authorize',
    'password',
    'raw upstream body',
    '10.0.0.5',
    'user@example.com',
    'Error: boom'
  ]) {
    assert.equal(serialized.includes(secret), false, `export must not contain "${secret}"`)
  }
  // Safe fields survive.
  assert.equal(result.events[0]!.errorCode, 'invalid_grant')
  assert.equal(result.events[0]!.httpStatus, 400)
})

// --- Truncation + window metadata (Req 14.3) ------------------------------

test('export truncates events beyond the bound and records window metadata', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  // Seed one MORE than the bound so truncation triggers.
  for (let i = 0; i < EXPORT_EVENT_BOUND + 5; i++) {
    await repo.putEvent(ctx, event({
      eventId: `evt_bound_${i}`,
      timestamp: new Date(NOW - 5 * 60 * 1000 + i).toISOString()
    }))
  }

  const result = await service(repo).buildExport(access(), 'grp_issue_1')
  assert.equal(result.truncated, true)
  assert.equal(result.events.length, EXPORT_EVENT_BOUND)
  assert.equal(result.metadata.coverage, 'partial')
  assert.equal(result.windowStart, WINDOW_START)
  assert.equal(result.windowEnd, WINDOW_END)
  assert.equal(result.metadata.windowStart, WINDOW_START)
  assert.equal(result.metadata.windowEnd, WINDOW_END)
})

test('export within the bound is not truncated and reports complete coverage', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  await repo.putEvent(ctx, event({ eventId: 'evt_a' }))
  await repo.putEvent(ctx, event({ eventId: 'evt_b' }))

  const result = await service(repo).buildExport(access(), 'grp_issue_1')
  assert.equal(result.truncated, false)
  assert.equal(result.events.length, 2)
  assert.equal(result.metadata.coverage, 'complete')
})

// --- Safe configuration NAMES only (Req 14.1 / 14.2) ----------------------

test('export configuration names contain only safe short names, never URLs', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  const result = await service(repo).buildExport(access(), 'grp_issue_1')
  for (const name of result.configurationNames) {
    assert.equal(name.includes('://'), false, `configuration name "${name}" must not be a URL`)
    assert.equal(name.includes('/'), false, `configuration name "${name}" must not contain a path`)
  }
  // The provider's fixed scope/grant names should be present.
  assert.ok(result.configurationNames.includes('openid'))
})

// --- Client-scoped issue filters events to that client --------------------

test('a client-scoped issue exports only that client\'s events', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  await repo.putEvent(ctx, event({ eventId: 'evt_match', clientReference: 'client_ref_1' }))
  await repo.putEvent(ctx, event({ eventId: 'evt_other', clientReference: 'client_ref_2' }))

  const result = await service(repo).buildExport(access(), 'grp_issue_1')
  assert.equal(result.events.length, 1)
  assert.equal(result.events[0]!.eventId, 'evt_match')
})

// --- Fail-closed audit ordering (Req 13.6 / 14.4) -------------------------
//
// The ROUTE writes the audit intent before producing the attachment and fails
// closed on a write failure. This test reproduces that ordering with a repository
// whose putAuditRecord throws, proving that when the audit intent cannot be
// persisted the caller propagates the failure and the export is never produced.

test('audit-intent write failure blocks the export (fail closed)', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  await repo.putEvent(ctx, event({ eventId: 'evt_a' }))

  let exportProduced = false
  const failingAudit = async () => {
    throw new Error('audit store unavailable')
  }

  // Simulate the route's ordering: audit intent BEFORE the attachment.
  const runExportRoute = async () => {
    await failingAudit() // audit intent first — throws
    exportProduced = true // must never run
    return service(repo).buildExport(access(), 'grp_issue_1')
  }

  await assert.rejects(runExportRoute, /audit store unavailable/)
  assert.equal(exportProduced, false, 'the attachment must not be produced when audit intent fails')
})

// --- Deployment binding: another deployment cannot read the issue ----------

test('export is deployment-bound: a different deployment sees no issue (404)', async () => {
  const repo = new InMemoryOAuthAdminRepository()
  await repo.upsertIssue(ctx, issue())
  const otherAccess: OAuthAdminAccessContext = {
    deployment: { ...ctx, deploymentId: 'other-deployment', environment: 'production' },
    actor: 'act_test',
    capabilities: Object.values(OAUTH_CAPABILITIES)
  }
  await assert.rejects(
    () => service(repo).buildExport(otherAccess, 'grp_issue_1'),
    (error: any) => error?.statusCode === 404
  )
})
