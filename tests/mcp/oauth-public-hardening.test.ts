import assert from 'node:assert/strict'
import test from 'node:test'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { STSClient } from '@aws-sdk/client-sts'
import { checkMcpRateLimit, localRateBucketCount } from '../../server/mcp/rate-limit'
import { rejectIfRegistrationRateLimited } from '../../server/mcp/oauth/registration-rate-limit'
import { isTransientDependencyError } from '../../server/mcp/oauth/transient-error'
import { readRawNetworkAddress } from '../../server/mcp/oauth/admin/stage-instrumentation'
import { clearClientCache } from '../../server/lib/aws-client-factory'

function fakeEvent(forwardedFor: string) {
  const headers: Record<string, unknown> = {}
  const res = {
    statusCode: 200,
    body: '',
    setHeader(name: string, value: unknown) { headers[name.toLowerCase()] = value },
    end(body: string) { this.body = body }
  }
  return {
    event: { node: { req: { headers: { 'x-forwarded-for': forwardedFor }, socket: { remoteAddress: '10.0.0.5' } }, res } } as any,
    res,
    headers
  }
}

test('registration rate limit keys on the load balancer hop, so spoofed X-Forwarded-For does not reset it', async (t) => {
  const previous = process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR
  process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR = '2'
  t.after(() => {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR')
    else process.env.GHOST_OAUTH_REGISTRATION_RATE_LIMIT_PER_HOUR = previous
  })

  const client = `198.51.100.${Math.floor(Math.random() * 250)}`
  assert.equal(await rejectIfRegistrationRateLimited(fakeEvent(`1.1.1.1, ${client}`).event), false)
  assert.equal(await rejectIfRegistrationRateLimited(fakeEvent(`2.2.2.2, ${client}`).event), false)

  const third = fakeEvent(`3.3.3.3, ${client}`)
  assert.equal(await rejectIfRegistrationRateLimited(third.event), true)
  assert.equal(third.res.statusCode, 429)
  assert.ok(Number(third.headers['retry-after']) > 0)
  assert.equal(third.headers['content-type'], 'application/json')
  const body = JSON.parse(third.res.body)
  assert.equal(body.error, 'too_many_requests')
  assert.match(body.error_description, /Retry after \d+ seconds/)
})

test('OAuth telemetry records the same client address the rate limit uses', () => {
  assert.equal(readRawNetworkAddress({ headers: { 'x-forwarded-for': '1.1.1.1, 203.0.113.9' } }), '203.0.113.9')
})

test('local rate buckets are pruned once expired instead of growing forever', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
  for (let i = 0; i < 5100; i++) await checkMcpRateLimit(`prune-test-${i}`, 10, 1)
  assert.ok(localRateBucketCount() >= 5000)
  t.mock.timers.tick(2000)
  await checkMcpRateLimit('prune-test-trigger', 10, 1)
  assert.ok(localRateBucketCount() < 100, `expected pruning, still ${localRateBucketCount()} buckets`)
})

test('a durable rate-limit outage falls back to the in-process limit instead of failing requests', async (t) => {
  const overrides = {
    GHOST_OAUTH_TABLE_NAME: 'ghost-oauth-test',
    AWS_GOVCLOUD_ACCESS_KEY_ID: 'test-base-key',
    AWS_GOVCLOUD_SECRET_ACCESS_KEY: 'test-base-secret',
    AWS_GOVCLOUD_REGION: 'us-gov-west-1'
  }
  const previous = Object.keys(overrides).map(key => [key, process.env[key]] as const)
  Object.assign(process.env, overrides)
  clearClientCache()
  t.after(() => {
    for (const [key, value] of previous) {
      if (value === undefined) Reflect.deleteProperty(process.env, key)
      else process.env[key] = value
    }
    clearClientCache()
  })
  t.mock.method(STSClient.prototype, 'send', async () => ({ Credentials: {
    AccessKeyId: 'a', SecretAccessKey: 'b', SessionToken: 'c', Expiration: new Date(Date.now() + 3_600_000)
  } }))
  t.mock.method(DynamoDBClient.prototype, 'send', async () => {
    throw Object.assign(new Error('Rate exceeded'), { name: 'ThrottlingException', $retryable: { throttling: true } })
  })

  const key = `outage-${Math.random()}`
  assert.equal((await checkMcpRateLimit(key, 1, 60)).allowed, true)
  assert.equal((await checkMcpRateLimit(key, 1, 60)).allowed, false)
})

test('transient AWS and network failures are distinguished from credential failures', () => {
  assert.equal(isTransientDependencyError({ name: 'ThrottlingException' }), true)
  assert.equal(isTransientDependencyError({ name: 'ProvisionedThroughputExceededException' }), true)
  assert.equal(isTransientDependencyError({ $metadata: { httpStatusCode: 503 } }), true)
  assert.equal(isTransientDependencyError({ code: 'ECONNRESET' }), true)
  assert.equal(isTransientDependencyError({ name: 'AccessDeniedException', $metadata: { httpStatusCode: 400 } }), false)
  assert.equal(isTransientDependencyError(new Error('invalid token')), false)
  assert.equal(isTransientDependencyError(undefined), false)
})

test('Kiro Crew 401s carry a bearer challenge pointing at protected-resource metadata', async () => {
  const { requireKiroCrewToken } = await import('../../server/kirocrew/auth')
  const { event, headers } = fakeEvent('203.0.113.9')
  await assert.rejects(requireKiroCrewToken(event, ['kirocrew.config.read']), (error: any) => error.statusCode === 401)
  const challenge = String(headers['www-authenticate'])
  assert.match(challenge, /^Bearer /)
  assert.match(challenge, /resource_metadata="[^"]*\/\.well-known\/oauth-protected-resource\/api\/kirocrew"/)
  assert.match(challenge, /scope="kirocrew\.config\.read"/)
})
