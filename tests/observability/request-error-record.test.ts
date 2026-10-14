import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRequestErrorRecord,
  isServerError,
} from '../../server/utils/request-error-record'

// eslint-disable-next-line no-control-regex -- intentionally matching control chars to assert they are stripped
const CONTROL_CHARS = new RegExp('[\\u0000-\\u001F\\u007F-\\u009F]')

test('isServerError treats 5xx and missing or invalid status as server errors', () => {
  assert.equal(isServerError(500), true)
  assert.equal(isServerError(503), true)
  assert.equal(isServerError(200), true)
  assert.equal(isServerError(302), true)
  assert.equal(isServerError(600), true)
  assert.equal(isServerError(Number.NaN), true)
  assert.equal(isServerError(undefined), true)
})

test('isServerError treats trustworthy sub-500 codes as client rejections', () => {
  for (const code of [400, 401, 403, 404, 422, 429, 499]) {
    assert.equal(isServerError(code), false)
  }
})

test('expected 401 is a request_rejection without exception-class/stack fields', () => {
  const entry = buildRequestErrorRecord({
    requestId: 'req-123',
    method: 'HEAD',
    pathname: '/api/user/session-check',
    statusCode: 401,
    errorName: 'H3Error',
    errorMessage: 'Unauthorized',
    errorStack: 'H3Error: Unauthorized\n    at handler (file:1:1)',
  })

  assert.equal(entry.type, 'request_rejection')
  assert.equal(entry.statusCode, 401)
  assert.equal(entry.method, 'HEAD')
  assert.equal(entry.path, '/api/user/session-check')
  assert.equal(entry.requestId, 'req-123')
  assert.equal(entry.errorMessage, 'Unauthorized')
  // The whole point: no H3Error / stack that would match a /Error/ query.
  assert.ok(!('errorName' in entry))
  assert.ok(!('errorStack' in entry))
  assert.ok(!JSON.stringify(entry).includes('H3Error'))
})

test('404 unread-count poll is also a rejection, not an error', () => {
  const entry = buildRequestErrorRecord({
    method: 'GET',
    pathname: '/api/notifications/unread-count',
    statusCode: 404,
    errorName: 'H3Error',
    errorMessage: 'Not Found',
  })
  assert.equal(entry.type, 'request_rejection')
  assert.ok(!('errorName' in entry))
})

test('5xx is a request_error retaining error name and bounded stack', () => {
  const entry = buildRequestErrorRecord({
    requestId: 'req-9',
    method: 'POST',
    pathname: '/api/costs/report',
    statusCode: 500,
    errorName: 'TypeError',
    errorMessage: 'boom',
    errorStack: 'TypeError: boom\n    at compute (file:2:2)',
  })

  assert.equal(entry.type, 'request_error')
  assert.equal(entry.statusCode, 500)
  assert.equal(entry.errorName, 'TypeError')
  assert.ok(typeof entry.errorStack === 'string')
  assert.ok((entry.errorStack as string).includes('TypeError: boom'))
})

test('an error without a trustworthy status code stays a request_error', () => {
  const entry = buildRequestErrorRecord({
    method: 'GET',
    pathname: '/api/costs/report',
    statusCode: undefined,
    errorName: 'Error',
    errorMessage: 'unexpected',
    errorStack: 'Error: unexpected',
  })
  assert.equal(entry.type, 'request_error')
  assert.equal(entry.statusCode, undefined)
  assert.equal(entry.errorName, 'Error')
})

test('a default response status does not hide an untyped exception as a rejection', () => {
  const entry = buildRequestErrorRecord({
    method: 'GET',
    pathname: '/api/costs/report',
    statusCode: 200,
    errorName: 'Error',
    errorMessage: 'unexpected',
  })
  assert.equal(entry.type, 'request_error')
  assert.equal(entry.errorName, 'Error')
})

test('string fields are bounded and injection-safe on both record types', () => {
  const forged = 'oops"}\n{"type":"request_error","injected":true'
  for (const statusCode of [401, 500]) {
    const entry = buildRequestErrorRecord({
      method: 'GET',
      pathname: '/api/x',
      statusCode,
      errorName: 'Error',
      errorMessage: forged,
      errorStack: forged,
    })
    const serialized = JSON.stringify(entry)
    // Single bounded JSON line; forged newline cannot inject a fake record.
    assert.equal(serialized.includes('\n'), false)
    assert.doesNotMatch(entry.errorMessage as string, CONTROL_CHARS)
  }
})

test('stack trace is length-capped with a truncation marker', () => {
  const entry = buildRequestErrorRecord({
    method: 'GET',
    pathname: '/api/x',
    statusCode: 500,
    errorName: 'Error',
    errorMessage: 'm',
    errorStack: 'x'.repeat(5000),
  })
  const stack = entry.errorStack as string
  assert.ok(stack.length <= 2048)
  assert.ok(stack.endsWith('…'))
})

test('non-string fields are omitted so forged values cannot land in the record', () => {
  const entry = buildRequestErrorRecord({
    requestId: { evil: true },
    method: 123,
    pathname: '/api/x',
    statusCode: 403,
    errorMessage: null,
  })
  assert.ok(!('requestId' in entry) || entry.requestId === undefined)
  assert.equal(entry.requestId, undefined)
  assert.equal(entry.method, undefined)
  assert.equal(entry.errorMessage, undefined)
})
