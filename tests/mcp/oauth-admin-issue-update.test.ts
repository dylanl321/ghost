/**
 * Feature: oauth-administration — task 11.2 revision-checked issue investigation
 * updates.
 *
 * Focused unit tests for {@link OAuthIssueUpdateService} against the in-memory
 * repository (no live DynamoDB). Covers Requirements 10.5, 10.6, 13.1, 13.4:
 *   - An update enforces the expected revision: a stale revision is a 409
 *     conflict and does not overwrite the newer version (Req 13.4).
 *   - An update applies owner/notes/mitigation/disposition and bumps revision.
 *   - CRITICAL: a disposition update NEVER changes the evidence-derived
 *     `verification` field (Req 10.6) — administrator disposition stays distinct
 *     from observed recovery.
 *   - An unknown disposition / empty update is rejected (400).
 *   - Notes/mitigation are length-bounded and sanitized.
 *   - The update is audited and idempotent by idempotency key.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type { OAuthDeploymentContext, OAuthIssue } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'
import {
  OAuthIssueUpdateService,
  normalizeIssueUpdate,
  sanitizeBoundedText,
  MAX_NOTE_LENGTH
} from '../../server/mcp/oauth/admin/issue-update-service'

process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

function access(actor = 'act_test'): OAuthAdminAccessContext {
  return { deployment: ctx, actor, capabilities: ['oauth.operations.manage'] }
}

/** Seed a minimal, well-formed issue into the repository and return it. */
async function seedIssue(
  repository: InMemoryOAuthAdminRepository,
  overrides: Partial<OAuthIssue> = {}
): Promise<OAuthIssue> {
  const issue: OAuthIssue = {
    groupId: 'iss_seed_1',
    groupKey: 'development|token-exchange|invalid_grant',
    windowStart: '2026-01-01T00:00:00.000Z',
    windowEnd: '2026-01-01T00:15:00.000Z',
    count: 7,
    firstObservedAt: '2026-01-01T00:01:00.000Z',
    lastObservedAt: '2026-01-01T00:14:00.000Z',
    anonymousCount: 3,
    identifiedCount: 4,
    severity: 'high',
    category: 'issuer-audience',
    unverified: false,
    disposition: 'open',
    verification: 'no-recovery-evidence',
    revision: 'rev_initial',
    metadata: { coverage: 'complete', freshness: 'fresh' } as OAuthIssue['metadata'],
    ...overrides
  }
  await repository.upsertIssue(ctx, issue)
  return issue
}

// --- Normalization / validation -------------------------------------------

test('normalizeIssueUpdate requires expectedRevision', () => {
  assert.throws(
    () => normalizeIssueUpdate(undefined, { disposition: 'resolved' }),
    (error: any) => error?.statusCode === 400
  )
})

test('normalizeIssueUpdate rejects an unknown disposition', () => {
  assert.throws(
    () => normalizeIssueUpdate('rev_initial', { disposition: 'not-a-disposition' }),
    (error: any) => error?.statusCode === 400
  )
})

test('normalizeIssueUpdate rejects an empty update', () => {
  assert.throws(
    () => normalizeIssueUpdate('rev_initial', {}),
    (error: any) => error?.statusCode === 400
  )
})

test('sanitizeBoundedText strips control chars and length-bounds', () => {
  const dirty = `a\u0000b\u0007c${'x'.repeat(MAX_NOTE_LENGTH + 100)}`
  const clean = sanitizeBoundedText(dirty, MAX_NOTE_LENGTH)
  assert.ok(!clean.includes('\u0000'))
  assert.ok(!clean.includes('\u0007'))
  assert.ok(clean.length <= MAX_NOTE_LENGTH)
})

// --- Revision enforcement (Req 13.4) --------------------------------------

test('a stale expectedRevision is a 409 conflict and does not overwrite', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueUpdateService(repository)
  await seedIssue(repository)

  await assert.rejects(
    () => service.update(
      access(),
      'iss_seed_1',
      normalizeIssueUpdate('rev_stale', { disposition: 'resolved' }),
      'idem-stale',
      'why'
    ),
    (error: any) => error?.statusCode === 409
  )

  // The stored issue is unchanged.
  const stored = await repository.getIssue(ctx, 'iss_seed_1')
  assert.equal(stored?.disposition, 'open')
  assert.equal(stored?.revision, 'rev_initial')
})

// --- Field updates + revision bump ----------------------------------------

test('update applies owner/notes/mitigation/disposition and bumps the revision', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueUpdateService(repository)
  await seedIssue(repository)

  const { issue, operation } = await service.update(
    access(),
    'iss_seed_1',
    normalizeIssueUpdate('rev_initial', {
      owner: 'jane.doe',
      notes: 'Looks like a client clock skew.',
      mitigation: 'Asked owner to sync NTP.',
      disposition: 'investigating'
    }),
    'idem-1',
    'triage'
  )

  assert.equal(issue.owner, 'jane.doe')
  assert.equal(issue.notes, 'Looks like a client clock skew.')
  assert.equal(issue.mitigation, 'Asked owner to sync NTP.')
  assert.equal(issue.disposition, 'investigating')
  assert.notEqual(issue.revision, 'rev_initial')
  assert.equal(operation.state, 'completed')
  assert.equal(operation.type, 'issue.update')
  assert.equal(operation.capability, 'oauth.operations.manage')
})

// --- CRITICAL: disposition does not change verification (Req 10.6) ---------

test('a disposition update leaves the evidence-derived verification untouched', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueUpdateService(repository)
  await seedIssue(repository, { verification: 'no-recovery-evidence' })

  const { issue } = await service.update(
    access(),
    'iss_seed_1',
    normalizeIssueUpdate('rev_initial', { disposition: 'resolved' }),
    'idem-2',
    'resolving'
  )

  // The administrator resolved the issue, but recovery verification is derived
  // from observed evidence and must NOT flip to observed-recovery.
  assert.equal(issue.disposition, 'resolved')
  assert.equal(issue.verification, 'no-recovery-evidence')

  const stored = await repository.getIssue(ctx, 'iss_seed_1')
  assert.equal(stored?.verification, 'no-recovery-evidence')
})

// --- Clearing a field ------------------------------------------------------

test('an explicit empty owner clears the field; undefined leaves it unchanged', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueUpdateService(repository)
  await seedIssue(repository, { owner: 'jane.doe', notes: 'keep me' })

  const { issue } = await service.update(
    access(),
    'iss_seed_1',
    normalizeIssueUpdate('rev_initial', { owner: '' }),
    'idem-3',
    'unassign'
  )

  assert.equal(issue.owner, undefined)
  // Notes were not supplied and must be preserved.
  assert.equal(issue.notes, 'keep me')
})

// --- Idempotency + audit ---------------------------------------------------

test('a retry with the same idempotency key does not re-apply', async () => {
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthIssueUpdateService(repository)
  await seedIssue(repository)

  const first = await service.update(
    access(),
    'iss_seed_1',
    normalizeIssueUpdate('rev_initial', { disposition: 'mitigated' }),
    'idem-same',
    'mitigate'
  )
  const revisionAfterFirst = first.issue.revision

  // A retry with the SAME key + input reconciles to the existing operation and
  // does not bump the revision again.
  const second = await service.update(
    access(),
    'iss_seed_1',
    normalizeIssueUpdate('rev_initial', { disposition: 'mitigated' }),
    'idem-same',
    'mitigate'
  )

  assert.equal(second.operation.operationId, first.operation.operationId)
  const stored = await repository.getIssue(ctx, 'iss_seed_1')
  assert.equal(stored?.revision, revisionAfterFirst)
})
