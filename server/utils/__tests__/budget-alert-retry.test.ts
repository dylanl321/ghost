import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  isTransientTransportError,
  withTransientRetry
} from '../budget-alert-retry'

// No real waits in tests — inject a no-op sleep.
const noSleep = async () => {}

function makeError(props: { name?: string; code?: string; message?: string }): Error {
  const err = new Error(props.message ?? 'boom')
  if (props.name) err.name = props.name
  if (props.code) (err as any).code = props.code
  return err
}

test('classifies known transient transport errors as transient', () => {
  assert.equal(isTransientTransportError(makeError({ code: 'ECONNRESET' })), true)
  assert.equal(isTransientTransportError(makeError({ code: 'ETIMEDOUT' })), true)
  assert.equal(isTransientTransportError(makeError({ name: 'TimeoutError' })), true)
})

test('does not classify validation/authorization/throttling/arbitrary errors as transient', () => {
  assert.equal(isTransientTransportError(makeError({ name: 'ValidationException' })), false)
  assert.equal(isTransientTransportError(makeError({ name: 'AccessDeniedException' })), false)
  assert.equal(isTransientTransportError(makeError({ name: 'ThrottlingException' })), false)
  assert.equal(isTransientTransportError(makeError({ code: 'EACCES' })), false)
  assert.equal(isTransientTransportError(makeError({ message: 'random failure' })), false)
  assert.equal(isTransientTransportError(null), false)
  assert.equal(isTransientTransportError('ECONNRESET'), false)
})

test('retries transient failures and returns the eventual success', async () => {
  let attempts = 0
  const result = await withTransientRetry(
    async () => {
      attempts++
      if (attempts < 3) throw makeError({ code: 'ECONNRESET' })
      return 'ok'
    },
    { component: 'budget-alert-notifier', operation: 'getAlertsByMonth', month: '2026-08' },
    { maxAttempts: 3, baseDelayMs: 1, sleep: noSleep }
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('exhausts retries and preserves the original transient error', async () => {
  let attempts = 0
  const original = makeError({ code: 'ETIMEDOUT', message: 'socket hang up' })

  await assert.rejects(
    () =>
      withTransientRetry(
        async () => {
          attempts++
          throw original
        },
        { component: 'budget-alert-notifier', operation: 'getAlertsByMonth', month: '2026-08' },
        { maxAttempts: 3, baseDelayMs: 1, sleep: noSleep }
      ),
    (err: unknown) => err === original
  )

  assert.equal(attempts, 3)
})

test('does not retry non-transient errors and rethrows immediately', async () => {
  let attempts = 0
  const original = makeError({ name: 'ValidationException', message: 'bad input' })

  await assert.rejects(
    () =>
      withTransientRetry(
        async () => {
          attempts++
          throw original
        },
        { component: 'budget-alert-notifier', operation: 'getAlertsByMonth', month: '2026-08' },
        { maxAttempts: 3, baseDelayMs: 1, sleep: noSleep }
      ),
    (err: unknown) => err === original
  )

  assert.equal(attempts, 1)
})
