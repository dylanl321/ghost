import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getCrossAccountErrorComparison } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/error-cross-account', 'GET', {
  summary: 'Check if an error pattern appears across accounts',
  description: 'Given an error category and message pattern, returns which accounts have experienced the same error and how frequently.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'error_category',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Error category to search for (e.g. provider_error, state_error)'
    },
    {
      name: 'error_message',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Error message pattern to search for (partial match, case insensitive)'
    },
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 30 },
      description: 'Number of days to look back (default: 30, max: 90)'
    }
  ],
  responses: {
    200: {
      description: 'Cross-account error comparison results',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    account_id: { type: 'string' },
                    occurrence_count: { type: 'number' },
                    last_seen: { type: 'string' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  errorCategory: { type: 'string' },
                  errorMessage: { type: 'string' },
                  days: { type: 'number' },
                  affectedAccounts: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    400: { $ref: '#/components/schemas/Error' },
    500: { $ref: '#/components/schemas/Error' }
  }
})

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)

  // Validate required parameters
  const errorCategory = query.error_category as string
  const errorMessage = query.error_message as string
  if (!errorCategory || !errorMessage) {
    throw createError({
      statusCode: 400,
      statusMessage: 'error_category and error_message parameters are required'
    })
  }

  // Parse optional parameters
  const daysParam = query.days ? parseInt(query.days as string, 10) : 30
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching cross-account error comparison for category="${errorCategory}", message="${errorMessage}" (${days} days)`)

  try {
    const results = await getCrossAccountErrorComparison(errorCategory, errorMessage, days, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      errorCategory,
      errorMessage,
      days,
      environment,
      affectedAccounts: results.length
    }

    logger.info(`[Pipelines API] Successfully found error pattern in ${results.length} accounts in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, results, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch cross-account error comparison:`, error)
    return errors.serverError(event, `Failed to fetch cross-account error data: ${error.message || 'Unknown error'}`)
  }
}))
