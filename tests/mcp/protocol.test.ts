import assert from 'node:assert/strict'
import test from 'node:test'
import { McpServer } from '@modelcontextprotocol/server'
import * as z from 'zod-v4'
import { registerGhostTool } from '../../server/mcp/tools/register'
import type { GhostMcpPrincipal } from '../../server/mcp/types'

function principal(scopes: GhostMcpPrincipal['scopes']): GhostMcpPrincipal {
  const timestamp = new Date().toISOString()
  return {
    subject: 'tenant:user', oid: 'user', tenantId: 'tenant', email: 'user@example.test',
    displayName: 'Test User', groups: [], roles: ['viewer'], clientId: 'test-client', scopes,
    createdAt: timestamp, updatedAt: timestamp
  }
}

function listTools(scopes: GhostMcpPrincipal['scopes']) {
  const server = new McpServer({ name: 'ghost-test', version: '1.0.0' })
  const user = principal(scopes)
  registerGhostTool(server, user, {
    name: 'ghost.read.test', title: 'Read test', description: 'Read test', scope: 'ghost.read',
    inputSchema: z.object({}), annotations: { readOnlyHint: true },
    handler: () => ({ content: [{ type: 'text', text: 'read' }] })
  })
  registerGhostTool(server, user, {
    name: 'ghost.write.test', title: 'Write test', description: 'Write test', scope: 'ghost.collaborate',
    inputSchema: z.object({}), annotations: { readOnlyHint: false },
    handler: () => ({ content: [{ type: 'text', text: 'write' }] })
  })

  return Object.keys((server as any)._registeredTools)
}

test('tool discovery only returns OAuth-scope-eligible tools', () => {
  assert.deepEqual(listTools(['ghost.read']), ['ghost.read.test'])
  assert.deepEqual(listTools(['ghost.read', 'ghost.collaborate']), ['ghost.read.test', 'ghost.write.test'])
})
