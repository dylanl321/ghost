import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { loadMcpAuditEvents, summarizeMcpUsage } from '../../../mcp/usage'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const days = Math.min(Math.max(Number(getQuery(event).days || 30), 1), 90)
  const events = await loadMcpAuditEvents(days)
  const recentActivity = [...events]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 50)
    .map(item => ({
      timestamp: item.timestamp,
      tool: item.tool,
      status: item.status,
      durationMs: item.durationMs,
      environment: item.environment || 'unknown',
      interactionType: item.interactionType || 'unknown',
      errorCategory: item.errorCategory,
      warningCount: item.warningCount || 0,
      fallback: Boolean(item.fallback)
    }))
  return { success: true, data: { days, ...summarizeMcpUsage(events), recentActivity } }
})
