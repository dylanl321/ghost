import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isSafeRequestId,
  normalizePath,
  sanitizeErrorText,
  redactSensitive,
  buildApiErrorEntry,
  buildAuthFailureEntry,
} from '../request-telemetry'

test('isSafeRequestId accepts bounded opaque tokens', () => {
  assert.equal(isSafeRequestId('abc123'), true)
  assert.equal(isSafeRequestId('550e8400-e29b-41d4-a716-446655440000'), true)
  assert.equal(isSafeRequestId('req.id_1-2'), true)
  assert.equal(isSafeRequestId('a'.repeat(128)), true)
})

test('isSafeRequestId rejects unsafe or malformed values', () => {
  assert.equal(isSafeRequestId(''), false)
  assert.equal(isSafeRequestId('a'.repeat(129)), false)
  assert.equal(isSafeRequestId('has space'), false)
  assert.equal(isSafeRequestId('inject\nnewline'), false)
  assert.equal(isSafeRequestId('semi;colon'), false)
  assert.equal(isSafeRequestId('slash/path'), false)
  assert.equal(isSafeRequestId(undefined), false)
  assert.equal(isSafeRequestId(12345), false)
})

test('normalizePath strips query strings and collapses dynamic segments', () => {
  assert.equal(normalizePath('/api/costs/projections?environment=commercial'), '/api/costs/projections')
  assert.equal(
    normalizePath('/api/accounts/550e8400-e29b-41d4-a716-446655440000/detail'),
    '/api/accounts/:id/detail',
  )
  assert.equal(normalizePath('/api/items/12345'), '/api/items/:num')
  assert.equal(
    normalizePath('/api/integrations/vmaas/instances/i-05cd04ddf94b4c099/cost'),
    '/api/integrations/vmaas/instances/:awsResourceId/cost',
  )
  assert.equal(normalizePath('/api/volumes/vol-0a2dad43f0de284a8'), '/api/volumes/:awsResourceId')
})

test('sanitizeErrorText collapses control characters and bounds length', () => {
  assert.equal(sanitizeErrorText('line1\nline2\ttab'), 'line1 line2 tab')
  assert.equal(sanitizeErrorText('  trimmed  '), 'trimmed')
  assert.equal(sanitizeErrorText(undefined), '')
  assert.equal(sanitizeErrorText({ message: 'nope' }), '')
  assert.equal(sanitizeErrorText('x'.repeat(600)).length, 512)
  assert.equal(sanitizeErrorText('abcdef', 3), 'abc')
})

test('sanitizeErrorText redacts credentials and account identifiers', () => {
  const acct = sanitizeErrorText('Access denied for account 123456789012 in region')
  assert.ok(!/\b\d{12}\b/.test(acct), '12-digit account id must not survive')
  assert.match(acct, /\[REDACTED_ACCT\]/)
  assert.match(acct, /Access denied/, 'surrounding summary is retained')

  const arn = sanitizeErrorText('User arn:aws:iam::123456789012:role/AdminRole is not authorized')
  assert.ok(!/\b\d{12}\b/.test(arn), 'ARN account component must not survive')
  assert.match(arn, /arn:aws:iam::\[REDACTED_ACCT\]:role\/AdminRole/)

  const sts = sanitizeErrorText('arn:aws:sts::210987654321:assumed-role/Deploy/session')
  assert.ok(!/\b\d{12}\b/.test(sts), 'STS ARN account component must not survive')

  const akia = sanitizeErrorText('key AKIAIOSFODNN7EXAMPLE was rejected')
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(akia), 'AKIA access-key id must not survive')
  assert.match(akia, /\[REDACTED_AWS_KEY\]/)

  const asia = sanitizeErrorText('using ASIAY34FZKBOKMUTVV7A now')
  assert.ok(!/ASIA[0-9A-Z]{16}/.test(asia), 'ASIA access-key id must not survive')

  const bearer = sanitizeErrorText('request failed: Bearer eyJhbGciOi.JIUzI1.abc-123_x')
  assert.ok(!/eyJhbGciOi/.test(bearer), 'bearer token must not survive')
  assert.match(bearer, /Bearer \[REDACTED\]/)

  const secret = sanitizeErrorText('config error secret=s3cr3tValue!! near line 3')
  assert.ok(!/s3cr3tValue/.test(secret), 'secret assignment value must not survive')
  assert.match(secret, /secret=\[REDACTED\]/)

  const token = sanitizeErrorText('token: "abcdef1234567890" expired')
  assert.ok(!/abcdef1234567890/.test(token), 'token assignment value must not survive')

  const password = sanitizeErrorText('password = hunter2super')
  assert.ok(!/hunter2super/.test(password), 'password assignment value must not survive')

  const apiKey = sanitizeErrorText('"apiKey":"AKfycbxLIVEKEY99"')
  assert.ok(!/AKfycbxLIVEKEY99/.test(apiKey), 'api key assignment value must not survive')
})

