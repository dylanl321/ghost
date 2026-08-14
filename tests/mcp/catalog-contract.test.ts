import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { McpServer } from '@modelcontextprotocol/server'
import { endUserMcpToolNames } from '../../shared/mcp/end-user-capabilities'
import { registerCatalogTools } from '../../server/mcp/tools/catalog'
import type { GhostMcpPrincipal } from '../../server/mcp/types'

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })

function principal(scopes: GhostMcpPrincipal['scopes']): GhostMcpPrincipal {
  const timestamp = new Date().toISOString()
  return {
    subject: 'tenant:user',
    oid: 'user',
    tenantId: 'tenant',
    email: 'user@example.test',
    displayName: 'Test User',
    groups: [],
    roles: ['viewer'],
    clientId: 'test-client',
    scopes,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function registeredTools(scopes: GhostMcpPrincipal['scopes']): Set<string> {
  const server = new McpServer({ name: 'ghost-test', version: '1.0.0' })
  registerCatalogTools(server, principal(scopes), {} as any)
  return new Set(Object.keys((server as any)._registeredTools))
}

test('registers every tool in the end-user MCP coverage contract', () => {
  const registered = registeredTools(['ghost.read', 'ghost.ai.invoke', 'ghost.collaborate', 'ghost.credentials.issue'])
  for (const toolName of endUserMcpToolNames) {
    assert.equal(registered.has(toolName), true, `${toolName} must be registered`)
  }
})

test('keeps private account context and notifications behind the collaboration scope', () => {
  const readOnly = registeredTools(['ghost.read'])
  assert.equal(readOnly.has('ghost.costs.dashboard'), true)
  assert.equal(readOnly.has('ghost.accounts.personal_context'), false)
  assert.equal(readOnly.has('ghost.notifications.list'), false)

  const collaboration = registeredTools(['ghost.collaborate'])
  assert.equal(collaboration.has('ghost.accounts.personal_context'), true)
  assert.equal(collaboration.has('ghost.notifications.list'), true)
  assert.equal(collaboration.has('ghost.costs.dashboard'), false)
})
