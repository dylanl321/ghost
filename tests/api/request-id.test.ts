/**
 * Unit tests for the request-id correlation token validation used by the
 * request-timing middleware (server/middleware/00-request-timing.ts).
 *
 * normalizeRequestId must only trust a conservative bounded inbound token and
 * otherwise mint a fresh UUID, so that header injection cannot poison the
 * structured request logs or the x-request-id response header.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeRequestId } from '../../server/utils/request-id.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

test('normalizeRequestId keeps a valid bounded token', () => {
  for (const id of ['abc123', 'req.1_2:3-4', 'A'.repeat(128)]) {
    assert.equal(normalizeRequestId(id), id)
  }
})

test('normalizeRequestId rejects malformed or oversized tokens', () => {
  for (const bad of [
    '',
    'A'.repeat(129),
    'has space',
    'new\nline',
    'semi;colon',
    'slash/path',
    'unicode ',
  ]) {
    assert.match(normalizeRequestId(bad), UUID_RE)
  }
})

test('normalizeRequestId rejects non-string input', () => {
  for (const bad of [undefined, null, 123, {}, ['abc']]) {
    assert.match(normalizeRequestId(bad), UUID_RE)
  }
})
