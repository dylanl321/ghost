import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getOrganizationSummary, getOrganizationDailyMetrics, getAccountBreakdown, getOrganizationResourceBreakdown, getOrganizationErrorBreakdown, clampIntParam } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/global-summary', 'GET', {
  summary: 'Get organization-wide pipeline analytics',
  description: 'Returns aggregated pipeline data across all accounts including metrics, breakdowns, and trends. Data is queried from Athena and may take 30-60 seconds to load initially. Admin-only access recommended but API is open.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 30, minimum: 1, maximum: 90 },
      description: 'Number of days to look back (default: 30, max: 90)'
    }
  ],
  responses: {
    200: {
      description: 'Organization-wide pipeline analytics',
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
                      totalRuns: { type: 'number', description: 'Total pipeline runs across all accounts' },
                      successfulRuns: { type: 'number', description: 'Successful runs' },
                      failedRuns: { type: 'number', description: 'Failed runs' },
                      successRate: { type: 'number', description: 'Success rate percentage' },
                      avgDuration: { type: 'number', description: 'Average run duration in seconds' },
                      uniqueAccounts: { type: 'number', description: 'Number of accounts with activity' },
                      totalChanges: { type: 'number', description: 'Total resource changes' }
                    }
                  },
                  dailyMetrics: {
                    type: 'array',
                    description: 'Daily pipeline metrics for trend analysis',
                    items: {
                      type: 'object',
                      properties: {
                        date: { type: 'string' },
                        total: { type: 'number' },
                        successful: { type: 'number' },
                        failed: { type: 'number' }
                      }
                    }
                  },
                  accountBreakdown: {
                    type: 'array',
                    description: 'Top accounts by pipeline activity'
                  },
                  resourceBreakdown: {
                    type: 'array',
                    description: 'Resource changes by type and action'
                  },
                  errorBreakdown: {
                    type: 'array',
                    description: 'Error distribution by category'
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
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

  // Parse optional parameters
  const days = clampIntParam(query.days, 30, 1, 90)

  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching global summary (${days} days, ${environment})`)

  try {
    // Fetch all data in parallel for better performance
    const [summary, dailyMetrics, accountBreakdown, resourceBreakdown, errorBreakdown] = await Promise.all([
      getOrganizationSummary(days, environment),
      getOrganizationDailyMetrics(days, environment),
      getAccountBreakdown(days, environment),
      getOrganizationResourceBreakdown(days, environment),
      getOrganizationErrorBreakdown(days, environment)
    ])

    const data = {
      summary,
      dailyMetrics,
      accountBreakdown,
      resourceBreakdown,
      errorBreakdown
    }

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully fetched global summary in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, data, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch global summary:`, error)
    return errors.serverError(event, `Failed to fetch pipeline analytics: ${error.message || 'Unknown error'}`)
  }
}))
