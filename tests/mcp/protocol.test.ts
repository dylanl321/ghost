import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import test from 'node:test'
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server'
import * as z from 'zod-v4'
import { registerGhostTool } from '../../server/mcp/tools/register'
import type { GhostMcpPrincipal } from '../../server/mcp/types'

if (!globalThis.crypto) Object.defineProperty(globalThis, 'crypto', { value: webcrypto })

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
  registerGhostTool(server, user, {
    name: 'ghost.credentials.test', title: 'Credential test', description: 'Credential test', scope: 'ghost.credentials.issue',
    inputSchema: z.object({}), annotations: { readOnlyHint: false },
    handler: () => ({ content: [{ type: 'text', text: 'credential' }] })
  })

  return Object.keys((server as any)._registeredTools)
}

test('tool discovery only returns OAuth-scope-eligible tools', () => {
  assert.deepEqual(listTools(['ghost.read']), ['ghost.read.test'])
  assert.deepEqual(listTools(['ghost.read', 'ghost.collaborate']), ['ghost.read.test', 'ghost.write.test'])
  assert.deepEqual(listTools(['ghost.read', 'ghost.credentials.issue']), ['ghost.read.test', 'ghost.credentials.test'])
})

test('HTTP handler negotiates the protocol version used by Codex', async () => {
  const handler = createMcpHandler(async () => new McpServer({ name: 'ghost-test', version: '1.0.0' }), {
    legacy: 'stateless'
  })
  const response = await handler.fetch(new Request('https://ghost.example.test/mcp', {
    method: 'POST',
    headers: {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'codex-test', version: '0.147.0' }
      }
    })
  }))

  assert.equal(response.status, 200)
  const responseText = await response.text()
  const dataLine = responseText.split('\n').find(line => line.startsWith('data: '))
  assert.ok(dataLine)
  const body = JSON.parse(dataLine.slice(6)) as { result?: { protocolVersion?: string } }
  assert.equal(body.result?.protocolVersion, '2025-06-18')
})
