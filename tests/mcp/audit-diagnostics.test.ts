import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_SITE_CONFIG } from '../../shared/types/site-config'
import {
  extractMcpFailure,
  normalizeMcpClient,
  prepareMcpDiagnosticFailure,
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
  groups: ['Sensitive.Directory.Group'],
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

test('tool failure diagnostics retain structure but deny sensitive values', () => {
  const diagnostic = prepareMcpDiagnosticFailure({
    environment: 'govcloud',
    limit: 25,
    session_id: '09c2cc58-f8ea-4c98-a910-4e34b2d47555',
    message: 'private prompt text',
    report_config: { datasets: { config: true } }
  }, new Error('token=secret failed'), ['environment', 'limit', 'session_id'])
  const serialized = JSON.stringify(diagnostic)
  assert.equal((diagnostic.arguments as any).environment, 'govcloud')
  assert.equal((diagnostic.arguments as any).limit, 25)
  assert.equal(serialized.includes('private prompt text'), false)
  assert.equal(serialized.includes('09c2cc58'), false)
  assert.equal(serialized.includes('token=secret'), false)
})

test('MCP client attribution normalizes supported surfaces without model inference', () => {
  assert.equal(normalizeMcpClient({ mcpClientName: 'Codex Desktop' }), 'codex_desktop')
  assert.equal(normalizeMcpClient({ mcpClientName: 'Codex', userAgent: 'codex-cli/0.2' }), 'codex_cli')
  assert.equal(normalizeMcpClient({ oauthClientName: 'Codex', userAgent: 'codex-mcp-client/0.148.0-alpha.9' }), 'codex_cli')
  assert.equal(normalizeMcpClient({ oauthClientName: 'Codex' }), 'codex_unknown')
  assert.equal(normalizeMcpClient({ mcpClientName: 'Claude Code' }), 'claude_code')
  assert.equal(normalizeMcpClient({ oauthClientName: 'ChatGPT' }), 'chatgpt')
  assert.equal(normalizeMcpClient({ userAgent: 'custom-mcp/1.0' }), 'other')
  assert.equal(normalizeMcpClient({}), 'unknown')
})

test('raw MCP errors exclude directory and profile identity data', () => {
  const record = prepareRawMcpErrorRecord({
    eventId: 'event-2',
    timestamp: '2026-08-14T12:00:00.000Z',
    tool: 'ghost.test',
    principal,
    client: { clientType: 'codex_cli' },
    errorCode: 'TOOL_ERROR',
    rawFailure: { args: { account: '123456789012' } }
  })
  const raw = JSON.parse(record.rawJson)

  assert.deepEqual(raw.principal, {
    subject: principal.subject,
    clientId: principal.clientId,
    scopes: principal.scopes
  })
  assert.equal(record.rawJson.includes('Sensitive.Directory.Group'), false)
  assert.equal(record.rawJson.includes(principal.email), false)
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
