import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { requirePermission } from '../../utils/user-roles'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getOrganizationTimeline, clampIntParam } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/global-timeline', 'GET', {
  summary: 'Get organization-wide pipeline timeline',
  description: 'Returns recent pipeline runs across all accounts with pagination support. Includes timing, status, and basic metadata. Data is queried from Athena and cached for 5 minutes.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 30, minimum: 1, maximum: 90 },
      description: 'Number of days to look back (default: 30, max: 90)'
    },
    {
      name: 'limit',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 200, minimum: 10, maximum: 500 },
      description: 'Maximum number of runs to return (default: 200, max: 500)'
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
                    job_url: { type: 'string', description: 'GitLab job URL' },
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
                  days: { type: 'number' },
                  limit: { type: 'number' },
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
  await requirePermission(event, 'admin.logs')

  const startTime = Date.now()
  const query = getQuery(event)

  // Parse optional parameters
  const days = clampIntParam(query.days, 30, 1, 90)

  // The repository pages request 2000 runs and group them client-side, so the
  // cap has to cover that or repositories silently drop out of the list
  const limit = clampIntParam(query.limit, 200, 10, 2000)

  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching global timeline (${days} days, limit ${limit}, ${environment})`)

  try {
    const runs = await getOrganizationTimeline(days, limit, environment)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      days,
      limit,
      environment,
      count: runs.length
    }

    logger.info(`[Pipelines API] Successfully fetched ${runs.length} pipeline runs in ${metadata.responseTimeMs}ms`)

    return sendSuccess(event, runs, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch global timeline:`, error)
    return errors.serverError(event, `Failed to fetch pipeline timeline: ${error.message || 'Unknown error'}`)
  }
}))
