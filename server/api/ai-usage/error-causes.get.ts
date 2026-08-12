import { defineEventHandler, getQuery } from 'h3'
import { registerEndpoint } from '../../plugins/swagger'
import { errors, handleAsync, sendSuccess } from '../../utils/api-response'
import { parseAIUsageQuery } from '../../utils/ai-usage-api'
import { queryAIUsageErrorCauses } from '../../utils/ai-usage-error-causes'

registerEndpoint('/api/ai-usage/error-causes', 'GET', {
  summary: 'Get AI Runtime error causes',
  description: 'Returns cached, sanitized Bedrock Runtime CloudTrail error causes for the active AI usage scope.',
  tags: ['AI Usage'],
  responses: {
    200: { description: 'Matched Runtime error causes and CloudWatch error totals' },
    400: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async event => {
  let input: ReturnType<typeof parseAIUsageQuery>
  try {
    input = parseAIUsageQuery(getQuery(event))
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  return sendSuccess(event, await queryAIUsageErrorCauses(input))
}))
