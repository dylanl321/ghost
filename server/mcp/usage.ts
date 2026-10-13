import { putItem, scanItems } from '../utils/dynamodb'
import { getMcpAuditTableConfig, getMcpUsageDailyTableConfig } from './config'
import type { GhostMcpAuditEvent } from './types'

export interface McpUsageBreakdownRow {
  key: string
  label: string
  detail?: string
  count: number
  successRate: number
  errorCount: number
  topTools: Array<{ tool: string; count: number }>
  lastActivity?: string
}

export interface McpUsageSummary {
  total: number
  uniqueUsers: number
  uniqueClients: number
  successRate: number
  averageLatencyMs: number
  fallbackCount: number
  byTool: Array<{
    tool: string
    count: number
    successRate: number
    averageLatencyMs: number
    errorCount: number
    fallbackCount: number
    lastUsedAt?: string
  }>
  byStatus: Record<string, number>
  byEnvironment: Record<string, number>
  byTeam: Record<string, number>
  byInteractionType: Record<string, number>
  byErrorCategory: Record<string, number>
  byUser: McpUsageBreakdownRow[]
  byClient: McpUsageBreakdownRow[]
  bySource: McpUsageBreakdownRow[]
  byDay: Array<{ date: string; count: number; successRate: number; averageLatencyMs: number }>
}

export async function loadMcpAuditEvents(days = 30): Promise<GhostMcpAuditEvent[]> {
  const config = getMcpAuditTableConfig()
  const result = await scanItems(config.tableName, undefined, undefined, undefined, config.environment, undefined, undefined, config.accountId)
  const cutoff = Date.now() - days * 86_400_000
  return (result.items as GhostMcpAuditEvent[]).filter(event => Date.parse(event.timestamp) >= cutoff)
}

export function summarizeMcpUsage(events: GhostMcpAuditEvent[]): McpUsageSummary {
  const successful = events.filter(event => event.status === 'success').length
  const byTool = new Map<string, GhostMcpAuditEvent[]>()
  const byDay = new Map<string, GhostMcpAuditEvent[]>()
  const byStatus: Record<string, number> = {}
  const byEnvironment: Record<string, number> = {}
  const byTeam: Record<string, number> = {}
  const byInteractionType: Record<string, number> = {}
  const byErrorCategory: Record<string, number> = {}
  for (const event of events) {
    const toolEvents = byTool.get(event.tool) || []
    toolEvents.push(event)
    byTool.set(event.tool, toolEvents)
    const date = event.eventDate || event.timestamp.slice(0, 10)
    const dayEvents = byDay.get(date) || []
    dayEvents.push(event)
    byDay.set(date, dayEvents)
    byStatus[event.status] = (byStatus[event.status] || 0) + 1
    byEnvironment[event.environment || 'unknown'] = (byEnvironment[event.environment || 'unknown'] || 0) + 1
    for (const team of event.teamKeys?.length ? event.teamKeys : ['unassigned']) byTeam[team] = (byTeam[team] || 0) + 1
    byInteractionType[event.interactionType || 'unknown'] = (byInteractionType[event.interactionType || 'unknown'] || 0) + 1
    if (event.errorCategory) byErrorCategory[event.errorCategory] = (byErrorCategory[event.errorCategory] || 0) + 1
  }
  return {
    total: events.length,
    uniqueUsers: new Set(events.map(event => event.subject)).size,
    uniqueClients: new Set(events.map(event => event.clientId)).size,
    successRate: events.length ? successful / events.length : 0,
    averageLatencyMs: events.length ? Math.round(events.reduce((sum, event) => sum + event.durationMs, 0) / events.length) : 0,
    fallbackCount: events.filter(event => event.fallback).length,
    byTool: Array.from(byTool, ([tool, values]) => ({
      tool,
      count: values.length,
      successRate: values.filter(value => value.status === 'success').length / values.length,
      averageLatencyMs: Math.round(values.reduce((sum, value) => sum + value.durationMs, 0) / values.length),
      errorCount: values.filter(value => value.status === 'error' || value.status === 'denied').length,
      fallbackCount: values.filter(value => value.fallback).length,
      lastUsedAt: values.map(value => value.timestamp).sort().at(-1)
    })).sort((left, right) => right.count - left.count),
    byStatus,
    byEnvironment,
    byTeam,
    byInteractionType,
    byErrorCategory,
    byUser: buildBreakdown(events, event => ({
      key: event.subject || 'unknown',
      label: event.displayName || event.email || 'Unknown user',
      detail: event.email || undefined
    })),
    byClient: buildBreakdown(events, event => ({
      key: event.client?.clientType || 'unknown',
      label: clientTypeLabel(event.client?.clientType),
      detail: event.client?.mcpClientName || event.client?.oauthClientName || event.clientId || undefined
    })),
    bySource: buildBreakdown(events, event => ({
      key: event.source || 'unknown',
      label: event.source || 'Unknown source'
    })),
    byDay: Array.from(byDay, ([date, values]) => ({
      date,
      count: values.length,
      successRate: values.filter(value => value.status === 'success').length / values.length,
      averageLatencyMs: Math.round(values.reduce((sum, value) => sum + value.durationMs, 0) / values.length)
    })).sort((left, right) => left.date.localeCompare(right.date))
  }
}

function buildBreakdown(
  events: GhostMcpAuditEvent[],
  identify: (event: GhostMcpAuditEvent) => { key: string; label: string; detail?: string }
): McpUsageBreakdownRow[] {
  const groups = new Map<string, { identity: ReturnType<typeof identify>; events: GhostMcpAuditEvent[] }>()
  for (const event of events) {
    const identity = identify(event)
    const existing = groups.get(identity.key)
    if (existing) {
      existing.events.push(event)
      if ((!existing.identity.detail || existing.identity.detail === event.clientId) && identity.detail) existing.identity = identity
    } else groups.set(identity.key, { identity, events: [event] })
  }
  return Array.from(groups.values(), ({ identity, events: values }) => {
    const tools = new Map<string, number>()
    for (const event of values) tools.set(event.tool, (tools.get(event.tool) || 0) + 1)
    const successCount = values.filter(event => event.status === 'success').length
    return {
      ...identity,
      count: values.length,
      successRate: values.length ? successCount / values.length : 0,
      errorCount: values.filter(event => event.status === 'error' || event.status === 'denied').length,
      topTools: Array.from(tools, ([tool, count]) => ({ tool, count })).sort((left, right) => right.count - left.count).slice(0, 3),
      lastActivity: values.map(event => event.timestamp).sort().at(-1)
    }
  }).sort((left, right) => right.count - left.count)
}

function clientTypeLabel(value?: string): string {
  return ({
    codex_desktop: 'Codex Desktop',
    codex_cli: 'Codex CLI',
    codex_unknown: 'Codex surface unknown',
    claude_code: 'Claude Code',
    chatgpt: 'ChatGPT',
    other: 'Other',
    unknown: 'Unknown'
  } as Record<string, string>)[value || 'unknown'] || 'Unknown'
}

export async function writeMcpDailyUsageAggregate(date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)) {
  const events = (await loadMcpAuditEvents(3)).filter(event => event.eventDate === date)
  const summary = summarizeMcpUsage(events)
  const config = getMcpUsageDailyTableConfig()
  await putItem(config.tableName, {
    pk: `DATE#${date}`,
    sk: 'ORG',
    date,
    ...summary,
    generatedAt: new Date().toISOString(),
    ttl: Math.floor(Date.now() / 1000) + 395 * 24 * 60 * 60
  }, config.environment, config.accountId)
  return summary
}
