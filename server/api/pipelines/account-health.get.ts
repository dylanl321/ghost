import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getAccountDeploymentHealthData } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-health', 'GET', {
  summary: 'Get deployment health score for an account',
  description: 'Returns a composite deployment health score and underlying metrics for an account, including pipeline success rate, recurring errors, and unapplied resource counts.',
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
      schema: { type: 'number', default: 30 },
      description: 'Number of days to look back (default: 30, max: 90)'
    }
  ],
  responses: {
    200: {
      description: 'Account deployment health data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                description: 'Composite health score and underlying metrics',
                properties: {
                  healthScore: { type: 'number', description: 'Composite health score (0-100)' },
                  latestPipelineStatus: { type: 'string', description: 'Status of the most recent pipeline run' },
                  planSuccessRate: { type: 'number', description: 'Percentage of plans that were successfully applied' },
                  recurringErrorCount: { type: 'number', description: 'Number of distinct recurring error patterns' },
                  unappliedResourceCount: { type: 'number', description: 'Number of resources pending application' }
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
  const daysParam = query.days ? parseInt(query.days as string, 10) : 30
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching deployment health for account ${accountId} (${days} days)`)

  try {
    const healthData = await getAccountDeploymentHealthData(accountId, days, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully fetched deployment health for account ${accountId} (score: ${healthData.healthScore}) in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, healthData, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch deployment health for account ${accountId}:`, error)
    return errors.serverError(event, `Failed to fetch account health data: ${error.message || 'Unknown error'}`)
  }
}))
