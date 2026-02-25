import { sendPaginated, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { searchResourceAcrossAccounts, paginateResults } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/resource-search', 'GET', {
  summary: 'Search for resources across accounts',
  description: 'Searches for resources by address or type across all accounts (or scoped to a single account). Returns paginated results from Athena.',
  tags: ['Pipelines'],
  parameters: [
    {
      name: 'q',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'Search query to match against resource address or type'
    },
    {
      name: 'account_id',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Optional AWS Account ID to scope the search'
    },
    {
      name: 'days',
      in: 'query',
      required: false,
      schema: { type: 'number', default: 30 },
      description: 'Number of days to look back (default: 30, max: 90)'
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
      description: 'Paginated resource search results',
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
                    resource_address: { type: 'string' },
                    resource_type: { type: 'string' },
                    module_name: { type: 'string' },
                    change_action: { type: 'string' },
                    applied: { type: 'boolean' },
                    apply_success: { type: 'boolean' },
                    timestamp: { type: 'string' },
                    plan_pipeline_id: { type: 'string' }
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
                  query: { type: 'string' },
                  accountId: { type: 'string', nullable: true },
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
  const q = query.q as string
  if (!q) {
    throw createError({
      statusCode: 400,
      statusMessage: 'q parameter is required'
    })
  }

  // Parse optional parameters
  const accountId = query.account_id as string | undefined
  const daysParam = query.days ? parseInt(query.days as string, 10) : 30
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  const page = query.page ? parseInt(query.page as string, 10) : 1
  const limit = query.limit ? parseInt(query.limit as string, 10) : 25
  // Pipeline data is ALWAYS stored in GovCloud
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Searching resources for "${q}" (${days} days, account=${accountId || 'all'}, page ${page}, limit ${limit})`)

  try {
    const results = await searchResourceAcrossAccounts(q, days, accountId, environment)
    const paginated = paginateResults(results, page, limit)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      query: q,
      accountId: accountId || null,
      days,
      environment
    }

    logger.info(`[Pipelines API] Successfully found ${paginated.total} resources matching "${q}" in ${metadata.responseTimeMs}ms (page ${page}/${Math.ceil(paginated.total / limit) || 1})`)

    return sendPaginated(event, paginated.items, { page: paginated.page, limit: paginated.limit, total: paginated.total }, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to search resources for "${q}":`, error)
    return errors.serverError(event, `Failed to search resources: ${error.message || 'Unknown error'}`)
  }
}))
