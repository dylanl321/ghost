import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { withOrganizationsThrottleRetry } from '../accounts-consolidated'

// No-op sleep + deterministic jitter keep these tests fast and stable.
const noSleep = async () => {}
const noJitter = () => 0

function throttleError(name = 'TooManyRequestsException'): Error {
  const err = new Error(name)
  err.name = name
  return err
}

test('retries throttle errors and succeeds on a later attempt', async () => {
  let calls = 0
  const result = await withOrganizationsThrottleRetry(
    async () => {
      calls++
      if (calls < 3) throw throttleError()
      return 'ok'
    },
    { environment: 'commercial', operation: 'ListAccounts', sleep: noSleep, random: noJitter }
  )

  assert.equal(result, 'ok')
  assert.equal(calls, 3)
})

test('treats a 429 $metadata status as a throttle error', async () => {
  let calls = 0
  const result = await withOrganizationsThrottleRetry(
    async () => {
      calls++
      if (calls < 2) {
        const err = new Error('rate exceeded') as Error & { $metadata?: unknown }
        err.$metadata = { httpStatusCode: 429 }
        throw err
      }
      return 'recovered'
    },
    { environment: 'commercial', operation: 'ListAccounts', sleep: noSleep, random: noJitter }
  )

  assert.equal(result, 'recovered')
  assert.equal(calls, 2)
})

test('does not retry non-throttle errors — rethrows immediately', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      withOrganizationsThrottleRetry(
        async () => {
          calls++
          throw new Error('AccessDeniedException')
        },
        { environment: 'commercial', operation: 'ListAccounts', sleep: noSleep, random: noJitter }
      ),
    /AccessDeniedException/
  )
  assert.equal(calls, 1)
})

test('rethrows the throttle error after exhausting all attempts', async () => {
  let calls = 0
  await assert.rejects(
    () =>
      withOrganizationsThrottleRetry(
        async () => {
          calls++
          throw throttleError('ThrottlingException')
        },
        {
          environment: 'govcloud',
          operation: 'ListAccounts',
          maxAttempts: 3,
          sleep: noSleep,
          random: noJitter,
        }
      ),
    /ThrottlingException/
  )
  assert.equal(calls, 3)
})
