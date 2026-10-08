import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { computeReceiveRetryDelay } from '../receive-backoff'

const opts = (random: number, extra = {}) => ({ random: () => random, ...extra })

test('full jitter returns 0 when the RNG yields 0', () => {
  assert.equal(computeReceiveRetryDelay(1, opts(0)), 0)
  assert.equal(computeReceiveRetryDelay(5, opts(0)), 0)
})

test('upper edge of jitter equals the exponential ceiling for the attempt', () => {
  // random ~1 => jitter floor(1 * (ceiling + 1)) capped at maxDelayMs
  assert.equal(computeReceiveRetryDelay(1, opts(0.999999)), 250)
  assert.equal(computeReceiveRetryDelay(2, opts(0.999999)), 500)
  assert.equal(computeReceiveRetryDelay(3, opts(0.999999)), 1000)
})

test('delay never exceeds the cap for any attempt or RNG value', () => {
  for (let attempt = 1; attempt <= 50; attempt++) {
    for (const r of [0, 0.25, 0.5, 0.75, 1]) {
      const delay = computeReceiveRetryDelay(attempt, opts(r))
      assert.ok(delay >= 0, `delay ${delay} should be >= 0`)
      assert.ok(delay <= 30_000, `delay ${delay} should be <= cap`)
    }
  }
})

test('exponential ceiling saturates at the cap for large attempts', () => {
  // 250 * 2^(attempt-1) crosses 30_000 around attempt 8
  assert.equal(computeReceiveRetryDelay(20, opts(0.999999)), 30_000)
})

test('attempts below 1 are treated as the first attempt', () => {
  assert.equal(computeReceiveRetryDelay(0, opts(0.999999)), 250)
  assert.equal(computeReceiveRetryDelay(-3, opts(0.999999)), 250)
})

test('honors custom initial and max delays', () => {
  assert.equal(computeReceiveRetryDelay(1, opts(0.999999, { initialDelayMs: 100 })), 100)
  assert.equal(computeReceiveRetryDelay(1, opts(0.999999, { initialDelayMs: 500, maxDelayMs: 400 })), 400)
})

test('a fresh (reset) attempt counter yields the small initial-bounded delay', () => {
  // Simulates resetting the counter after a successful receive: attempt 1 again.
  const grown = computeReceiveRetryDelay(6, opts(0.999999))
  const afterReset = computeReceiveRetryDelay(1, opts(0.999999))
  assert.ok(afterReset < grown)
  assert.equal(afterReset, 250)
})
