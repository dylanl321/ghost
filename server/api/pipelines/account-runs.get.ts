import { sendPaginated, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getPipelineRunsForAccount, paginateResults } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-runs', 'GET', {
  summary: 'Get paginated pipeline runs for account',
  description: 'Returns a paginated list of pipeline runs for a specific account. Data is queried from Athena and may take 30-60 seconds to load.',
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
      name: 'page',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 1 },
      description: 'Page number for pagination (default: 1)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 25 },
      description: 'Number of items per page (default: 25)'
    }
  ],
  responses: {
    200: {
      description: 'Paginated pipeline runs',
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
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  hasMore: { type: 'boolean' }
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
  const daysParam = query.days ? parseInt(query.days as string, 10) : 7
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  const page = query.page ? parseInt(query.page as string, 10) : 1
  const limit = query.limit ? parseInt(query.limit as string, 10) : 25
  // Pipeline data is ALWAYS stored in GovCloud - ignore environment parameter
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching runs for account ${accountId} (${days} days, page ${page}, limit ${limit})`)

  try {
    const runs = await getPipelineRunsForAccount(accountId, days, environment)
    const paginated = paginateResults(runs, page, limit)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully fetched ${paginated.total} runs for account ${accountId} in ${metadata.responseTimeMs}ms (page ${page}/${Math.ceil(paginated.total / limit)})`)

    return sendPaginated(event, paginated.items, { page: paginated.page, limit: paginated.limit, total: paginated.total }, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch runs for account ${accountId}:`, error)
    return errors.serverError(event, `Failed to fetch pipeline runs: ${error.message || 'Unknown error'}`)
  }
}))
