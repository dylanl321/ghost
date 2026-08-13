import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { summarizeMcpUsage } from '../../server/mcp/usage'
import type { GhostMcpAuditEvent } from '../../server/mcp/types'

function event(overrides: Partial<GhostMcpAuditEvent>): GhostMcpAuditEvent {
  return {
    eventId: randomUUID(), timestamp: '2026-08-13T12:00:00.000Z', subject: 'user-1', email: 'user@example.test',
    clientId: 'codex', tool: 'ghost.accounts.search', scopes: ['ghost.read'], status: 'success', durationMs: 100,
    eventDate: '2026-08-13', environment: 'govcloud', interactionType: 'lookup', ttl: 1,
    ...overrides
  }
}

test('summarizes MCP adoption, reliability, and daily activity', () => {
  const summary = summarizeMcpUsage([
    event({}),
    event({ subject: 'user-2', tool: 'ghost.account.health', durationMs: 300, interactionType: 'analysis', fallback: true }),
    event({ timestamp: '2026-08-12T12:00:00.000Z', eventDate: '2026-08-12', status: 'error', durationMs: 200, errorCategory: 'validation' })
  ])

  assert.equal(summary.total, 3)
  assert.equal(summary.uniqueUsers, 2)
  assert.equal(summary.uniqueClients, 1)
  assert.equal(summary.successRate, 2 / 3)
  assert.equal(summary.averageLatencyMs, 200)
  assert.equal(summary.fallbackCount, 1)
  assert.deepEqual(summary.byStatus, { success: 2, error: 1 })
  assert.deepEqual(summary.byInteractionType, { lookup: 2, analysis: 1 })
  assert.deepEqual(summary.byErrorCategory, { validation: 1 })
  assert.deepEqual(summary.byDay.map(day => [day.date, day.count]), [['2026-08-12', 1], ['2026-08-13', 2]])
  assert.equal(summary.byTool[0]?.tool, 'ghost.accounts.search')
  assert.equal(summary.byTool[0]?.count, 2)
  assert.equal(summary.byTool[0]?.errorCount, 1)
})
