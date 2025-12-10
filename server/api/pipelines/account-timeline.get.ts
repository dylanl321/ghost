import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getPipelineRunsForAccount } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-timeline', 'GET', {
  summary: 'Get pipeline execution timeline for account',
  description: 'Returns detailed list of pipeline runs for an account with pagination support. Includes timing, status, and basic metadata.',
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
      description: 'Pipeline timeline data',
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
                    pipeline_id: { type: 'string' },
                    job_id: { type: 'string' },
                    job_name: { type: 'string' },
                    job_url: { type: 'string' },
                    job_stage: { type: 'string' },
                    timestamp_start: { type: 'string' },
                    timestamp_end: { type: 'string' },
                    duration_total_seconds: { type: 'number' },
                    status: { type: 'string' },
                    account_count: { type: 'number' },
                    accounts_processed: { type: 'array', items: { type: 'string' } },
                    commit_author: { type: 'string' },
                    terraform_version: { type: 'string' }
                  }
                }
              },
              metadata: {
                type: 'object',
                properties: {
                  responseTimeMs: { type: 'number' },
                  accountId: { type: 'string' },
                  days: { type: 'number' },
                  count: { type: 'number' }
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
  const daysParam = query.days ? parseInt(query.days as string, 10) : 7
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  // Pipeline data is ALWAYS stored in GovCloud - ignore environment parameter
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching timeline for account ${accountId} (${days} days, ${environment})`)

  try {
    const runs = await getPipelineRunsForAccount(accountId, days, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment,
      count: runs.length
    }

    logger.info(`[Pipelines API] Successfully fetched ${runs.length} pipeline runs for account ${accountId} in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, runs, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch timeline for account ${accountId}:`, error)
    return errors.serverError(event, `Failed to fetch pipeline timeline: ${error.message || 'Unknown error'}`)
  }
}))
