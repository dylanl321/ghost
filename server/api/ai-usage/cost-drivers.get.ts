import { defineEventHandler, getQuery } from 'h3'
import { registerEndpoint } from '../../plugins/swagger'
import { errors, handleAsync, sendSuccess } from '../../utils/api-response'
import { parseAIUsageQuery } from '../../utils/ai-usage-api'
import { queryAIUsageCostDrivers } from '../../utils/ai-usage-cost-drivers'

registerEndpoint('/api/ai-usage/cost-drivers', 'GET', {
  summary: 'Get AI service cost drivers',
  description: 'Returns cached Cost Explorer usage type, operation, and supported resource drivers for an AI service.',
  tags: ['AI Usage'],
  responses: {
    200: { description: 'Cost driver breakdown' },
    400: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async event => {
  const query = getQuery(event)
  const service = String(query.service || '').trim()
  if (!service) return errors.badRequest(event, 'service is required')
  let input: ReturnType<typeof parseAIUsageQuery>
  try {
    input = parseAIUsageQuery(query)
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  return sendSuccess(event, await queryAIUsageCostDrivers(input, service))
}))