test('buildApiErrorEntry redacts account ids leaked via error message', () => {
  const entry = buildApiErrorEntry({
    method: 'GET',
    path: '/api/aws',
    error: new Error('AccessDenied: arn:aws:iam::123456789012:user/svc'),
  })
  assert.ok(!/\b\d{12}\b/.test(entry.errorMessage as string))
  assert.match(entry.errorMessage as string, /arn:aws:iam::\[REDACTED_ACCT\]:user\/svc/)
})

test('redactSensitive leaves ordinary summaries untouched', () => {
  assert.equal(redactSensitive('Connection timed out after 3 retries'), 'Connection timed out after 3 retries')
  // A 13-digit number is not an account id and must stay readable.
  assert.equal(redactSensitive('processed 1234567890123 records'), 'processed 1234567890123 records')
})

test('buildApiErrorEntry produces a safe structured error event', () => {
  const entry = buildApiErrorEntry({
    requestId: 'req-123',
    method: 'GET',
    path: '/api/costs/projections?environment=commercial',
    error: Object.assign(new Error('boom happened'), { name: 'TypeError' }),
  })

  assert.equal(entry.type, 'api_error')
  assert.equal(entry.level, 'error')
  assert.equal(entry.method, 'GET')
  assert.equal(entry.path, '/api/costs/projections')
  assert.equal(entry.requestId, 'req-123')
  assert.equal(entry.errorName, 'TypeError')
  assert.equal(entry.errorMessage, 'boom happened')
  assert.equal(typeof entry.timestamp, 'string')
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp as string)))
})

test('buildApiErrorEntry never leaks stack traces, unsafe ids, or defaults name', () => {
  const entry = buildApiErrorEntry({
    requestId: 'unsafe id with spaces',
    method: 'POST',
    path: '/api/x',
    error: { message: 'plain object error', stack: 'at secret:1:1' },
  })

  assert.equal('stack' in entry, false)
  assert.equal('requestId' in entry, false, 'unsafe request id must be dropped')
  assert.equal(entry.errorName, 'Error')
  assert.equal(entry.errorMessage, 'plain object error')
})

test('buildApiErrorEntry includes bounded AWS request id from $metadata', () => {
  const lower = buildApiErrorEntry({
    path: '/api/aws',
    error: { name: 'ThrottlingException', message: 'rate', $metadata: { requestId: 'aws-req-1' } },
  })
  assert.equal(lower.awsRequestId, 'aws-req-1')

  const upper = buildApiErrorEntry({
    path: '/api/aws',
    error: { name: 'ThrottlingException', message: 'rate', $metadata: { requestID: 'aws-req-2' } },
  })
  assert.equal(upper.awsRequestId, 'aws-req-2')

  const unsafe = buildApiErrorEntry({
    path: '/api/aws',
    error: { name: 'X', message: 'y', $metadata: { requestId: 'bad id!' } },
  })
  assert.equal('awsRequestId' in unsafe, false)
})

test('buildAuthFailureEntry matches the auth-failure metric filter shape', () => {
  const entry = buildAuthFailureEntry({
    requestId: 'req-123',
    method: 'GET',
    path: '/api/integrations/vmaas/instances/i-05cd04ddf94b4c099/cost',
    apiKeyProvided: false,
  })

  assert.equal(entry.type, 'auth')
  assert.equal(entry.status, 'failure')
  assert.equal(entry.reason, 'no_valid_credentials')
  assert.equal(entry.method, 'GET')
  // Instance id is collapsed so recurring 401s group into one route.
  assert.equal(entry.path, '/api/integrations/vmaas/instances/:awsResourceId/cost')
  assert.equal(entry.requestId, 'req-123')
  assert.equal(typeof entry.timestamp, 'string')
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp as string)))
})

test('buildAuthFailureEntry picks invalid_api_key only when a key was supplied', () => {
  const withKey = buildAuthFailureEntry({
    method: 'GET',
    path: '/api/v1/security/inspector/findings',
    apiKeyProvided: true,
  })
  assert.equal(withKey.reason, 'invalid_api_key')

  const withoutKey = buildAuthFailureEntry({
    method: 'GET',
    path: '/api/v1/security/inspector/findings',
    apiKeyProvided: false,
  })
  assert.equal(withoutKey.reason, 'no_valid_credentials')
})

test('buildAuthFailureEntry drops unsafe request ids and query strings', () => {
  const entry = buildAuthFailureEntry({
    requestId: 'unsafe id with spaces',
    method: 'POST',
    path: '/api/costs/projections?environment=commercial&token=secret',
    apiKeyProvided: false,
  })

  assert.equal('requestId' in entry, false, 'unsafe request id must be dropped')
  // Query string (including a stray token param) never reaches the record.
  assert.equal(entry.path, '/api/costs/projections')
})
