import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { evaluateCircuitBreakerHealth } from '../circuit-breaker-health'
import type { CircuitBreakerStats } from '../credential-circuit-breaker'

const stats = (over: Partial<CircuitBreakerStats> = {}): CircuitBreakerStats => ({
  open: [],
  halfOpen: [],
  totalTracked: 0,
  ...over
})

test('all circuits closed: no warning, status unchanged', () => {
  const result = evaluateCircuitBreakerHealth(stats({ totalTracked: 2 }), 'healthy')
  assert.equal(result.warning, null)
  assert.equal(result.status, 'healthy')
})

test('open circuit downgrades healthy to degraded with a count-only warning', () => {
  const result = evaluateCircuitBreakerHealth(
    stats({ open: ['461760157232'], totalTracked: 1 }),
    'healthy'
  )
  assert.equal(result.status, 'degraded')
  assert.ok(result.warning)
  assert.match(result.warning!, /1 open/)
  // Warning must not leak the account ID — IDs live only in the diagnostic.
  assert.doesNotMatch(result.warning!, /461760157232/)
})

test('half-open circuit also triggers a warning and downgrade', () => {
  const result = evaluateCircuitBreakerHealth(
    stats({ halfOpen: ['123456789012'], totalTracked: 1 }),
    'healthy'
  )
  assert.equal(result.status, 'degraded')
  assert.match(result.warning!, /1 half-open/)
})

test('both open and half-open are reflected in the warning', () => {
  const result = evaluateCircuitBreakerHealth(
    stats({ open: ['a', 'b'], halfOpen: ['c'], totalTracked: 3 }),
    'healthy'
  )
  assert.match(result.warning!, /2 open/)
  assert.match(result.warning!, /1 half-open/)
})

test('never downgrades an existing unhealthy status', () => {
  const result = evaluateCircuitBreakerHealth(
    stats({ open: ['461760157232'], totalTracked: 1 }),
    'unhealthy'
  )
  assert.equal(result.status, 'unhealthy')
  assert.ok(result.warning)
})

test('keeps an existing degraded status (does not re-downgrade or upgrade)', () => {
  const result = evaluateCircuitBreakerHealth(
    stats({ open: ['461760157232'], totalTracked: 1 }),
    'degraded'
  )
  assert.equal(result.status, 'degraded')
})
