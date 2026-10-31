import { sendPaginated, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getErrorDetailsForAccount, paginateResults, clampIntParam } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-errors', 'GET', {
  summary: 'Get paginated error details for account',
  description: 'Returns a paginated list of pipeline error details for a specific account with optional filtering by category and severity. Data is queried from Athena and may take 30-60 seconds to load.',
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
    },
    {
      name: 'category',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by error category'
    },
    {
      name: 'severity',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by error severity'
    }
  ],
  responses: {
    200: {
      description: 'Paginated error details',
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
                    account_id: { type: 'string' },
                    timestamp: { type: 'string' },
                    error_phase: { type: 'string' },
                    error_category: { type: 'string' },
                    error_severity: { type: 'string' },
                    error_message: { type: 'string' },
                    error_resource_type: { type: 'string' }
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
                  days: { type: 'number' },
                  filters: {
                    type: 'object',
                    properties: {
                      category: { type: 'string' },
                      severity: { type: 'string' }
                    }
                  }
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
  const page = clampIntParam(query.page, 1, 1, 100000)
  const limit = clampIntParam(query.limit, 25, 1, 500)
  const category = query.category as string | undefined
  const severity = query.severity as string | undefined
  // Pipeline data is ALWAYS stored in GovCloud - ignore environment parameter
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching errors for account ${accountId} (${days} days, page ${page}, limit ${limit}, category=${category || 'none'}, severity=${severity || 'none'})`)

  try {
    const errorDetails = await getErrorDetailsForAccount(accountId, days, environment)

    // Apply in-memory filters
    let filtered = errorDetails

    if (category) {
      filtered = filtered.filter(e => e.error_category === category)
    }

    if (severity) {
      filtered = filtered.filter(e => e.error_severity === severity)
    }

    const paginated = paginateResults(filtered, page, limit)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment,
      filters: {
        category: category || null,
        severity: severity || null
      }
    }

    logger.info(`[Pipelines API] Successfully fetched ${paginated.total} errors for account ${accountId} in ${metadata.responseTimeMs}ms (page ${page}/${Math.ceil(paginated.total / limit) || 1})`)

    return sendPaginated(event, paginated.items, { page: paginated.page, limit: paginated.limit, total: paginated.total }, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch errors for account ${accountId}:`, error)
    return errors.serverError(event, `Failed to fetch error details: ${error.message || 'Unknown error'}`)
  }
}))
