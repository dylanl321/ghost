import { defineEventHandler, getQuery, setResponseHeaders } from 'h3'
import { registerEndpoint } from '../../plugins/swagger'
import { errors, handleAsync } from '../../utils/api-response'
import { parseAIUsageQuery } from '../../utils/ai-usage-api'
import { queryAIUsage } from '../../utils/ai-usage-query'

registerEndpoint('/api/ai-usage/export', 'GET', {
  summary: 'Export AI usage breakdown as CSV',
  description: 'Exports the current filtered and grouped AI usage view.',
  tags: ['AI Usage'],
  responses: { 200: { description: 'CSV export' }, 400: { $ref: '#/components/schemas/Error' } }
})

function csv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export default defineEventHandler(handleAsync(async event => {
  let input: ReturnType<typeof parseAIUsageQuery>
  try {
    input = parseAIUsageQuery(getQuery(event))
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  const overview = await queryAIUsage(input)
  const headers = [
    'Group', 'Label', 'Environment', 'Account', 'Provider', 'Service', 'Project', 'Model', 'Region',
    'Invocations', 'Input Tokens', 'Output Tokens', 'Client Errors', 'Server Errors', 'Throttles',
    'Actual Cost USD', 'Estimated Unbilled Cost USD', 'Estimate Coverage Percent', 'Last Seen'
  ]
  const rows = overview.breakdown.map(row => [
    row.key, row.label, row.environment, row.accountId, row.provider, row.service, row.projectId, row.modelId, row.region,
    row.metrics.invocations, row.metrics.inputTokens, row.metrics.outputTokens, row.metrics.clientErrors,
    row.metrics.serverErrors, row.metrics.throttles, row.cost.actual.toFixed(6), row.cost.estimated.toFixed(6),
    row.cost.estimateCoveragePercent?.toFixed(2), row.lastSeen
  ])
  const content = [headers, ...rows].map(row => row.map(csv).join(',')).join('\n')
  setResponseHeaders(event, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="ai-usage-${overview.filters.startDate}-${overview.filters.endDate}.csv"`
  })
  return content
}))
