import { defineEventHandler, getQuery } from 'h3'
import { registerEndpoint } from '../../plugins/swagger'
import { errors, handleAsync, sendSuccess } from '../../utils/api-response'
import { parseAIUsageQuery } from '../../utils/ai-usage-api'
import { queryAIUsage } from '../../utils/ai-usage-query'

registerEndpoint('/api/ai-usage/overview', 'GET', {
  summary: 'Get organization AI usage overview',
  description: 'Adoption, token, invocation, and cost metrics across Commercial and GovCloud account scopes.',
  tags: ['AI Usage'],
  responses: {
    200: { description: 'AI usage overview' },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async event => {
  let input: ReturnType<typeof parseAIUsageQuery>
  try {
    input = parseAIUsageQuery(getQuery(event))
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  const data = await queryAIUsage(input)
  return sendSuccess(event, data)
}))
