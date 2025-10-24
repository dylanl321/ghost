/**
 * GET /api/costs/historical
 * Get historical cost data for trend calculations and comparisons
 * 
 * This endpoint provides simple historical totals for comparison purposes
 * without the complexity of the full cost analysis endpoints.
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage } from '../../utils/cost-explorer'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'

// Helper function to format date as YYYY-MM-DD
function formatDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
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
        enum: ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'ytd', 'last12months', 'last24months']
      },
      description: 'Historical period to retrieve data for'
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
  let dateRange: { startDate: string; endDate: string; description?: string }
  try {
    dateRange = validateDateParams({
      period: period
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  
  const { startDate, endDate } = dateRange
  
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
  
  // Build cost parameters for historical data
  const costParams = {
    startDate,
    endDate,
    granularity: 'MONTHLY' as const,
    metrics: ['UnblendedCost'],
    groupBy: [{
      type: 'DIMENSION' as const,
      key: 'LINKED_ACCOUNT'
    }],
    // Add account filter for Cost Explorer only if we have specific accounts
    filter: filteredAccountIds && filteredAccountIds.length > 0 ? {
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: filteredAccountIds,
        MatchOptions: ['EQUALS']
      }
    } : undefined
  }
  
  // Generate cache key for historical data
  const cacheKey = `costs:historical:${JSON.stringify({
    period,
    environment,
    filteredAccountIds: filteredAccountIds?.slice(0, 5) // Sample for uniqueness
  })}`

  // Get historical cost data with caching
  const historicalData = await costCache.getOrSet(
    cacheKey,
    async () => {
      logger.info('Cache miss: Fetching historical cost data...')
      
      let allResultsByTime: any[] = []
      
      // For last24months, we need to make two separate calls due to AWS 365-day limit
      if (period === 'last24months') {
        const now = new Date()
        const midpoint = new Date(now.getFullYear(), now.getMonth() - 12, 1)
        
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
        allResultsByTime = [
          ...(firstPeriodData?.resultsByTime || []),
          ...(secondPeriodData?.resultsByTime || [])
        ]
      } else {
        // Single call for periods <= 12 months
        const costData = await getCostAndUsage(costParams, environment)
        allResultsByTime = costData?.resultsByTime || []
      }
      
      if (!allResultsByTime || allResultsByTime.length === 0) {
        throw new Error('No historical data found')
      }
      
      // Calculate totals and monthly breakdown from historical data
      let totalCost = 0
      const accountSet = new Set<string>()
      const monthlyData: { [key: string]: number } = {}
      
      allResultsByTime.forEach((result: any) => {
        const monthKey = result.TimePeriod?.Start?.substring(0, 7) // YYYY-MM format
        
        if (result.Groups) {
          result.Groups.forEach((group: any) => {
            const accountId = group.Keys?.[0]
            const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
            
            if (accountId) {
              totalCost += cost
              accountSet.add(accountId)
              
              if (monthKey) {
                monthlyData[monthKey] = (monthlyData[monthKey] || 0) + cost
              }
            }
          })
        }
      })
      
      // Format monthly breakdown
      const monthlyBreakdown = Object.entries(monthlyData)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, cost]) => ({
          month,
          cost,
          costFormatted: `$${cost.toFixed(2)}`
        }))
      
      const accountCount = accountSet.size
      const averageCostPerAccount = accountCount > 0 ? totalCost / accountCount : 0
      
      return {
        period,
        totalCost,
        totalCostFormatted: `$${totalCost.toFixed(2)}`,
        accountCount,
        averageCostPerAccount,
        averageCostPerAccountFormatted: `$${averageCostPerAccount.toFixed(2)}`,
        monthlyBreakdown,
        resultsByTime: allResultsByTime, // Include raw data for charts that need it
        dateRange: {
          start: startDate,
          end: endDate
        }
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
  
  const metadata = {
    cache: {
      hit: !!cacheInfo,
      age: cacheInfo?.age || null,
      ttl: cacheInfo?.ttl || null,
      key: cacheKey,
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`,
      totalEntries: cacheStats.entries
    },
    performance: {
      responseTimeMs: Date.now() - startTime,
      period,
      accountCount: historicalData.accountCount
    },
    dateRange: {
      startDate,
      endDate,
      description: dateRange.description || null,
      isHistorical: true
    }
  }

  return sendSuccess(event, historicalData, metadata)
}))
