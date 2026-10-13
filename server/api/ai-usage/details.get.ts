import { defineEventHandler, getQuery } from 'h3'
import { registerEndpoint } from '../../plugins/swagger'
import { errors, handleAsync, sendSuccess } from '../../utils/api-response'
import { parseAIUsageQuery } from '../../utils/ai-usage-api'
import { queryAIUsage } from '../../utils/ai-usage-query'

registerEndpoint('/api/ai-usage/details', 'GET', {
  summary: 'Get paginated AI usage breakdown',
  description: 'Returns the selected AI usage grouping with pagination.',
  tags: ['AI Usage'],
  responses: {
    200: { description: 'Paginated AI usage details' },
    400: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async event => {
  const query = getQuery(event)
  let input: ReturnType<typeof parseAIUsageQuery>
  try {
    input = parseAIUsageQuery(query)
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  const page = Math.max(1, Number.parseInt(String(query.page || '1'), 10) || 1)
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(query.limit || '50'), 10) || 50))
  const overview = await queryAIUsage(input)
  const start = (page - 1) * limit
  return sendSuccess(event, {
    items: overview.breakdown.slice(start, start + limit),
    pagination: {
      page,
      limit,
      total: overview.breakdown.length,
      hasMore: start + limit < overview.breakdown.length
    },
    dataQuality: overview.dataQuality
  })
}))
