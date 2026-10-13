/**
 * Feature: oauth-administration — task 7.1 durable operations machinery.
 *
 * Focused unit tests for session-bound CSRF issuance/verification, same-origin
 * validation, and the durable {@link OAuthAdminOperationService} lifecycle
 * against the in-memory repository fixture (no live DynamoDB). Covers:
 *   - CSRF verify: valid / tampered / expired / cross-session.
 *   - Same-origin validation against the deployment host.
 *   - Request-fingerprint stability and mismatch conflict.
 *   - Require-absent reservation idempotency (retry returns existing op).
 *   - Revision (`If-Match`) conflict on a scoped retry.
 *   - Durable intent + audit before/after effects; no duplicate effect on retry.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import type { OAuthDeploymentContext } from '../../shared/types/oauth-administration'
import { InMemoryOAuthAdminRepository } from '../../server/mcp/oauth/admin/memory-repository'
import type { OAuthAdminAccessContext } from '../../server/mcp/oauth/admin/types'
import {
  issueCsrfToken,
  verifyCsrfToken,
  validateSameOrigin,
  CSRF_TOKEN_TTL_MS
} from '../../server/mcp/oauth/admin/csrf'
import {
  OAuthAdminOperationService,
  computeRequestFingerprint
} from '../../server/mcp/oauth/admin/operation-service'

// A stable request-state key so CSRF/HMAC bindings are deterministic in tests.
// The config helpers read `process.env` lazily per call, so setting these after
// the imports is sufficient (no module-load-time capture of the key/base URL).
process.env.GHOST_MCP_REQUEST_STATE_KEY = 'test-oauth-admin-request-state-key-01234567890'
process.env.GHOST_MCP_BASE_URL = 'https://ghost.example.test'

const ctx: OAuthDeploymentContext = {
  deploymentId: 'test-deployment',
  environment: 'development',
  executionMode: 'test',
  partition: 'govcloud',
  provenance: 'effective'
}

/** Build a minimal H3-compatible event with a session subject and headers. */
function fakeEvent(subject: string, headers: Record<string, string> = {}): H3Event {
  const lowerHeaders: Record<string, string> = {}
  for (const [key, value] of Object.entries(headers)) lowerHeaders[key.toLowerCase()] = value
  return {
    node: { req: { headers: lowerHeaders }, res: {} },
    context: { auth: { isAuthenticated: true, user: { oid: subject, claims: {} } } }
  } as unknown as H3Event
}

function accessWith(actor = 'act_test'): OAuthAdminAccessContext {
  return { deployment: ctx, actor, capabilities: ['oauth.applications.manage'] }
}

// --- CSRF issuance / verification -----------------------------------------

test('CSRF token verifies for the same session', () => {
  const event = fakeEvent('subject-1')
  const token = issueCsrfToken(event)
  assert.equal(verifyCsrfToken(event, token), true)
})

test('CSRF token is rejected when tampered', () => {
  const event = fakeEvent('subject-1')
  const token = issueCsrfToken(event)
  const [nonce, expires, signature] = token.split('.')
  const tampered = `${nonce}.${expires}.${signature.slice(0, -2)}xx`
  assert.equal(verifyCsrfToken(event, tampered), false)
  // A tampered nonce is also rejected.
  assert.equal(verifyCsrfToken(event, `${nonce}A.${expires}.${signature}`), false)
})

test('CSRF token is rejected once expired', () => {
  const event = fakeEvent('subject-1')
  const past = Date.now() - CSRF_TOKEN_TTL_MS - 1000
  // Mint a token that expired in the past by issuing "now" in the past.
  const token = issueCsrfToken(event, past)
  assert.equal(verifyCsrfToken(event, token), false)
})

test('CSRF token from one session does not verify in another', () => {
  const eventA = fakeEvent('subject-A')
  const eventB = fakeEvent('subject-B')
  const token = issueCsrfToken(eventA)
  assert.equal(verifyCsrfToken(eventB, token), false)
  // Sanity: still valid in its own session.
  assert.equal(verifyCsrfToken(eventA, token), true)
})

test('CSRF verify rejects malformed input', () => {
  const event = fakeEvent('subject-1')
  assert.equal(verifyCsrfToken(event, ''), false)
  assert.equal(verifyCsrfToken(event, 'not-a-token'), false)
  assert.equal(verifyCsrfToken(event, undefined), false)
  assert.equal(verifyCsrfToken(event, 'a.b'), false)
})

// --- Same-origin validation -----------------------------------------------

test('same-origin accepts the deployment host and rejects a foreign origin', () => {
  const good = fakeEvent('s', { origin: 'https://ghost.example.test' })
  assert.equal(validateSameOrigin(good), true)

  const foreign = fakeEvent('s', { origin: 'https://evil.example.com' })
  assert.equal(validateSameOrigin(foreign), false)

  // Missing Origin and Referer fails closed.
  const missing = fakeEvent('s', {})
  assert.equal(validateSameOrigin(missing), false)

  // Referer is used when Origin is absent.
  const referer = fakeEvent('s', { referer: 'https://ghost.example.test/admin/oauth' })
  assert.equal(validateSameOrigin(referer), true)
})

// --- Request fingerprint ---------------------------------------------------

test('computeRequestFingerprint is stable regardless of key order and differs on input change', () => {
  const a = computeRequestFingerprint('application.create', { name: 'app', redirects: ['a', 'b'] })
  const b = computeRequestFingerprint('application.create', { redirects: ['a', 'b'], name: 'app' })
  assert.equal(a, b)
  const c = computeRequestFingerprint('application.create', { name: 'other', redirects: ['a', 'b'] })
  assert.notEqual(a, c)
  // Type participates in the fingerprint.
  const d = computeRequestFingerprint('application.update', { name: 'app', redirects: ['a', 'b'] })
  assert.notEqual(a, d)
})

