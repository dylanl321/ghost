import { getQuery } from 'h3'
import { requireAdmin } from '../../../utils/user-roles'
import { loadMcpAuditEvents, summarizeMcpUsage } from '../../../mcp/usage'

export default defineEventHandler(async event => {
  await requireAdmin(event)
  const days = Math.min(Math.max(Number(getQuery(event).days || 30), 1), 90)
  const summary = summarizeMcpUsage(await loadMcpAuditEvents(days))
  return { success: true, data: { days, teams: summary.byTeam } }
})
