import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  computeOrgBackoffMs,
  isRetryableOrgThrottle,
} from '../accounts-consolidated'

test('classifies Organizations throttling errors as retryable by name', () => {
  assert.equal(isRetryableOrgThrottle({ name: 'TooManyRequestsException' }), true)
  assert.equal(isRetryableOrgThrottle({ name: 'ThrottlingException' }), true)
  assert.equal(isRetryableOrgThrottle({ name: 'Throttling' }), true)
})

test('does not retry non-throttle or malformed errors', () => {
  assert.equal(isRetryableOrgThrottle({ name: 'AccessDeniedException' }), false)
  assert.equal(isRetryableOrgThrottle(new Error('boom')), false)
  assert.equal(isRetryableOrgThrottle(null), false)
  assert.equal(isRetryableOrgThrottle(undefined), false)
  assert.equal(isRetryableOrgThrottle('TooManyRequestsException'), false)
})

test('backoff is full-jitter within the bounded exponential ceiling', () => {
  // random() = 1 yields the exponential ceiling (floored) for each attempt.
  const maxAt = (attempt: number) =>
    computeOrgBackoffMs(attempt, { baseMs: 200, maxMs: 5000, random: () => 1 })
  assert.equal(maxAt(0), 200)   // 200 * 2^0
  assert.equal(maxAt(1), 400)   // 200 * 2^1
  assert.equal(maxAt(2), 800)   // 200 * 2^2
  assert.equal(maxAt(3), 1600)  // 200 * 2^3
  assert.equal(maxAt(4), 3200)  // 200 * 2^4
})

test('backoff is capped at maxMs regardless of attempt', () => {
  const delay = computeOrgBackoffMs(20, { baseMs: 200, maxMs: 5000, random: () => 1 })
  assert.equal(delay, 5000)
})

test('backoff floors to zero when random returns zero', () => {
  assert.equal(computeOrgBackoffMs(3, { random: () => 0 }), 0)
})

test('backoff scales jitter linearly with random output', () => {
  // random() = 0.5 yields half the ceiling.
  assert.equal(computeOrgBackoffMs(2, { baseMs: 200, maxMs: 5000, random: () => 0.5 }), 400)
})
