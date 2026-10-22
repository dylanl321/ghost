import assert from 'node:assert/strict'
import test from 'node:test'
import { isUnauthorizedError } from '../../app/utils/error-helpers'

// Guards the 401 classifier that lets useNotifications stop polling/SSE when the
// server session expires while the client still believes it is logged in.

test('detects a top-level statusCode 401 (ofetch FetchError shape)', () => {
  assert.equal(isUnauthorizedError({ statusCode: 401 }), true)
})

test('detects a top-level status 401', () => {
  assert.equal(isUnauthorizedError({ status: 401 }), true)
})

test('detects a nested data.statusCode 401 (parsed error body)', () => {
  assert.equal(isUnauthorizedError({ data: { statusCode: 401 } }), true)
})

test('detects a response.status 401', () => {
  assert.equal(isUnauthorizedError({ response: { status: 401 } }), true)
})

test('does not treat other error statuses as unauthorized', () => {
  for (const e of [
    { statusCode: 500 },
    { status: 403 },
    { data: { statusCode: 404 } },
    { response: { status: 429 } },
    { message: 'network error' },
  ]) {
    assert.equal(isUnauthorizedError(e), false)
  }
})

test('is safe on null/undefined and non-object inputs', () => {
  for (const e of [null, undefined, 0, '', 'unauthorized', 401]) {
    assert.equal(isUnauthorizedError(e as unknown), false)
  }
})

test('does not false-positive on a 401 embedded only in the message string', () => {
  // We classify strictly on numeric status fields, never by string matching,
  // so an unrelated error whose text mentions 401 is not treated as auth loss.
  assert.equal(isUnauthorizedError({ message: 'got 401 somewhere' }), false)
})
