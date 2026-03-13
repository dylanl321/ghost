/**
 * GET /api/costs/tag-coverage
 * Calculate tag coverage (tagged vs untagged costs) per account for a given tag key
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage } from '../../utils/cost-explorer'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import type { TagCoverageData, TagCoverageAccount } from '../../../shared/types/cost-tags'

// Register OpenAPI documentation
registerEndpoint('/api/costs/tag-coverage', 'GET', {
  summary: 'Get tag coverage analysis',
  description: 'Calculate tagged vs untagged cost coverage per account for a specific tag key',
  tags: ['Costs'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'tagKey',
      in: 'query',
      required: true,
      schema: { type: 'string' },
      description: 'The tag key to analyze coverage for (e.g. "Environment", "Project")'
    },
    {
      name: 'startDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Start date (YYYY-MM-DD). Required if period is not specified.'
    },
    {
      name: 'endDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'End date (YYYY-MM-DD). Required if period is not specified.'
    },
    {
      name: 'period',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'ytd', 'last12months']
      },
      description: 'Relative date period. Cannot be used with startDate/endDate.'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of account identifiers to filter'
    },
    {
      name: 'linesOfBusiness',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of lines of business to filter accounts'
    },
    {
      name: 'departments',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Comma-separated list of department numbers to filter accounts'
    }
  ],
  responses: {
    200: {
      description: 'Tag coverage data per account',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  tagKey: { type: 'string' },
                  accounts: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        accountId: { type: 'string' },
                        taggedCost: { type: 'number' },
                        untaggedCost: { type: 'number' },
                        coveragePercent: { type: 'number' }
                      }
                    }
                  },
                  totalTaggedCost: { type: 'number' },
                  totalUntaggedCost: { type: 'number' },
                  overallCoverage: { type: 'number' }
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

  // tagKey is required
  const tagKey = query.tagKey as string
  if (!tagKey) {
    return errors.badRequest(event, 'tagKey parameter is required')
  }

  // Validate date parameters — default to last 90 days if none provided
  let dateRange: { startDate: string; endDate: string; description?: string }
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

  // Parse and validate account filters
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }

  const filteredAccountIds = (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments)
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined

  if (filteredAccountIds !== undefined && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }

  const accountFilter = filteredAccountIds && filteredAccountIds.length > 0
    ? { Dimensions: { Key: 'LINKED_ACCOUNT', Values: filteredAccountIds, MatchOptions: ['EQUALS'] } }
    : undefined

  const cacheKey = `costs:tag-coverage:${JSON.stringify({
    tagKey, startDate, endDate, environment,
    filteredAccountIds: filteredAccountIds
      ? `${filteredAccountIds.length}:${filteredAccountIds.sort().join(',').substring(0, 100)}`
      : null
  })}`

  const result = await costCache.getOrSet(
    cacheKey,
    async () => {
      logger.info(`Cache miss: Fetching tag coverage for tag key "${tagKey}"...`)

      // Single query with 2 GroupBy dimensions: LINKED_ACCOUNT + TAG
      // AWS returns ALL costs — untagged resources appear with empty-string tag value
      const taggedData = await getCostAndUsage({
        startDate,
        endDate,
        granularity: 'MONTHLY',
        metrics: ['UnblendedCost'],
        groupBy: [
          { type: 'DIMENSION', key: 'LINKED_ACCOUNT' },
          { type: 'TAG', key: tagKey }
        ],
        filter: accountFilter
      }, environment)

      // Parse the 2-key groups to compute tagged vs total per account
      const accountTotals = new Map<string, number>()
      const accountTaggedCosts = new Map<string, number>()

      for (const period of (taggedData.resultsByTime || [])) {
        for (const group of (period.Groups || [])) {
          const keys = group.Keys || []
          const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')

          // With 2 GroupBy dimensions, Keys = [accountId, tagValue]
          const accountId = keys[0]
          const tagValue = keys.length > 1 ? keys[1] : ''

          if (!accountId) continue

          // Add to account total (every group contributes to total)
          accountTotals.set(accountId, (accountTotals.get(accountId) || 0) + cost)

          // Determine if this group represents tagged resources
          // Untagged resources have empty-string tag value
          const isUntagged = !tagValue || tagValue.trim() === ''
          if (!isUntagged) {
            accountTaggedCosts.set(accountId, (accountTaggedCosts.get(accountId) || 0) + cost)
          }
        }
      }

      logger.info(`Tag coverage for "${tagKey}": ${accountTotals.size} accounts, sample totals vs tagged:`,
        Array.from(accountTotals.entries()).slice(0, 3).map(([id, total]) => ({
          accountId: id,
          total: total.toFixed(2),
          tagged: (accountTaggedCosts.get(id) || 0).toFixed(2)
        }))
      )

      // Resolve account names
      let accountNameMap = new Map<string, string>()
      try {
        const allAccounts = await getAllAccountsUnified(true)
        for (const acc of allAccounts) {
          if (acc.accountId && acc.name) {
            accountNameMap.set(acc.accountId, acc.name)
          }
        }
      } catch (err) {
        logger.warn('Could not resolve account names for tag coverage:', err)
      }

      // Build per-account coverage data
      const accounts: TagCoverageAccount[] = []
      for (const [accountId, totalCost] of accountTotals) {
        const taggedCost = accountTaggedCosts.get(accountId) || 0
        const untaggedCost = Math.max(0, totalCost - taggedCost)
        const coveragePercent = totalCost > 0 ? (taggedCost / totalCost) * 100 : 0

        accounts.push({
          accountId,
          accountName: accountNameMap.get(accountId),
          taggedCost,
          untaggedCost,
          coveragePercent
        })
      }

      // Sort by untagged cost descending (highest opportunity first)
      accounts.sort((a, b) => b.untaggedCost - a.untaggedCost)

      const totalTaggedCost = accounts.reduce((sum, a) => sum + a.taggedCost, 0)
      const totalUntaggedCost = accounts.reduce((sum, a) => sum + a.untaggedCost, 0)
      const grandTotal = totalTaggedCost + totalUntaggedCost
      const overallCoverage = grandTotal > 0 ? (totalTaggedCost / grandTotal) * 100 : 0

      return {
        tagKey,
        accounts,
        totalTaggedCost,
        totalUntaggedCost,
        overallCoverage
      } satisfies TagCoverageData
    },
    {
      ttl: 1800, // 30 minutes — coverage data is relatively stable
      tags: [CacheTags.COSTS, environment, 'tag-coverage']
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
