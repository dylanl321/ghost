import assert from 'node:assert/strict'
import test from 'node:test'
import { buildSecurityFindingsFailureLog } from '../../server/utils/security-hub-api'

// A provider error shaped like an AWS SDK exception, deliberately carrying
// sensitive material that must never reach the log record.
function providerError() {
  const error = new Error('User 123456789012 is not authorized to perform GetFindings on filter AwsAccountId=123456789012') as any
  error.name = 'AccessDeniedException'
  error.stack = 'AccessDeniedException: secret stack trace at querySecurityHubApi (secret)'
  error.apiKey = 'sk-super-secret-token'
  error.Filters = { AwsAccountId: [{ Value: '123456789012' }] }
  error.$metadata = { requestId: 'aws-req-abc-123', httpStatusCode: 403 }
  return error
}

test('failure log retains provider diagnostic fields', () => {
  const entry = buildSecurityFindingsFailureLog(providerError(), {
    provider: 'AWS Security Hub',
    environment: 'govcloud',
    regionCount: 2,
    accountCount: 3,
    requestId: 'ghost-req-xyz'
  })

  assert.equal(entry.type, 'security_findings_failure')
  assert.equal(entry.route, '/api/v1/security/findings')
  assert.equal(entry.provider, 'AWS Security Hub')
  assert.equal(entry.environment, 'govcloud')
  assert.equal(entry.regionCount, 2)
  assert.equal(entry.accountCount, 3)
  assert.equal(entry.errorCode, 'AccessDeniedException')
  assert.equal(entry.awsRequestId, 'aws-req-abc-123')
  assert.equal(entry.httpStatus, 403)
  assert.equal(entry.ghostRequestId, 'ghost-req-xyz')
})

test('failure log never emits sensitive or raw fields', () => {
  const entry = buildSecurityFindingsFailureLog(providerError(), {
    provider: 'AWS Security Hub',
    environment: 'commercial',
    regionCount: 2,
    accountCount: 5,
    requestId: 'ghost-req-xyz'
  })

  // No raw error passthrough: only the known safe keys are present.
  assert.deepEqual(
    Object.keys(entry).sort(),
    ['accountCount', 'awsRequestId', 'environment', 'errorCode', 'ghostRequestId', 'httpStatus', 'provider', 'regionCount', 'route', 'type'].sort()
  )

  // Serialized form must not leak account IDs, filter values, messages,
  // stack traces, or credentials.
  const serialized = JSON.stringify(entry)
  for (const forbidden of [
    '123456789012',
    'sk-super-secret-token',
    'secret stack trace',
    'not authorized',
    'AwsAccountId',
    'Filters'
  ]) {
    assert.ok(!serialized.includes(forbidden), `log must not contain "${forbidden}"`)
  }

  // Account context is a count only, never an identifier list.
  assert.equal(typeof entry.accountCount, 'number')
})

test('failure log omits optional fields when unavailable', () => {
  const entry = buildSecurityFindingsFailureLog(new Error('plain'), {
    provider: 'AWS Security Hub',
    environment: 'govcloud',
    regionCount: 1,
    accountCount: 0
  })

  assert.equal(entry.errorCode, 'Error')
  assert.ok(!('awsRequestId' in entry))
  assert.ok(!('ghostRequestId' in entry))
  assert.ok(!('httpStatus' in entry))
})

test('failure log surfaces HTTP status from h3-style errors without provider metadata', () => {
  const entry = buildSecurityFindingsFailureLog(
    Object.assign(new Error('Security Hub aggregation account is not configured.'), { statusCode: 500 }),
    { provider: 'AWS Security Hub', environment: 'govcloud', regionCount: 2, accountCount: 1 }
  )

  assert.equal(entry.httpStatus, 500)
  assert.ok(!('awsRequestId' in entry))
  assert.ok(!JSON.stringify(entry).includes('not configured'))
})
