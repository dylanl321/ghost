import assert from 'node:assert/strict'
import test from 'node:test'
import { getMcpAuditTableConfig, getOAuthTableConfig } from '../../server/mcp/config'
import { checkMcpRateLimit, extractMcpToolNames } from '../../server/mcp/rate-limit'
import { decodeCursor, encodeCursor, normalizeLimit, toolError, toolSuccess } from '../../server/mcp/results'

test('MCP persistence targets the deployment account when configured', () => {
  const previousAccountId = process.env.AWS_DEPLOYMENT_ACCOUNT_ID
  process.env.AWS_DEPLOYMENT_ACCOUNT_ID = '461760157232'

  try {
    assert.equal(getOAuthTableConfig().accountId, '461760157232')
    assert.equal(getMcpAuditTableConfig().accountId, '461760157232')
  } finally {
    if (previousAccountId === undefined) delete process.env.AWS_DEPLOYMENT_ACCOUNT_ID
    else process.env.AWS_DEPLOYMENT_ACCOUNT_ID = previousAccountId
  }
})

test('MCP pagination cursors round-trip structured values', () => {
  const value = { offset: 25, account: '123456789012' }
  assert.deepEqual(decodeCursor(encodeCursor(value)), value)
  assert.throws(() => decodeCursor('not-a-cursor'), /Invalid pagination cursor/)
})

test('MCP result limits are bounded', () => {
  assert.equal(normalizeLimit(undefined), 25)
  assert.equal(normalizeLimit(0), 1)
  assert.equal(normalizeLimit(250), 100)
  assert.equal(normalizeLimit(40.9), 40)
})

test('MCP tool results include structured content and explicit errors', () => {
  const success = toolSuccess({ total: 12 }, 'Loaded.', 'test')
  assert.equal(success.isError, false)
  assert.deepEqual(success.content, [{ type: 'text', text: 'Loaded.' }])
  assert.deepEqual((success.structuredContent as any).data, { total: 12 })

  const failure = toolError('TEST_ERROR', 'Nope')
  assert.equal(failure.isError, true)
  assert.equal((failure.structuredContent as any).error.code, 'TEST_ERROR')
})

test('MCP rate limiting returns a stable retry window', async () => {
  const key = `test-${Date.now()}-${Math.random()}`
  assert.equal((await checkMcpRateLimit(key, 2, 60)).allowed, true)
  assert.equal((await checkMcpRateLimit(key, 2, 60)).allowed, true)
  const denied = await checkMcpRateLimit(key, 2, 60)
  assert.equal(denied.allowed, false)
  assert.ok(denied.retryAfterSeconds > 0)
})

test('MCP rate limiting derives tool names from JSON-RPC envelopes', () => {
  assert.deepEqual(extractMcpToolNames({ method: 'tools/call', params: { name: 'ghost.ai.insight' } }), ['ghost.ai.insight'])
  assert.deepEqual(extractMcpToolNames([{ method: 'tools/list' }, { method: 'tools/call', params: { name: 'ghost.reports.start_export' } }]), ['ghost.reports.start_export'])
})
