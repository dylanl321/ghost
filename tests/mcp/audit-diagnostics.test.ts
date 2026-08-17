import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SITE_CONFIG } from '../../shared/types/site-config'
import {
  extractMcpFailure,
  normalizeMcpClient,
  prepareRawMcpErrorRecord,
  sanitizeErrorExplanation
} from '../../server/mcp/audit'
import type { GhostMcpPrincipal } from '../../server/mcp/types'

const principal: GhostMcpPrincipal = {
  subject: 'tenant:user',
  oid: 'user',
  tenantId: 'tenant',
  email: 'user@example.test',
  displayName: 'Test User',
  groups: [],
  roles: ['viewer'],
  clientId: 'client-1',
  scopes: ['ghost.read'],
  createdAt: '2026-08-14T00:00:00.000Z',
  updatedAt: '2026-08-14T00:00:00.000Z'
}

test('returned MCP errors retain sanitized diagnostics', () => {
  const failure = extractMcpFailure({
    isError: true,
    structuredContent: { error: { code: 'UPSTREAM_TIMEOUT', message: 'token=abc123 request timed out', retryable: true } }
  })
  assert.deepEqual(failure, {
    code: 'UPSTREAM_TIMEOUT',
    explanation: 'token=[REDACTED] request timed out',
    retryable: true,
    category: 'transient'
  })
  assert.equal(sanitizeErrorExplanation('Bearer secret-value\nfailed'), 'Bearer [REDACTED] failed')

  const unavailable = extractMcpFailure({
    isError: true,
    structuredContent: { error: { code: 'HTTP_503', message: 'Service unavailable', retryable: true } }
  })
  assert.equal(unavailable?.category, 'transient')
  assert.equal(unavailable?.retryable, true)
})

test('MCP client attribution normalizes supported surfaces without model inference', () => {
  assert.equal(normalizeMcpClient({ mcpClientName: 'Codex Desktop' }), 'codex_desktop')
  assert.equal(normalizeMcpClient({ mcpClientName: 'Codex', userAgent: 'codex-cli/0.2' }), 'codex_cli')
  assert.equal(normalizeMcpClient({ oauthClientName: 'Codex' }), 'codex_unknown')
  assert.equal(normalizeMcpClient({ mcpClientName: 'Claude Code' }), 'claude_code')
  assert.equal(normalizeMcpClient({ oauthClientName: 'ChatGPT' }), 'chatgpt')
  assert.equal(normalizeMcpClient({ userAgent: 'custom-mcp/1.0' }), 'other')
  assert.equal(normalizeMcpClient({}), 'unknown')
})

test('raw MCP errors use a 30-day TTL and remain valid JSON when truncated', () => {
  const now = Date.parse('2026-08-14T12:00:00.000Z')
  const record = prepareRawMcpErrorRecord({
    eventId: 'event-1',
    timestamp: new Date(now).toISOString(),
    tool: 'ghost.test',
    principal,
    client: { clientType: 'unknown' },
    errorCode: 'TOOL_ERROR',
    rawFailure: { input: 'x'.repeat(500_000) }
  }, now)

  assert.equal(record.ttl, Math.floor(now / 1000) + 30 * 24 * 60 * 60)
  assert.equal(record.expiresAt, '2026-09-13T12:00:00.000Z')
  assert.equal(record.truncated, true)
  assert.ok(record.storedSizeBytes < 400_000)
  assert.equal(JSON.parse(record.rawJson).truncated, true)
})

test('raw MCP error capture is admin-controlled and enabled by default', () => {
  const setting = DEFAULT_SITE_CONFIG.find(item => item.key === 'mcp.audit.rawErrors.enabled')
  assert.equal(setting?.value, true)
  assert.equal(setting?.isPublic, false)
  assert.equal(setting?.isEditable, true)
})
