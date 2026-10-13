/**
 * GET /api/costs/tags
 * Discover available cost allocation tags for a given time period
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAllocationTags } from '../../utils/cost-explorer'
import { sendSuccess, parseQueryParams, validateEnvironment, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'
import { getAccountIdsFromCriteria, parseAndValidateAccountFilters } from '../../utils/account-filters'
import { getAccountScopeCacheKey } from '../../utils/cache-keys'

// Register OpenAPI documentation
registerEndpoint('/api/costs/tags', 'GET', {
  summary: 'Discover cost allocation tags',
  description: 'Retrieve available cost allocation tag keys and optionally their values for a given time period',
  tags: ['Costs'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'startDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Inclusive start date (YYYY-MM-DD). Must be paired with endDate.'
    },
    {
      name: 'endDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Exclusive end date (YYYY-MM-DD). Must be paired with startDate.'
    },
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'ytd', 'last12months']
      },
      description: 'Relative date period; defaults to last90days when no dates are supplied. Cannot be used with startDate/endDate.'
    },
    {
      name: 'tagKey',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter to a specific tag key to retrieve its values'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of account identifiers to filter'
    }
  ],
  responses: {
    200: {
      description: 'Available cost allocation tags',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  tags: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of available tag keys (or values when tagKey is specified)'
                  },
                  returnSize: { type: 'integer' },
                  totalSize: { type: 'integer' },
                  tagKey: {
                    type: 'string',
                    description: 'The tag key filter used, if any'
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
  const { environment } = parseQueryParams(event)

  if (!validateEnvironment(environment)) {
    return errors.badRequest(event, 'environment must be commercial or govcloud')
  }
  const tagKey = query.tagKey
  if (tagKey !== undefined && (typeof tagKey !== 'string' || !tagKey.trim())) {
    return errors.badRequest(event, 'tagKey must be a non-empty string')
  }

  // Validate date parameters - default to last 90 days if none provided
  let dateRange: { startDate: string; endDate: string; description?: string; empty: boolean }
  try {
    const hasAnyDateParam = query.startDate || query.endDate || query.period
    dateRange = validateDateParams({
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      period: (hasAnyDateParam ? query.period : 'last90days') as RelativePeriod
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }

  const { startDate, endDate } = dateRange
  const billableAccountId = environment === 'commercial'
    ? process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
    : undefined

  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }

  const filteredAccountIds = accountFilters.accountIds?.length
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined

  if (filteredAccountIds !== undefined && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }

  const accountFilter = filteredAccountIds?.length
    ? { Dimensions: { Key: 'LINKED_ACCOUNT', Values: filteredAccountIds, MatchOptions: ['EQUALS'] } }
    : undefined

  const cacheKey = `costs:tags:${JSON.stringify({
    startDate,
    endDate,
    tagKey,
    environment,
    accountScope: getAccountScopeCacheKey(filteredAccountIds)
  })}`

  const result = await costCache.getOrSet(
    cacheKey,
    async () => {
      if (dateRange.empty) {
        return { tags: [], returnSize: 0, totalSize: 0, tagKey: tagKey || null }
      }
      logger.info(`Cache miss: Fetching cost allocation tags (tagKey=${tagKey || 'all'})...`)

      const data = await getCostAllocationTags(
        { Start: startDate, End: endDate },
        tagKey,
        accountFilter,
        environment,
        billableAccountId
      )

      return {
        tags: data.tags,
        returnSize: data.returnSize,
        totalSize: data.totalSize,
        tagKey: tagKey || null
      }
    },
    {
      ttl: 3600, // 1 hour — tag keys change infrequently
      tags: [CacheTags.COSTS, environment, 'tags']
    }
  )

  const cacheInfo = costCache.getEntryInfo(cacheKey)
  const cacheStats = costCache.getStats()

  return sendSuccess(event, result, {
    cache: {
      hit: !!cacheInfo,
      age: cacheInfo?.age || null,
      ttl: cacheInfo?.ttl || null,
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`
    },
    performance: { responseTimeMs: Date.now() - startTime },
    dateRange: { startDate, endDate, description: dateRange.description || null }
  })
}))
