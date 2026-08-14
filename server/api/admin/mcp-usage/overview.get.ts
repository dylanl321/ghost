import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { loadMcpAuditEvents, summarizeMcpUsage } from '../../../mcp/usage'
import { getConfigValue } from '../../../utils/site-config'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const days = Math.min(Math.max(Number(getQuery(event).days || 30), 1), 90)
  const events = await loadMcpAuditEvents(days)
  const recentActivity = [...events]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp))
    .slice(0, 50)
    .map(item => ({
      timestamp: item.timestamp,
      eventId: item.eventId,
      user: item.displayName || item.email || 'Unknown user',
      email: item.email,
      client: item.client?.clientType || 'unknown',
      clientName: item.client?.mcpClientName || item.client?.oauthClientName,
      tool: item.tool,
      status: item.status,
      durationMs: item.durationMs,
      environment: item.environment || 'unknown',
      interactionType: item.interactionType || 'unknown',
      errorCategory: item.errorCategory,
      errorCode: item.errorCode,
      errorExplanation: item.errorExplanation,
      source: item.source || 'unknown',
      rawErrorCaptured: Boolean(item.rawErrorCaptured),
      warningCount: item.warningCount || 0,
      fallback: Boolean(item.fallback)
    }))
  const rawErrorsEnabled = await getConfigValue<boolean>('mcp.audit.rawErrors.enabled')
  return { success: true, data: { days, rawErrorsEnabled: rawErrorsEnabled !== false, ...summarizeMcpUsage(events), recentActivity } }
})
