import assert from 'node:assert/strict'
import test from 'node:test'
import { createApp, createError, getQuery, toPlainHandler, type EventHandler } from 'h3'
import { defineV1Alias } from '../../server/utils/v1-route'
import { withV1Errors } from '../../server/utils/v1-errors'
import { personMatches, resolveIntegrationAccountScope } from '../../server/utils/integration-account-scope'

const auth = { isAuthenticated: true, authType: 'apikey', scopes: ['costs:read'] }

async function request(handler: EventHandler, path: string, authentication: unknown = auth) {
  const response = await toPlainHandler(createApp().use(handler))({
    path,
    method: 'GET',
    context: { auth: authentication, requestId: 'req-123' }
  })
  return { ...response, data: JSON.parse(String(response.body)) }
}

test('v1 client errors use the documented error envelope', async () => {
  const handler = withV1Errors(() => {
    throw createError({ statusCode: 400, statusMessage: 'startDate must be YYYY-MM-DD' })
  })
  const response = await request(handler, '/api/v1/costs/summary')
  assert.equal(response.status, 400)
  assert.equal(response.data.success, false)
  assert.deepEqual(response.data.error, { code: 'BAD_REQUEST', message: 'startDate must be YYYY-MM-DD' })
  assert.equal(response.data.metadata.requestID, 'req-123')
})

test('v1 scope failures are 403 envelopes', async () => {
  const alias = defineV1Alias('/api/v1/costs/scope-test', 'costs:read', 'Test', event => getQuery(event))
  const response = await request(alias, '/api/v1/costs/scope-test', { ...auth, scopes: ['accounts:read'] })
  assert.equal(response.status, 403)
  assert.equal(response.data.error.code, 'FORBIDDEN')
  assert.match(response.data.error.message, /costs:read/)
})

test('v1 server faults are logged and answered without internal detail', async () => {
  const handler = withV1Errors(() => {
    throw new Error('ECONNRESET talking to internal-host-01 with secret abc')
  })
  const response = await request(handler, '/api/v1/accounts')
  assert.equal(response.status, 500)
  assert.deepEqual(response.data.error, { code: 'INTERNAL_ERROR', message: 'Internal server error' })
})

test('legacy thrown envelopes keep their status and gain request metadata', async () => {
  const handler = withV1Errors(event => {
    event.node.res.statusCode = 404
    throw { success: false, error: { code: 'NOT_FOUND', message: 'Account not found' } }
  })
  const response = await request(handler, '/api/v1/accounts/x')
  assert.equal(response.status, 404)
  assert.equal(response.data.error.message, 'Account not found')
  assert.equal(response.data.metadata.requestID, 'req-123')
})

test('successful responses pass through untouched', async () => {
  const alias = defineV1Alias('/api/v1/costs/ok-test', 'costs:read', 'Test', () => ({ success: true, data: [1] }))
  const response = await request(alias, '/api/v1/costs/ok-test')
  assert.equal(response.status, 200)
  assert.deepEqual(response.data, { success: true, data: [1] })
})

test('person selectors do not match the same mailbox name on another domain', () => {
  assert.equal(personMatches('jane.doe@a.example', 'jane.doe@a.example'), true)
  assert.equal(personMatches('Jane.Doe@A.example', 'jane.doe@a.example'), true)
  assert.equal(personMatches('jane.doe@b.example', 'jane.doe@a.example'), false)
  assert.equal(personMatches('jane.doe@a.example', 'jane.doe'), true)
  assert.equal(personMatches('jane.doe', 'jane.doe@a.example'), true)
  assert.equal(personMatches('', 'jane.doe'), false)
})

test('account selectors are capped per request', async () => {
  const ids = Array.from({ length: 101 }, (_, i) => String(100000000000 + i)).join(',')
  await assert.rejects(
    resolveIntegrationAccountScope({ node: { res: {} } } as any, { accountIds: ids }),
    (error: any) => error.statusCode === 400 && /at most 100/.test(error.statusMessage)
  )
})
