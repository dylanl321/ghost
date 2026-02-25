import { sendPaginated, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { logger } from '../../utils/logger'
import { getResourceChangesForAccount, paginateResults } from '../../utils/athena-pipeline-queries'

// Register OpenAPI documentation
registerEndpoint('/api/pipelines/account-resources', 'GET', {
  summary: 'Get paginated resource changes for account',
  description: 'Returns a paginated list of resource changes for a specific account with optional filtering by search term, action, and applied status. Data is queried from Athena and may take 30-60 seconds to load.',
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
      name: 'search',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by resource address or resource type (case insensitive)'
    },
    {
      name: 'action',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['create', 'update', 'delete'] },
      description: 'Filter by change action (create, update, or delete)'
    },
    {
      name: 'applied',
      in: 'query',
      required: false,
      schema: { type: 'string', enum: ['true', 'false', 'all'] },
      description: 'Filter by applied status (true, false, or all). Defaults to all.'
    }
  ],
  responses: {
    200: {
      description: 'Paginated resource changes',
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
                    timestamp: { type: 'string' }
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
                      search: { type: 'string' },
                      action: { type: 'string' },
                      applied: { type: 'string' }
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
  const daysParam = query.days ? parseInt(query.days as string, 10) : 7
  const days = Math.min(Math.max(daysParam, 1), 90) // Clamp between 1 and 90
  const page = query.page ? parseInt(query.page as string, 10) : 1
  const limit = query.limit ? parseInt(query.limit as string, 10) : 25
  const search = query.search as string | undefined
  const action = query.action as string | undefined
  const applied = query.applied as string | undefined
  // Pipeline data is ALWAYS stored in GovCloud - ignore environment parameter
  const environment = 'govcloud' as const

  logger.info(`[Pipelines API] Fetching resources for account ${accountId} (${days} days, page ${page}, limit ${limit}, search=${search || 'none'}, action=${action || 'none'}, applied=${applied || 'all'})`)

  try {
    const resources = await getResourceChangesForAccount(accountId, days, environment)

    // Apply in-memory filters
    let filtered = resources

    if (search) {
      const searchLower = search.toLowerCase()
      filtered = filtered.filter(r =>
        (r.resource_address && r.resource_address.toLowerCase().includes(searchLower)) ||
        (r.resource_type && r.resource_type.toLowerCase().includes(searchLower))
      )
    }

    if (action) {
      filtered = filtered.filter(r => r.change_action === action)
    }

    if (applied === 'true') {
      filtered = filtered.filter(r => r.applied === true)
    } else if (applied === 'false') {
      filtered = filtered.filter(r => r.applied === false)
    }
    // If applied is 'all' or undefined, no filter applied

    const paginated = paginateResults(filtered, page, limit)

    const metadata = {
      responseTimeMs: Date.now() - startTime,
      accountId,
      days,
      environment,
      filters: {
        search: search || null,
        action: action || null,
        applied: applied || 'all'
      }
    }

    logger.info(`[Pipelines API] Successfully fetched ${paginated.total} resources for account ${accountId} in ${metadata.responseTimeMs}ms (page ${page}/${Math.ceil(paginated.total / limit) || 1})`)

    return sendPaginated(event, paginated.items, { page: paginated.page, limit: paginated.limit, total: paginated.total }, metadata)

  } catch (error: any) {
    logger.error(`[Pipelines API] Failed to fetch resources for account ${accountId}:`, error)
    return errors.serverError(event, `Failed to fetch resource changes: ${error.message || 'Unknown error'}`)
  }
}))
