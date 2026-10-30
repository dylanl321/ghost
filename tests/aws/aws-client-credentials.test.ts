import assert from 'node:assert/strict'
import test from 'node:test'

import {
  __setAssumeRoleForTests,
  clearAllClients,
  getAssumedRoleCredentials,
  getClient,
  getRequestHandlerTimeouts,
} from '../../server/lib/aws-client-factory'
import { assumeRoleCircuitBreaker, isTransientAssumeRoleError } from '../../server/utils/credential-circuit-breaker'
import { awsApiCallCounterMiddleware, drainAwsApiCallCounts } from '../../server/utils/aws-call-metrics'

process.env.AWS_GOVCLOUD_ACCESS_KEY_ID = 'AKIAEXAMPLEGOVCLOUD0'
process.env.AWS_GOVCLOUD_SECRET_ACCESS_KEY = 'test-secret'
process.env.AWS_COMMERCIAL_ACCESS_KEY_ID = 'AKIAEXAMPLECOMMERC00'
process.env.AWS_COMMERCIAL_SECRET_ACCESS_KEY = 'test-secret'

function fakeCredentials(expiresInMs = 60 * 60 * 1000) {
  return {
    accessKeyId: 'ASIAEXAMPLE',
    secretAccessKey: 'secret',
    sessionToken: 'token',
    expiration: new Date(Date.now() + expiresInMs),
  }
}

function namedError(name: string, extra: Record<string, unknown> = {}) {
  return Object.assign(new Error(name), { name }, extra)
}

test.afterEach(() => {
  __setAssumeRoleForTests()
  clearAllClients()
  assumeRoleCircuitBreaker.resetAll()
})

test('concurrent callers for a cold account share one AssumeRole call', async () => {
  let calls = 0
  __setAssumeRoleForTests(async () => {
    calls++
    await new Promise(resolve => setTimeout(resolve, 10))
    return fakeCredentials()
  })

  const results = await Promise.all(
    Array.from({ length: 15 }, () => getAssumedRoleCredentials('govcloud', '111111111111')),
  )

  assert.equal(calls, 1)
  assert.ok(results.every(r => r === results[0]))
})

test('one set of assumed credentials serves every service client in the account', async () => {
  let calls = 0
  __setAssumeRoleForTests(async () => {
    calls++
    return fakeCredentials()
  })

  await getClient('govcloud', 'ec2', 'us-gov-west-1', '222222222222')
  await getClient('govcloud', 's3', 'us-gov-west-1', '222222222222')
  await getClient('govcloud', 'cloudwatch', 'us-gov-east-1', '222222222222')

  assert.equal(calls, 1)
})

test('credentials close to expiry are refreshed', async () => {
  let calls = 0
  __setAssumeRoleForTests(async () => {
    calls++
    return fakeCredentials(calls === 1 ? 60 * 1000 : 60 * 60 * 1000)
  })

  await getAssumedRoleCredentials('govcloud', '333333333333')
  await getAssumedRoleCredentials('govcloud', '333333333333')

  assert.equal(calls, 2)
})

test('partitions do not share cached credentials for the same account id', async () => {
  const seen: string[] = []
  __setAssumeRoleForTests(async (_account, _region, environment) => {
    seen.push(environment)
    return fakeCredentials()
  })

  await getAssumedRoleCredentials('govcloud', '444444444444')
  await getAssumedRoleCredentials('commercial', '444444444444')

  assert.deepEqual(seen, ['govcloud', 'commercial'])
})

test('a burst of throttled AssumeRole calls does not open the circuit', async () => {
  __setAssumeRoleForTests(async () => {
    throw namedError('Throttling', { $metadata: { httpStatusCode: 400 } })
  })

  for (let i = 0; i < 5; i++) {
    await assert.rejects(getAssumedRoleCredentials('govcloud', '555555555555'))
  }

  assert.equal(assumeRoleCircuitBreaker.getState('555555555555'), 'CLOSED')
})

test('repeated access denied opens the circuit and stops calling STS', async () => {
  let calls = 0
  __setAssumeRoleForTests(async () => {
    calls++
    throw namedError('AccessDenied', { $metadata: { httpStatusCode: 403 } })
  })

  for (let i = 0; i < 3; i++) {
    await assert.rejects(getAssumedRoleCredentials('govcloud', '666666666666'))
  }
  assert.equal(assumeRoleCircuitBreaker.getState('666666666666'), 'OPEN')

  await assert.rejects(getAssumedRoleCredentials('govcloud', '666666666666'), /Circuit breaker OPEN/)
  assert.equal(calls, 3)
})

test('classifies transient STS errors', () => {
  assert.equal(isTransientAssumeRoleError(namedError('ThrottlingException')), true)
  assert.equal(isTransientAssumeRoleError(namedError('TimeoutError')), true)
  assert.equal(isTransientAssumeRoleError(Object.assign(new Error('reset'), { code: 'ECONNRESET' })), true)
  assert.equal(isTransientAssumeRoleError(namedError('InternalError', { $metadata: { httpStatusCode: 503 } })), true)
  assert.equal(isTransientAssumeRoleError(namedError('AccessDenied', { $metadata: { httpStatusCode: 403 } })), false)
  assert.equal(isTransientAssumeRoleError(namedError('ValidationError', { $metadata: { httpStatusCode: 400 } })), false)
})

test('SDK clients get bounded connection and socket timeouts', () => {
  delete process.env.AWS_SDK_REQUEST_TIMEOUT_MS
  assert.deepEqual(getRequestHandlerTimeouts('cost-explorer'), { connectionTimeout: 5000, requestTimeout: 120000 })
  assert.equal(getRequestHandlerTimeouts('bedrock-runtime').requestTimeout, 300000)

  process.env.AWS_SDK_REQUEST_TIMEOUT_MS = '30000'
  assert.equal(getRequestHandlerTimeouts('athena').requestTimeout, 30000)
  process.env.AWS_SDK_REQUEST_TIMEOUT_MS = 'not-a-number'
  assert.equal(getRequestHandlerTimeouts('athena').requestTimeout, 120000)
  delete process.env.AWS_SDK_REQUEST_TIMEOUT_MS
})

test('Cost Explorer calls are counted per operation', async () => {
  drainAwsApiCallCounts()
  const middleware = awsApiCallCounterMiddleware('cost-explorer')
  const next = async () => ({ output: {} })

  await middleware(next, { commandName: 'GetCostAndUsageCommand' })({})
  await middleware(next, { commandName: 'GetCostAndUsageCommand' })({})
  await middleware(next, { commandName: 'GetCostForecastCommand' })({})

  assert.deepEqual(drainAwsApiCallCounts(), [
    { service: 'cost-explorer', operation: 'GetCostAndUsage', count: 2 },
    { service: 'cost-explorer', operation: 'GetCostForecast', count: 1 },
  ])
  assert.deepEqual(drainAwsApiCallCounts(), [])
})
