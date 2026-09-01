import assert from 'node:assert/strict'
import test from 'node:test'
import type { H3Event } from 'h3'
import { resolveRequestId, extractAuthActor } from '../../server/utils/request-context'
import { sendSuccess, sendApiError } from '../../server/utils/api-response'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Minimal H3Event stub sufficient for the response helpers under test.
function mockEvent(context: Record<string, unknown> = {}): H3Event {
  return { context, node: { res: {} } } as unknown as H3Event
}

test('resolveRequestId keeps a safe, bounded inbound id', () => {
  assert.equal(resolveRequestId('abc-123_DEF.456'), 'abc-123_DEF.456')
})

test('resolveRequestId generates a UUID when no inbound id is present', () => {
  assert.match(resolveRequestId(undefined), UUID_RE)
  assert.match(resolveRequestId(''), UUID_RE)
  assert.match(resolveRequestId(null), UUID_RE)
})

test('resolveRequestId rejects unsafe or oversized values (log injection / cardinality)', () => {
  // Newline (log injection) is rejected -> UUID
  assert.match(resolveRequestId('abc\ndef'), UUID_RE)
  // Spaces / control chars rejected
  assert.match(resolveRequestId('has spaces'), UUID_RE)
  // Over the length bound rejected
  assert.match(resolveRequestId('x'.repeat(129)), UUID_RE)
  // Duplicated header (string[]) is not trusted
  assert.match(resolveRequestId(['a', 'b']), UUID_RE)
})

test('resolveRequestId accepts a value at the length boundary', () => {
  const maxLen = 'x'.repeat(128)
  assert.equal(resolveRequestId(maxLen), maxLen)
})

test('extractAuthActor returns undefined for missing/unauthenticated auth', () => {
  assert.equal(extractAuthActor(undefined), undefined)
  assert.equal(extractAuthActor(null), undefined)
  assert.equal(extractAuthActor({ isAuthenticated: false, authType: 'oidc' }), undefined)
})

test('extractAuthActor returns apiKeyId for api key auth', () => {
  assert.deepEqual(
    extractAuthActor({ isAuthenticated: true, authType: 'apikey', apiKeyId: 'key_123' }),
    { authType: 'apikey', actor: 'key_123' }
  )
})

test('extractAuthActor prefers stable OIDC identifiers in order', () => {
  assert.deepEqual(
    extractAuthActor({
      isAuthenticated: true,
      authType: 'oidc',
      user: { id: 'user-id', email: 'a@b.com', claims: { oid: 'oid-1', sub: 'sub-1' } }
    }),
    { authType: 'oidc', actor: 'user-id' }
  )

  assert.deepEqual(
    extractAuthActor({
      isAuthenticated: true,
      authType: 'oidc',
      user: { claims: { oid: 'oid-1', sub: 'sub-1' } }
    }),
    { authType: 'oidc', actor: 'oid-1' }
  )

  assert.deepEqual(
    extractAuthActor({
      isAuthenticated: true,
      authType: 'oidc',
      user: { email: 'a@b.com' }
    }),
    { authType: 'oidc', actor: 'a@b.com' }
  )
})

test('extractAuthActor never leaks tokens, names, or the full auth object', () => {
  const correlation = extractAuthActor({
    isAuthenticated: true,
    authType: 'oidc',
    user: {
      id: 'user-id',
      email: 'a@b.com',
      claims: { oid: 'oid-1' }
    }
  } as any)

  assert.deepEqual(Object.keys(correlation!).sort(), ['actor', 'authType'])
})

test('sendSuccess includes requestId in metadata when present on the event', () => {
  const res = sendSuccess(mockEvent({ requestId: 'req-1' }), { ok: true })
  assert.equal(res.metadata?.requestId, 'req-1')
})

test('sendSuccess omits requestId when absent', () => {
  const res = sendSuccess(mockEvent(), { ok: true })
  assert.equal('requestId' in (res.metadata ?? {}), false)
})

test('sendApiError includes requestId in metadata when present', () => {
  const res = sendApiError(mockEvent({ requestId: 'req-err' }), 'BAD_REQUEST', 'nope', 400)
  assert.equal(res.metadata?.requestId, 'req-err')
})