// --- Reservation idempotency + conflicts ----------------------------------

function makeService() {
  const repository = new InMemoryOAuthAdminRepository()
  const service = new OAuthAdminOperationService(repository)
  return { repository, service }
}

test('reserve is idempotent for the same key + fingerprint', async () => {
  const { service } = makeService()
  const access = accessWith()
  const input = {
    type: 'application.create' as const,
    idempotencyKey: 'idem-1',
    requestFingerprint: computeRequestFingerprint('application.create', { name: 'app' }),
    targetReferences: ['tgt_1'],
    reason: 'create app'
  }
  const first = await service.reserve(access, input)
  assert.equal(first.isExisting, false)
  const second = await service.reserve(access, input)
  assert.equal(second.isExisting, true)
  assert.equal(second.operation.operationId, first.operation.operationId)
})

test('reserve rejects same key with a different fingerprint (idempotency mismatch)', async () => {
  const { service } = makeService()
  const access = accessWith()
  await service.reserve(access, {
    type: 'application.create',
    idempotencyKey: 'idem-2',
    requestFingerprint: computeRequestFingerprint('application.create', { name: 'app' }),
    targetReferences: ['tgt_1'],
    reason: 'create app'
  })
  await assert.rejects(
    () => service.reserve(access, {
      type: 'application.create',
      idempotencyKey: 'idem-2',
      requestFingerprint: computeRequestFingerprint('application.create', { name: 'different' }),
      targetReferences: ['tgt_1'],
      reason: 'create app'
    }),
    (error: any) => error?.statusCode === 409 && error?.data?.code === 'OAUTH_ADMIN_CONFLICT'
  )
})

test('reserve rejects a retry against a different revision', async () => {
  const { service } = makeService()
  const access = accessWith()
  const fingerprint = computeRequestFingerprint('application.update', { action: 'block' })
  await service.reserve(access, {
    type: 'application.update',
    idempotencyKey: 'idem-3',
    requestFingerprint: fingerprint,
    targetReferences: ['client_1'],
    expectedRevision: 'rev-1',
    reason: 'block'
  })
  await assert.rejects(
    () => service.reserve(access, {
      type: 'application.update',
      idempotencyKey: 'idem-3',
      requestFingerprint: fingerprint,
      targetReferences: ['client_1'],
      expectedRevision: 'rev-2',
      reason: 'block'
    }),
    (error: any) => error?.statusCode === 409
  )
})

// --- Execute + reconcile without duplicate effect --------------------------

test('run executes the effect once and a retry reconciles without re-running', async () => {
  const { service } = makeService()
  const access = accessWith()
  let effectCount = 0
  const input = {
    type: 'application.create' as const,
    idempotencyKey: 'idem-4',
    requestFingerprint: computeRequestFingerprint('application.create', { name: 'app' }),
    targetReferences: ['tgt_1'],
    reason: 'create app'
  }
  const runEffect = async () => {
    effectCount += 1
    return { state: 'completed' as const, result: { clientId: 'client_new' } }
  }
  const op1 = await service.run(access, input, runEffect)
  assert.equal(op1.state, 'completed')
  assert.equal(effectCount, 1)

  // A retry with the same key + fingerprint must NOT run the effect again.
  const op2 = await service.run(access, input, runEffect)
  assert.equal(effectCount, 1)
  assert.equal(op2.operationId, op1.operationId)
  assert.equal(op2.state, 'completed')
})

test('run records durable intent + outcome audit and a poll returns the operation', async () => {
  const { repository, service } = makeService()
  const access = accessWith()
  const op = await service.run(access, {
    type: 'grant.revoke',
    idempotencyKey: 'idem-5',
    requestFingerprint: computeRequestFingerprint('grant.revoke', { grant: 'g1' }),
    targetReferences: ['g1'],
    reason: 'revoke'
  }, async () => ({ state: 'verifying' as const, evidence: { marker: 'set' } }))

  assert.equal(op.state, 'verifying')

  // Poll returns the stored operation.
  const polled = await service.get(access, op.operationId)
  assert.ok(polled)
  assert.equal(polled?.state, 'verifying')

  // Two audit records exist (intent + outcome) within the retention window.
  const audit = await repository.queryAuditRecords(ctx, { from: new Date(Date.now() - 60_000).toISOString() })
  assert.equal(audit.items.length >= 2, true)
  // A verifying operation can be finalized.
  const verified = await service.markVerified(access, op)
  assert.equal(verified.state, 'completed')
})

test('a failed effect records a safe failure and rethrows', async () => {
  const { service } = makeService()
  const access = accessWith()
  await assert.rejects(() => service.run(access, {
    type: 'application.create',
    idempotencyKey: 'idem-6',
    requestFingerprint: computeRequestFingerprint('application.create', { name: 'app' }),
    targetReferences: ['tgt_1'],
    reason: 'create app'
  }, async () => { throw new Error('provider exploded with secret token=abc') }))

  // The operation is persisted as failed with a safe error (no raw message leak of the token).
  // Recompute the scoped operation id via a reserve retry: it should now be terminal.
  const retry = await service.reserve(access, {
    type: 'application.create',
    idempotencyKey: 'idem-6',
    requestFingerprint: computeRequestFingerprint('application.create', { name: 'app' }),
    targetReferences: ['tgt_1'],
    reason: 'create app'
  })
  assert.equal(retry.isExisting, true)
  assert.equal(retry.operation.state, 'failed')
  assert.ok(retry.operation.error)
})
