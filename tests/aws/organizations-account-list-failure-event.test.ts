import assert from 'node:assert/strict'
import test from 'node:test'
import { buildOrganizationsAccountListFailureEvent } from '../../server/utils/accounts-consolidated'

test('emits the stable top-level terminal-failure schema', () => {
  const entry = buildOrganizationsAccountListFailureEvent({
    environment: 'commercial',
    attempt: 5,
    maxAttempts: 5,
    retryable: true,
    error: {
      name: 'TooManyRequestsException',
      code: 'TooManyRequestsException',
      $metadata: { httpStatusCode: 429 }
    }
  })

  assert.equal(entry.type, 'organizations_account_list_failure')
  assert.equal(entry.level, 'error')
  assert.equal(entry.component, 'accounts-consolidated')
  assert.equal(entry.operation, 'listAccountsFromOrganizations')
  assert.equal(entry.environment, 'commercial')
  assert.equal(entry.attempt, 5)
  assert.equal(entry.maxAttempts, 5)
  assert.equal(entry.retryable, true)
  assert.equal(entry.errorName, 'TooManyRequestsException')
  assert.equal(entry.errorCode, 'TooManyRequestsException')
  assert.equal(entry.httpStatusCode, 429)
  assert.equal(typeof entry.timestamp, 'string')
  assert.ok(!Number.isNaN(Date.parse(entry.timestamp as string)))
})

test('never leaks raw message, stack, or other error payload fields', () => {
  const entry = buildOrganizationsAccountListFailureEvent({
    environment: 'govcloud',
    attempt: 1,
    maxAttempts: 5,
    retryable: false,
    error: {
      name: 'AccessDeniedException',
      message: 'User arn:aws:iam::123456789012:role/x is not authorized; token=abc.def.ghi',
      stack: 'AccessDeniedException: boom\n    at listAccounts (/app/x.js:1:1)',
      $metadata: { httpStatusCode: 403, requestId: 'req-123' }
    }
  })

  // Only expected keys are present — no message/stack/metadata/requestId leak.
  assert.deepEqual(
    Object.keys(entry).sort(),
    [
      'attempt',
      'component',
      'environment',
      'errorName',
      'httpStatusCode',
      'level',
      'maxAttempts',
      'operation',
      'retryable',
      'timestamp',
      'type'
    ].sort()
  )

  const serialized = JSON.stringify(entry)
  assert.ok(!serialized.includes('not authorized'))
  assert.ok(!serialized.includes('token=abc'))
  assert.ok(!serialized.includes('123456789012'))
  assert.ok(!serialized.includes('at listAccounts'))
  assert.ok(!serialized.includes('req-123'))
  assert.equal(entry.errorName, 'AccessDeniedException')
  assert.equal(entry.errorCode, undefined)
  assert.equal(entry.httpStatusCode, 403)
})

test('handles non-object errors without inventing fields', () => {
  for (const error of [undefined, null, 'TooManyRequestsException', 42]) {
    const entry = buildOrganizationsAccountListFailureEvent({
      environment: 'commercial',
      attempt: 3,
      maxAttempts: 5,
      retryable: false,
      error
    })

    assert.equal(entry.type, 'organizations_account_list_failure')
    assert.equal(entry.environment, 'commercial')
    assert.equal(entry.attempt, 3)
    assert.equal(entry.errorName, undefined)
    assert.equal(entry.errorCode, undefined)
    assert.equal(entry.httpStatusCode, undefined)
  }
})

test('omits httpStatusCode when it is not numeric', () => {
  const entry = buildOrganizationsAccountListFailureEvent({
    environment: 'commercial',
    attempt: 2,
    maxAttempts: 5,
    retryable: true,
    error: { name: 'ThrottlingException', $metadata: { httpStatusCode: '429' } }
  })

  assert.equal(entry.errorName, 'ThrottlingException')
  assert.equal(entry.httpStatusCode, undefined)
})
