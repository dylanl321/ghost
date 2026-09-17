import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  isExpiredCredentialError,
  performBatchPut,
  type BatchPutClient
} from '../../server/utils/dynamodb'

function expiredError(name: string, message = 'The security token included in the request is expired'): Error {
  const error = new Error(message)
  ;(error as any).name = name
  return error
}

test('isExpiredCredentialError recognizes standard expired-credential names/codes', () => {
  assert.equal(isExpiredCredentialError({ name: 'ExpiredToken' }), true)
  assert.equal(isExpiredCredentialError({ name: 'ExpiredTokenException' }), true)
  assert.equal(isExpiredCredentialError({ code: 'RequestExpired' }), true)
  assert.equal(isExpiredCredentialError({ Code: 'ExpiredTokenException' }), true)
  // Names are matched case-insensitively.
  assert.equal(isExpiredCredentialError({ name: 'expiredtokenexception' }), true)
  // SDK __type values may be namespaced.
  assert.equal(
    isExpiredCredentialError({ __type: 'com.amazon.coral.service#ExpiredTokenException' }),
    true
  )
})

test('isExpiredCredentialError recognizes the exact expired-security-token message case-insensitively', () => {
  assert.equal(
    isExpiredCredentialError(new Error('The security token included in the request is expired')),
    true
  )
  assert.equal(
    isExpiredCredentialError(new Error('THE SECURITY TOKEN INCLUDED IN THE REQUEST IS EXPIRED')),
    true
  )
  // Real-world DynamoDB batch-write message wraps the same phrase.
  assert.equal(
    isExpiredCredentialError({
      name: 'UnrecognizedClientException',
      message: 'Batch put error: The security token included in the request is expired.'
    }),
    true
  )
})

test('isExpiredCredentialError does NOT classify arbitrary auth/access or unrelated errors', () => {
  assert.equal(isExpiredCredentialError({ name: 'AccessDeniedException' }), false)
  assert.equal(isExpiredCredentialError({ name: 'UnauthorizedOperation' }), false)
  assert.equal(isExpiredCredentialError({ code: 'InvalidSignatureException' }), false)
  assert.equal(isExpiredCredentialError({ name: 'ProvisionedThroughputExceededException' }), false)
  assert.equal(isExpiredCredentialError(new Error('Access denied for this operation')), false)
  assert.equal(isExpiredCredentialError(null), false)
  assert.equal(isExpiredCredentialError(undefined), false)
  assert.equal(isExpiredCredentialError('ExpiredToken'), false)
  assert.equal(isExpiredCredentialError({}), false)
})

test('performBatchPut refreshes the client on expiry and retries the same batch once', async () => {
  let sendCalls = 0
  let acquireCalls = 0

  const client: BatchPutClient = {
    send: async () => {
      sendCalls++
      if (sendCalls === 1) {
        throw expiredError('ExpiredTokenException')
      }
      return {} // success: no UnprocessedItems
    }
  }

  const acquireClient = async () => {
    acquireCalls++
    return client
  }

  const results = await performBatchPut(
    'ghost-ai-usage',
    [{ pk: 'A', sk: '1' }],
    acquireClient,
    { environment: 'govcloud', isCrossAccount: false }
  )

  assert.equal(acquireCalls, 2, 'client should be acquired once initially and once on refresh')
  assert.equal(sendCalls, 2, 'the same batch should be retried exactly once after refresh')
  assert.equal(results.length, 1)
})

test('performBatchPut throws a summary error when credentials stay expired (no false success)', async () => {
  const client: BatchPutClient = {
    send: async () => {
      throw expiredError('ExpiredToken')
    }
  }

  await assert.rejects(
    performBatchPut(
      'ghost-ai-usage',
      [{ pk: 'A', sk: '1' }],
      async () => client,
      { environment: 'commercial', isCrossAccount: true }
    ),
    (error: any) => {
      assert.equal(error.name, 'BatchPutPartialFailureError')
      assert.equal(error.failedCount, 1)
      assert.match(error.message, /failed for 1 of 1 items in commercial/)
      // Never leaks item contents or account IDs.
      assert.doesNotMatch(error.message, /pk|sk/)
      return true
    }
  )
})

test('performBatchPut does not refresh on non-expiry errors and still fails loudly', async () => {
  let acquireCalls = 0
  const client: BatchPutClient = {
    send: async () => {
      const error = new Error('User is not authorized to perform: dynamodb:BatchWriteItem')
      ;(error as any).name = 'AccessDeniedException'
      throw error
    }
  }

  await assert.rejects(
    performBatchPut(
      'ghost-ai-usage',
      [{ pk: 'A', sk: '1' }],
      async () => {
        acquireCalls++
        return client
      },
      { environment: 'govcloud', isCrossAccount: false }
    ),
    /failed for 1 of 1 items/
  )

  assert.equal(acquireCalls, 1, 'arbitrary errors must not trigger a credential refresh')
})
