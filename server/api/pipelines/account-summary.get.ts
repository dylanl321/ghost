import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getPipelineSummary, getDailyPipelineMetrics, clampIntParam } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-summary', 'GET', {
  summary: 'Get pipeline execution summary for account',
  description: 'Returns aggregated pipeline data including run statistics, resource changes, errors, and daily metrics. Data is queried from Athena and may take 30-60 seconds to load.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'account_id',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'AWS Account ID (12-digit number)'
    },
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 7 },
      description: 'Number of days to look back (default: 7, max: 90)'
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['commercial', 'govcloud'], default: 'commercial' },
      description: 'AWS environment'
    }
  ],
  responses: {
    200: {
      description: 'Pipeline summary data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'object',
                    properties: {
                      totalRuns: { type: 'number', description: 'Total pipeline runs' },
                      successfulRuns: { type: 'number', description: 'Successful runs' },
                      failedRuns: { type: 'number', description: 'Failed runs' },
                      avgDurationSeconds: { type: 'number', description: 'Average run duration' },
                      totalChanges: { type: 'number', description: 'Total resource changes' },
                      resourceBreakdown: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            resourceType: { type: 'string' },
                            action: { type: 'string' },
                            count: { type: 'number' }
                          }
                        }
                      },
                      errorBreakdown: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            category: { type: 'string' },
                            count: { type: 'number' }
                          }
                        }
                      },
                      recentRuns: {
                        type: 'array',
                        description: 'Most recent 10 pipeline runs'
                      }
                    }
                  },
                  dailyMetrics: {
                    type: 'array',
                    description: 'Daily success/failure metrics for charting'
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  accountId: { type: 'string' },
                  days: { type: 'number' }
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
  const accountId = query.account_id as string
  if (!accountId) {
    throw createError({
      statusCode: 400,
      statusMessage: 'account_id parameter is required'
    })
  }

  // Parse optional parameters
  const days = clampIntParam(query.days, 7, 1, 90)
  // Pipeline data is ALWAYS stored in GovCloud - ignore environment parameter
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching summary for account ${accountId} (${days} days, ${environment})`)

  try {
    // Fetch summary and daily metrics in parallel
    const [summary, dailyMetrics] = await Promise.all([
      getPipelineSummary(accountId, days, environment),
      getDailyPipelineMetrics(accountId, days, environment)
    ])

    const data = {
      summary,
      dailyMetrics
    }

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully fetched summary for account ${accountId} in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, data, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch summary for account ${accountId}:`, error)

    // Return user-friendly error message
    return errors.serverError(event, `Failed to fetch pipeline data: ${error.message || 'Unknown error'}`)
  }
}))
