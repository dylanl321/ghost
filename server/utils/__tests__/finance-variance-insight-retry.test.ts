import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  ceBackoffDelayMs,
  ceErrorCode,
  ceErrorName,
  isCeThrottleError,
} from '../finance-variance-insight-retry'

test('isCeThrottleError matches known Cost Explorer throttling errors', () => {
  assert.equal(isCeThrottleError({ name: 'LimitExceededException', message: 'Too many open requests' }), true)
  assert.equal(isCeThrottleError({ name: 'ThrottlingException' }), true)
  assert.equal(isCeThrottleError({ code: 'Throttling' }), true)
  assert.equal(isCeThrottleError({ name: 'TooManyRequestsException' }), true)
  assert.equal(isCeThrottleError({ name: 'RequestLimitExceeded' }), true)
  assert.equal(isCeThrottleError({ message: 'Rate exceeded' }), true)
  assert.equal(isCeThrottleError({ $metadata: { httpStatusCode: 429 } }), true)
})

test('isCeThrottleError does not match non-throttle or malformed errors', () => {
  assert.equal(isCeThrottleError({ name: 'ValidationException', message: 'bad filter' }), false)
  assert.equal(isCeThrottleError({ name: 'AccessDeniedException' }), false)
  assert.equal(isCeThrottleError({ $metadata: { httpStatusCode: 500 } }), false)
  assert.equal(isCeThrottleError(new Error('some generic failure')), false)
  assert.equal(isCeThrottleError(null), false)
  assert.equal(isCeThrottleError(undefined), false)
  assert.equal(isCeThrottleError('LimitExceededException'), false) // strings are not error objects
})

test('ceBackoffDelayMs applies bounded exponential full jitter', () => {
  // rand()=0 → always 0 regardless of attempt
  assert.equal(ceBackoffDelayMs(0, () => 0), 0)
  assert.equal(ceBackoffDelayMs(5, () => 0), 0)

  // rand() just under 1 → just under the ceiling (base * 2^attempt), floored
  assert.equal(ceBackoffDelayMs(0, () => 0.999, 200, 2000), 199) // ceiling 200
  assert.equal(ceBackoffDelayMs(1, () => 0.999, 200, 2000), 399) // ceiling 400
  assert.equal(ceBackoffDelayMs(2, () => 0.999, 200, 2000), 799) // ceiling 800

  // capped: base*2^attempt would exceed cap → clamped to cap
  assert.equal(ceBackoffDelayMs(10, () => 0.5, 200, 2000), 1000) // ceiling clamped to 2000
})

test('ceBackoffDelayMs stays within [0, ceiling) for random jitter', () => {
  for (let attempt = 0; attempt < 6; attempt++) {
    const ceiling = Math.min(2000, 200 * 2 ** attempt)
    for (let i = 0; i < 50; i++) {
      const d = ceBackoffDelayMs(attempt)
      assert.ok(d >= 0 && d < ceiling, `delay ${d} out of range for attempt ${attempt}`)
    }
  }
})

test('ceErrorName / ceErrorCode extract safely without exposing raw objects', () => {
  assert.equal(ceErrorName({ name: 'ThrottlingException' }), 'ThrottlingException')
  assert.equal(ceErrorName({}), 'UnknownError')
  assert.equal(ceErrorName(null), 'UnknownError')
  assert.equal(ceErrorCode({ code: 'Throttling' }), 'Throttling')
  assert.equal(ceErrorCode({ name: 'X' }), undefined)
})
