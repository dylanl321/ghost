import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isRetryableOrganizationsError,
  computeOrganizationsRetryDelayMs
} from '../../server/utils/accounts-consolidated'

test('classifies Organizations throttling errors as retryable', () => {
  assert.equal(isRetryableOrganizationsError({ name: 'TooManyRequestsException' }), true)
  assert.equal(isRetryableOrganizationsError({ name: 'ThrottlingException' }), true)
  assert.equal(isRetryableOrganizationsError({ name: 'RequestThrottledException' }), true)
  assert.equal(isRetryableOrganizationsError({ code: 'Throttling' }), true)
  assert.equal(isRetryableOrganizationsError({ $metadata: { httpStatusCode: 429 } }), true)
})

test('does not retry AccessDenied or arbitrary failures', () => {
  assert.equal(isRetryableOrganizationsError({ name: 'AccessDeniedException' }), false)
  assert.equal(isRetryableOrganizationsError({ name: 'ValidationException' }), false)
  assert.equal(isRetryableOrganizationsError({ $metadata: { httpStatusCode: 403 } }), false)
  assert.equal(isRetryableOrganizationsError(new Error('boom')), false)
  assert.equal(isRetryableOrganizationsError(undefined), false)
  assert.equal(isRetryableOrganizationsError('TooManyRequestsException'), false)
})

test('backoff grows exponentially, stays within the jittered cap, and honors the ceiling', () => {
  // Full jitter at random()=1 yields the cap: base * 2^(attempt-1).
  assert.equal(computeOrganizationsRetryDelayMs(1, 500, 8000, () => 1), 500)
  assert.equal(computeOrganizationsRetryDelayMs(2, 500, 8000, () => 1), 1000)
  assert.equal(computeOrganizationsRetryDelayMs(3, 500, 8000, () => 1), 2000)
  // Cap is enforced once the exponential exceeds maxDelayMs.
  assert.equal(computeOrganizationsRetryDelayMs(10, 500, 8000, () => 1), 8000)
  // random()=0 floors to zero; a mid value stays below the cap.
  assert.equal(computeOrganizationsRetryDelayMs(3, 500, 8000, () => 0), 0)
  assert.ok(computeOrganizationsRetryDelayMs(3, 500, 8000, () => 0.5) < 2000)
})
