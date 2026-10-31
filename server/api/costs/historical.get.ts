/**
 * GET /api/costs/historical
 * Get historical cost data for trend calculations and comparisons
 * 
 * This endpoint provides simple historical totals for comparison purposes
 * without the complexity of the full cost analysis endpoints.
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage, getProformaCosts } from '../../utils/cost-explorer'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'
import { getAccountScopeCacheKey } from '../../utils/cache-keys'
import { buildCostExplorerTagFilter, getCostTagFilterCacheKey, parseCostTagFilter } from '../../utils/cost-tag-filters'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'
import { mergeCostExplorerPeriods } from '../../utils/cost-domain'

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// Register OpenAPI documentation
registerEndpoint('/api/costs/historical', 'GET', {
  summary: 'Get historical cost data',
  description: 'Retrieve simple historical cost totals for trend calculations and comparisons',
  tags: ['Costs'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
    {
      name: 'period',
      in: 'query',
      required: true,
      schema: {
        type: 'string',
        enum: ['last7days', 'last30days', 'last90days', 'thisMonth', 'lastMonth', 'lastQuarter', 'lastYear', 'ytd', 'last12months', 'last24months']
      },
      description: 'Historical period to retrieve data for'
    },
    {
      name: 'proforma',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: false
      },
      description: 'Include proforma data analysis (commercial environment only)'
    },
    {
      name: 'proformaAccountId',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        default: '253821132832'
      },
      description: 'Proforma account ID for cost analysis'
    },
    {
      name: 'masterAccountId',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        default: '205950196477'
      },
      description: 'Master account ID for cost analysis'
    },
    {
      name: 'accountIds',
      in: 'query',
      required: false,
      schema: {
        type: 'string'
      },
      description: 'Comma-separated list of account identifiers to filter. Supports all account ID formats: accountId, govCloudAccountId, awsStandardAccountID, or awsGovCloudAccountID'
    },
    {
      name: 'linesOfBusiness',
      in: 'query',
      required: false,
      schema: {
        type: 'string'
      },
      description: 'Comma-separated list of lines of business to filter accounts'
    },
    {
      name: 'departments',
      in: 'query',
      required: false,
      schema: {
        type: 'string'
      },
      description: 'Comma-separated list of department numbers to filter accounts'
    },
    {
      name: 'groupBy',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        default: 'LINKED_ACCOUNT'
      },
      description: 'Group costs by dimension or tag. Defaults to LINKED_ACCOUNT. Prefix with "TAG:" to group by a cost allocation tag, e.g. "TAG:Environment"'
    },
    {
      name: 'granularity',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['DAILY', 'MONTHLY'],
        default: 'MONTHLY'
      },
      description: 'Time granularity for results. DAILY gives day-level data points, MONTHLY gives month-level. Defaults to MONTHLY.'
    },
    {
      name: 'metric',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['UnblendedCost', 'NetUnblendedCost'],
        default: 'UnblendedCost'
      },
      description: 'Cost metric used for totals and grouped values.'
    },
    {
      name: 'tagFilter',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Filter by a specific tag value before grouping. Format: "tagKey||tagValue" (split on "||" delimiter to support colons in tag keys)'
    },
    {
      name: 'tagFilterKey',
      in: 'query',
      required: false,
      schema: { type: 'string' },
      description: 'Tag key used with tagFilterValues. Preferred for multi-value filtering.'
    },
    {
      name: 'tagFilterValues',
      in: 'query',
      required: false,
      schema: { type: 'array', items: { type: 'string' } },
      style: 'form',
      explode: true,
      description: 'One or more tag values matched with OR semantics. Use __untagged__ to include costs without the tag.'
    }
  ],
  responses: {
    200: {
      description: 'Historical cost data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  period: { type: 'string' },
                  totalCost: { type: 'number' },
                  totalCostFormatted: { type: 'string' },
                  accountCount: { type: 'integer' },
                  averageCostPerAccount: { type: 'number' },
                  averageCostPerAccountFormatted: { type: 'string' },
                  monthlyBreakdown: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        month: { type: 'string' },
                        cost: { type: 'number' },
                        costFormatted: { type: 'string' }
                      }
                    }
                  },
                  dateRange: {
                    type: 'object',
                    properties: {
                      start: { type: 'string' },
                      end: { type: 'string' }
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

// Parse query parameters including environment
function parseQueryParams(event: any) {
  const query = getQuery(event)
  return {
    environment: ((query.environment as string) || 'commercial') as 'commercial' | 'govcloud'
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)
  const { environment } = parseQueryParams(event)

  // Validate required period parameter
  const period = query.period as RelativePeriod
  if (!period) {
    return errors.badRequest(event, 'Period parameter is required')
  }

  // Validate date parameters for the historical period
  let dateRange: { startDate: string; endDate: string; description?: string; empty: boolean }
  try {
    dateRange = validateDateParams({
      period: period
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }

  const { startDate, endDate } = dateRange

  // Parse proforma parameters
  const proforma = query.proforma === 'true' || query.proforma === true
  const proformaAccountId = (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
  const masterAccountId = (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'

  // Validate proforma requirements
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, 'Proforma data analysis is only available for commercial environment')
  }

  // Validate proforma account IDs
  if (proforma) {
    if (!/^\d{12}$/.test(proformaAccountId)) {
      return errors.badRequest(event, 'Invalid proforma account ID format. Must be 12 digits.')
    }
    if (!/^\d{12}$/.test(masterAccountId)) {
      return errors.badRequest(event, 'Invalid master account ID format. Must be 12 digits.')
    }
    if (proformaAccountId === masterAccountId) {
      return errors.badRequest(event, 'Proforma and master account IDs cannot be the same')
    }
  }

  // Parse and validate account filtering criteria
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)

  // Check for validation errors
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }

  // Get filtered account IDs only if specific filters are provided
  const filteredAccountIds = (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments)
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined

  // Check if any accounts were found when filters are applied
  if (filteredAccountIds !== undefined && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }
  
  // Parse granularity param — defaults to MONTHLY
  const granularity = ((query.granularity as string) || 'MONTHLY').toUpperCase() as 'DAILY' | 'MONTHLY'
  if (granularity !== 'DAILY' && granularity !== 'MONTHLY') {
    return errors.badRequest(event, 'Granularity must be DAILY or MONTHLY')
  }
  const costMetric = (query.metric as string) || 'UnblendedCost'
  if (!['UnblendedCost', 'NetUnblendedCost'].includes(costMetric)) {
    return errors.badRequest(event, 'Metric must be UnblendedCost or NetUnblendedCost')
  }

  // Parse groupBy param — supports TAG: prefix for tag-based grouping
  const groupByParam = (query.groupBy as string) || 'LINKED_ACCOUNT'
  const isTagGroupBy = groupByParam.startsWith('TAG:')
  const groupByKey = isTagGroupBy ? groupByParam.slice(4) : groupByParam
  const costTagFilter = parseCostTagFilter(query)

  // Build cost parameters for historical data
  const costParams = {
    startDate,
    endDate,
    granularity,
    metrics: costMetric === 'UnblendedCost'
      ? ['UnblendedCost']
      : ['UnblendedCost', costMetric],
    groupBy: [{
      type: isTagGroupBy ? 'TAG' as const : 'DIMENSION' as const,
      key: groupByKey
    }],
    // Build filter: combine account filter and tag filter if both present
    filter: (() => {
      let accountFilter: any = undefined
      const tagFilter = buildCostExplorerTagFilter(costTagFilter)

      if (filteredAccountIds && filteredAccountIds.length > 0) {
        accountFilter = {
          Dimensions: {
            Key: 'LINKED_ACCOUNT',
            Values: filteredAccountIds,
            MatchOptions: ['EQUALS']
          }
        }
      }

      if (accountFilter && tagFilter) {
        return { And: [accountFilter, tagFilter] }
      }
      return accountFilter || tagFilter || undefined
    })()
  }
  
  // Generate cache key for historical data
  const cacheKey = `costs:historical:${JSON.stringify({
    period,
    // Relative periods move with the clock; key on the resolved window too.
    startDate,
    endDate,
    granularity,
    environment,
    groupByParam,
    costMetric,
    tagFilter: getCostTagFilterCacheKey(costTagFilter),
    proforma,
    proformaAccountId: proforma ? proformaAccountId : null,
    masterAccountId: proforma ? masterAccountId : null,
    accountScope: getAccountScopeCacheKey(filteredAccountIds)
  })}`

  // Helper function to process results into historical format
  const processHistoricalData = (resultsByTime: any[], periodLabel: string) => {
    let totalCost = 0
    const accountSet = new Set<string>()
    const monthlyData: { [key: string]: number } = {}
    const monthlyAccountBreakdown: { [key: string]: { accountId: string, cost: number }[] } = {}

    resultsByTime.forEach((result: any) => {
      const monthKey = result.TimePeriod?.Start?.substring(0, 7) // YYYY-MM format
      const authoritativePeriodCost = parseFloat(result.Total?.[costMetric]?.Amount || '0')
      totalCost += authoritativePeriodCost
      if (monthKey) monthlyData[monthKey] = (monthlyData[monthKey] || 0) + authoritativePeriodCost

      if (result.Groups) {
        result.Groups.forEach((group: any) => {
          const accountId = group.Keys?.[0]
          const cost = parseFloat(group.Metrics?.[costMetric]?.Amount || '0')

          if (accountId) {
            accountSet.add(accountId)

            if (monthKey) {
              // Track per-account breakdown for each month
              if (!monthlyAccountBreakdown[monthKey]) {
                monthlyAccountBreakdown[monthKey] = []
              }
              monthlyAccountBreakdown[monthKey].push({ accountId, cost })
            }
          }
        })
      }
    })

    // Format monthly breakdown with account details
    const monthlyBreakdown = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cost]) => ({
        month,
        cost,
        costFormatted: `$${cost.toFixed(2)}`,
        accountBreakdown: monthlyAccountBreakdown[month] || []
      }))

    const accountCount = accountSet.size
    const averageCostPerAccount = accountCount > 0 ? totalCost / accountCount : 0

    return {
      period: periodLabel,
      costMetric,
      totalCost,
      totalCostFormatted: `$${totalCost.toFixed(2)}`,
      accountCount,
      averageCostPerAccount,
      averageCostPerAccountFormatted: `$${averageCostPerAccount.toFixed(2)}`,
      monthlyBreakdown,
      resultsByTime, // Include raw data for charts that need it
      dateRange: {
        start: startDate,
        end: endDate
      }
    }
  }

  // Get historical cost data with caching
  // Read before getOrSet: afterwards the entry always exists.
  const cacheHit = costCache.isFresh(cacheKey)
  const historicalData = await costCache.getOrSet(
    cacheKey,
    async () => {
      logger.info(`Cache miss: Fetching historical cost data (proforma=${proforma})...`)

      if (proforma) {
        // Proforma mode: fetch both billable and proforma data
        logger.info('Fetching proforma historical data...')

        let billableResultsByTime: any[] = []
        let proformaResultsByTime: any[] = []

        // For last24months, we need to make two separate calls due to AWS 365-day limit
        if (period === 'last24months') {
          const [startYear, startMonth] = startDate.split('-').map(Number)
          const midpoint = new Date(Date.UTC(startYear, startMonth - 1 + 12, 1))

          // First 12 months (older data)
          const firstPeriodParams = {
            ...costParams,
            startDate: startDate,
            endDate: formatDate(midpoint)
          }

          // Second 12 months (recent data)
          const secondPeriodParams = {
            ...costParams,
            startDate: formatDate(midpoint),
            endDate: endDate
          }

          logger.info('Fetching first 12 months of 24-month period (proforma)...')
          const firstPeriodData = await getProformaCosts(firstPeriodParams, proformaAccountId, masterAccountId, costMetric)

          logger.info('Fetching second 12 months of 24-month period (proforma)...')
          const secondPeriodData = await getProformaCosts(secondPeriodParams, proformaAccountId, masterAccountId, costMetric)

          // Combine results
          billableResultsByTime = mergeCostExplorerPeriods([[
            ...(firstPeriodData?.billable?.costs?.resultsByTime || []),
            ...(secondPeriodData?.billable?.costs?.resultsByTime || [])
          ]])
          proformaResultsByTime = mergeCostExplorerPeriods([[
            ...(firstPeriodData?.proforma?.costs?.resultsByTime || []),
            ...(secondPeriodData?.proforma?.costs?.resultsByTime || [])
          ]])
        } else {
          // Single call for periods <= 12 months
          const proformaData = await getProformaCosts(costParams, proformaAccountId, masterAccountId, costMetric)
          billableResultsByTime = proformaData?.billable?.costs?.resultsByTime || []
          proformaResultsByTime = proformaData?.proforma?.costs?.resultsByTime || []
        }

        if (!dateRange.empty && (!billableResultsByTime || billableResultsByTime.length === 0) &&
            (!proformaResultsByTime || proformaResultsByTime.length === 0)) {
          throw new Error('No historical data found')
        }

        // Process both datasets
        const billableData = processHistoricalData(billableResultsByTime, period)
        const proformaData = processHistoricalData(proformaResultsByTime, period)

        return {
          billable: billableData,
          proforma: proformaData
        }
      } else {
        // Billable mode: fetch only billable data
        logger.info('Fetching billable historical data...')

        let allResultsByTime: any[] = []

        // For last24months, we need to make two separate calls due to AWS 365-day limit
        if (period === 'last24months') {
          const [startYear, startMonth] = startDate.split('-').map(Number)
          const midpoint = new Date(Date.UTC(startYear, startMonth - 1 + 12, 1))

          // First 12 months (older data)
          const firstPeriodParams = {
            ...costParams,
            startDate: startDate,
            endDate: formatDate(midpoint)
          }

          // Second 12 months (recent data)
          const secondPeriodParams = {
            ...costParams,
            startDate: formatDate(midpoint),
            endDate: endDate
          }

          logger.info('Fetching first 12 months of 24-month period...')
          const firstPeriodData = await getCostAndUsage(firstPeriodParams, environment)

          logger.info('Fetching second 12 months of 24-month period...')
          const secondPeriodData = await getCostAndUsage(secondPeriodParams, environment)

          // Combine results
          allResultsByTime = mergeCostExplorerPeriods([[
            ...(firstPeriodData?.resultsByTime || []),
            ...(secondPeriodData?.resultsByTime || [])
          ]])
        } else {
          // Single call for periods <= 12 months
          const costData = await getCostAndUsage(costParams, environment)
          allResultsByTime = costData?.resultsByTime || []
        }

        if (!dateRange.empty && (!allResultsByTime || allResultsByTime.length === 0)) {
          throw new Error('No historical data found')
        }

        return processHistoricalData(allResultsByTime, period)
      }
    },
    {
      ttl: 1800, // 30 minutes for historical data (longer cache since it doesn't change)
      tags: [CacheTags.COSTS, environment, 'historical', period]
    }
  )

  // Add cache metadata
  const cacheInfo = costCache.getEntryInfo(cacheKey)
  const cacheStats = costCache.getStats()

  // Get account count from appropriate data structure
  const accountCount = proforma
    ? (historicalData.billable?.accountCount || historicalData.proforma?.accountCount || 0)
    : (historicalData.accountCount || 0)

  const metadata = {
    cache: {
      hit: cacheHit,
      age: cacheInfo?.age || null,
      ttl: cacheInfo?.ttl || null,
      key: cacheKey,
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`,
      totalEntries: cacheStats.entries
    },
    performance: {
      responseTimeMs: Date.now() - startTime,
      period,
      accountCount
    },
    dateRange: {
      startDate,
      endDate,
      description: dateRange.description || null,
      isHistorical: true,
      empty: dateRange.empty
    },
    mode: proforma ? 'proforma' : 'billable'
  }

  // Normalize proforma nesting: ensure resultsByTime is directly on the proforma object
  if (historicalData?.proforma?.rawData?.resultsByTime && !historicalData?.proforma?.resultsByTime) {
    historicalData.proforma.resultsByTime = historicalData.proforma.rawData.resultsByTime
  }

  return sendSuccess(event, historicalData, metadata)
}))
