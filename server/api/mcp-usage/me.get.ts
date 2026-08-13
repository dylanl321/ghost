import { getQuery } from 'h3'
import { errors } from '../../utils/api-response'
import { getUserEmail } from '../../utils/user-roles'
import { loadMcpAuditEvents, summarizeMcpUsage } from '../../mcp/usage'

export default defineEventHandler(async event => {
  if (!event.context.auth?.isAuthenticated) return errors.unauthorized(event, 'Authentication required')
  const email = getUserEmail(event)
  if (!email) return errors.unauthorized(event, 'User email not available')
  const days = Math.min(Math.max(Number(getQuery(event).days || 30), 1), 90)
  const events = (await loadMcpAuditEvents(days)).filter(item => item.email === email)
  return { success: true, data: { days, summary: summarizeMcpUsage(events), history: events.map(item => ({ timestamp: item.timestamp, tool: item.tool, status: item.status, durationMs: item.durationMs, environment: item.environment, source: item.source, resultCount: item.resultCount, warningCount: item.warningCount, errorCategory: item.errorCategory })) } }
})
