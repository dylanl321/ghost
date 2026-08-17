import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { McpServer } from '@modelcontextprotocol/server'
import { endUserMcpCapabilityGroups, endUserMcpToolNames } from '../../shared/mcp/end-user-capabilities'
import { ghostMcpCatalog, ghostMcpToolNames } from '../../shared/mcp/catalog'
import { registerCatalogTools } from '../../server/mcp/tools/catalog'
import { createGhostMcpServer } from '../../server/mcp/server'
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
  assert.deepEqual([...registered].sort(), [...ghostMcpToolNames].sort())
  assert.equal(registered.size, 62)
  assert.deepEqual([...endUserMcpToolNames].sort(), ghostMcpCatalog.filter(tool => tool.visibility === 'advertised').map(tool => tool.name).sort())
  assert.deepEqual(endUserMcpCapabilityGroups.flatMap(group => group.tools.map(tool => tool.name)).sort(), [...endUserMcpToolNames].sort())
  assert.equal(ghostMcpCatalog.every(tool => Boolean(tool.scope && tool.domain && tool.source && tool.annotations)), true)
})

test('removed compatibility and synchronous report tools are absent', () => {
  const registered = registeredTools(['ghost.read', 'ghost.ai.invoke', 'ghost.collaborate', 'ghost.credentials.issue'])
  for (const name of ['ghost.forecasts.get', 'ghost.support.search', 'ghost.instances.get', 'ghost.audit.cloudtrail', 'ghost.pipelines.for_account', 'ghost.pipelines.search_resources', 'ghost.reports.run']) {
    assert.equal(registered.has(name), false, `${name} must be removed`)
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

test('MCP resources and prompts follow OAuth scope boundaries', async () => {
  const serverFor = async (scopes: GhostMcpPrincipal['scopes']) => {
    const user = principal(scopes)
    return createGhostMcpServer({ authInfo: { token: 'test', clientId: user.clientId, scopes, extra: { principal: user } } } as any)
  }
  const read = await serverFor(['ghost.read']) as any
  assert.deepEqual(Object.keys(read._registeredResources).sort(), ['ghost://catalog', 'ghost://context/environment'])
  assert.deepEqual(Object.keys(read._registeredResourceTemplates), ['ghost-account'])
  assert.equal(Object.keys(read._registeredPrompts).length, 5)

  const collaborate = await serverFor(['ghost.collaborate']) as any
  assert.deepEqual(Object.keys(collaborate._registeredResources).sort(), ['ghost://catalog', 'ghost://context/environment', 'ghost://users/me'])
  assert.deepEqual(Object.keys(collaborate._registeredResourceTemplates), ['ghost-export'])
  assert.equal(Object.keys(collaborate._registeredPrompts).length, 0)
})
