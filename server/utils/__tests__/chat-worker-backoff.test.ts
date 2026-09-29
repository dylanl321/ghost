import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  RECEIVE_BACKOFF_BASE_MS,
  RECEIVE_BACKOFF_CAP_MS,
  computeReceiveBackoffMs,
} from '../chat-worker-backoff'

test('first consecutive failure waits the base delay', () => {
  assert.equal(computeReceiveBackoffMs(1), RECEIVE_BACKOFF_BASE_MS)
})

test('delay doubles per consecutive failure', () => {
  assert.equal(computeReceiveBackoffMs(2), 4000)
  assert.equal(computeReceiveBackoffMs(3), 8000)
  assert.equal(computeReceiveBackoffMs(4), 16000)
  assert.equal(computeReceiveBackoffMs(5), 32000)
})

test('delay is capped at the maximum', () => {
  assert.equal(computeReceiveBackoffMs(6), RECEIVE_BACKOFF_CAP_MS)
  assert.equal(computeReceiveBackoffMs(100), RECEIVE_BACKOFF_CAP_MS)
})

test('non-positive failure counts fall back to the base delay', () => {
  assert.equal(computeReceiveBackoffMs(0), RECEIVE_BACKOFF_BASE_MS)
  assert.equal(computeReceiveBackoffMs(-3), RECEIVE_BACKOFF_BASE_MS)
})

test('custom base and cap are honored', () => {
  assert.equal(computeReceiveBackoffMs(1, 1000, 10000), 1000)
  assert.equal(computeReceiveBackoffMs(4, 1000, 10000), 8000)
  assert.equal(computeReceiveBackoffMs(5, 1000, 10000), 10000)
})
