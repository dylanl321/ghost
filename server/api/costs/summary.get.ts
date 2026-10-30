/**
 * GET /api/costs/summary
 * Get cost summary for specified date range
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage, getProformaCosts, enhanceCostData } from '../../utils/cost-explorer'
import { sendSuccess, parseQueryParams, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'
import { getAccountScopeCacheKey } from '../../utils/cache-keys'
import { buildCostExplorerTagFilter, getCostTagFilterCacheKey, parseCostTagFilter } from '../../utils/cost-tag-filters'
import { costCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, getRecommendedGranularity, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/costs/summary', 'GET', {
  summary: 'Get cost summary',
  description: 'Retrieve AWS cost summary for a specified date range',
  tags: ['Costs'],
  parameters: [
    { $ref: '#/components/parameters/Environment' },
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
      name: 'granularity',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['DAILY', 'MONTHLY'],
        default: 'MONTHLY'
      }
    },
    {
      name: 'groupBy',
      in: 'query',
      required: false,
      schema: {
        type: 'string',
        enum: ['SERVICE', 'LINKED_ACCOUNT', 'REGION', 'NONE'],
        default: 'SERVICE'
      },
      description: 'Group costs by dimension or tag. Use NONE for totals only (automatically groups by month for multi-month ranges). Prefix with "TAG:" to group by a cost allocation tag, e.g. "TAG:Environment"'
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
      description: 'Comma-separated list of account identifiers to filter (supports request IDs, 12-digit account IDs, or email addresses)'
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
      name: 'includeDecommissioned',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Also match decommissioned accounts when selecting by line of business or department (default: false). Explicitly selected accounts and organization-wide totals always include decommissioned accounts.'
    },
    {
      name: 'enhanced',
      in: 'query',
      required: false,
      schema: {
        type: 'boolean',
        default: true
      },
      description: 'Return enhanced format with account names and summaries (default: true)'
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
      description: 'Cost summary data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  resultsByTime: { type: 'array' },
                  total: { type: 'object' },
                  proformaBreakdown: {
                    type: 'object',
                    description: 'Only included when proforma=true',
                    properties: {
                      masterAccount: {
                        type: 'object',
                        properties: {
                          accountId: { type: 'string' },
                          costs: { type: 'object' }
                        }
                      },
                      proformaAccount: {
                        type: 'object',
                        properties: {
                          accountId: { type: 'string' },
                          costs: { type: 'object' }
                        }
                      },
                      totals: {
                        type: 'object',
                        properties: {
                          master: { type: 'number' },
                          proforma: { type: 'number' },
                          masterOnly: { type: 'number' },
                          grandTotal: { type: 'number' }
                        }
                      }
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
  const { environment } = parseQueryParams(event)
  
  // Validate date parameters - either explicit dates or relative period
  let dateRange: { startDate: string; endDate: string; description?: string; empty: boolean }
  try {
    dateRange = validateDateParams({
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      period: query.period as RelativePeriod
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  
  const { startDate, endDate } = dateRange
  
  // Auto-determine granularity based on date range if not specified
  const granularity = (query.granularity as 'DAILY' | 'MONTHLY') || getRecommendedGranularity(startDate, endDate)
  let groupByDimension = (query.groupBy as string) || 'SERVICE'
  
  // Handle NONE groupBy - for multi-month ranges, automatically group by month
  const isNoGrouping = groupByDimension === 'NONE'
  if (isNoGrouping) {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    
    // For multi-month ranges (>31 days), we'll use MONTHLY granularity with no additional grouping
    // For single month or less, we'll use no grouping at all
    if (daysDiff <= 31) {
      groupByDimension = 'NONE' // No grouping at all, just totals
    } else {
      groupByDimension = 'MONTHLY_ONLY' // Special flag to indicate monthly time grouping only
    }
  }
  const proforma = query.proforma === 'true' || query.proforma === true
  const proformaAccountId = (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
  const masterAccountId = (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  const enhanced = query.enhanced !== 'false' && query.enhanced !== false // Default to true
  
  // Parse and validate account filtering criteria
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  
  // Check for validation errors
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }
  
  // Ensure includeDecommissioned is consistent
  accountFilters.includeDecommissioned = includeDecommissioned
  
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
  
  // Get filtered account IDs only if specific filters are provided
  // Do NOT filter for decommissioned status alone - Cost Explorer handles that naturally
  const filteredAccountIds = (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments)
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined
  
  // Check if any accounts were found when filters are applied
  // If filters were applied but no accounts found, return early with a clear message
  if (filteredAccountIds !== undefined && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }
  
  // Detect TAG: prefix — e.g. "TAG:Environment" means group by tag key "Environment"
  const isTagGroupBy = groupByDimension.startsWith('TAG:')
  const tagGroupKey = isTagGroupBy ? groupByDimension.slice(4) : null
  const costTagFilter = parseCostTagFilter(query)

  // Build cost parameters
  const costParams = {
    startDate,
    endDate,
    granularity,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: (groupByDimension === 'NONE' || groupByDimension === 'MONTHLY_ONLY') ? undefined : [{
      type: isTagGroupBy ? 'TAG' as const : 'DIMENSION' as const,
      key: isTagGroupBy ? tagGroupKey! : groupByDimension
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
  
  // Generate cache key based on request parameters
  const cacheKey = `costs:summary:${JSON.stringify({
    startDate,
    endDate,
    granularity,
    groupByDimension: groupByDimension === 'MONTHLY_ONLY' ? 'NONE_MONTHLY' : groupByDimension,
    tagGroupKey,
    tagFilter: getCostTagFilterCacheKey(costTagFilter),
    environment,
    proforma,
    proformaAccountId: proforma ? proformaAccountId : null,
    masterAccountId: proforma ? masterAccountId : null,
    enhanced,
    includeDecommissioned,
    accountScope: getAccountScopeCacheKey(filteredAccountIds)
  })}`

  // Get cost data with caching
  // Read before getOrSet: afterwards the entry always exists.
  const cacheHit = costCache.isFresh(cacheKey)
  const finalResult = await costCache.getOrSet(
    cacheKey,
    async () => {
      logger.info('Cache miss: Fetching cost summary data...')
      
      // When proforma is requested, we get both billable and proforma data
      if (proforma) {
        const proformaData = await getProformaCosts(
          costParams,
          proformaAccountId,
          masterAccountId
        )
        
        // Prepare result based on enhanced flag
        if (enhanced) {
          // Get enhanced billable data first
          const billableEnhanced = groupByDimension === 'NONE' || groupByDimension === 'MONTHLY_ONLY'
            ? proformaData.billable.costs // Return raw data for NONE grouping
            : await enhanceCostData(proformaData.billable.costs, includeDecommissioned, groupByDimension)

          // Get enhanced proforma data
          const proformaEnhanced = groupByDimension === 'NONE' || groupByDimension === 'MONTHLY_ONLY'
            ? proformaData.proforma.costs // Return raw data for NONE grouping
            : await enhanceCostData(proformaData.proforma.costs, includeDecommissioned, groupByDimension)

          // Note: Master account unallocated costs are NOT added to proforma accounts list
          // Proforma view shows only Billing Conductor allocated costs
          // Unallocated costs (support, tax, etc.) are available in masterAccount.unallocatedCost

          return {
            billable: billableEnhanced,
            proforma: proformaEnhanced,
            costDataset: proformaData.datasets.proforma,
            datasets: proformaData.datasets,
            comparison: proformaData.comparison,
            validation: proformaData.validation,
            masterAccount: {
              unallocatedCost: proformaData.masterAccount.unallocatedCost,
              enterpriseSupportCost: proformaData.masterAccount.enterpriseSupportCost
            }
          }
        } else {
          return {
            billable: {
              resultsByTime: proformaData.billable.costs.resultsByTime || [],
              total: proformaData.billable.costs.total,
              costDataset: proformaData.datasets.billable
            },
            proforma: {
              resultsByTime: proformaData.proforma.costs.resultsByTime || [],
              total: proformaData.proforma.costs.total,
              costDataset: proformaData.datasets.proforma
            },
            costDataset: proformaData.datasets.proforma,
            datasets: proformaData.datasets,
            comparison: proformaData.comparison,
            validation: proformaData.validation,
            masterAccount: {
              unallocatedCost: proformaData.masterAccount.unallocatedCost,
              enterpriseSupportCost: proformaData.masterAccount.enterpriseSupportCost
            }
          }
        }
      } else {
        // Default: return billable costs only
        const costData = await getCostAndUsage(costParams, environment)
        
        // For TAG groupBy, aggregate Groups into a flat tag-value breakdown
        // This runs regardless of enhanced flag since the raw AWS format isn't useful to consumers
        if (isTagGroupBy) {
          const tagTotals = new Map<string, number>()

          for (const period of (costData.resultsByTime || [])) {
            for (const group of (period.Groups || [])) {
              const rawKey: string = group.Keys?.[0] ?? ''
              const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
              tagTotals.set(rawKey, (tagTotals.get(rawKey) || 0) + cost)
            }
          }

          const groups = Array.from(tagTotals.entries()).map(([tagValue, totalCost]) => ({
            groupKey: tagValue || '',
            totalCost
          }))

          return {
            groups,
            resultsByTime: costData.resultsByTime,
            total: costData.total,
            costDataset: costData.dataset
          }
        }

        if (enhanced) {
          // For NONE or MONTHLY_ONLY grouping, we need to handle the data differently
          if (groupByDimension === 'NONE' || groupByDimension === 'MONTHLY_ONLY') {
            // When there's no grouping, enhanceCostData won't find any groups
            // So we'll create a simplified enhanced response
            const totalCost = parseFloat(costData.total?.UnblendedCost?.Amount || '0')
            const totalUsage = parseFloat(costData.total?.UsageQuantity?.Amount || '0')
            
            return {
              resultsByTime: costData.resultsByTime || [],
              summary: {
                totalCost,
                totalUsage,
                totalCostFormatted: `$${totalCost.toFixed(2)}`,
                isGrouped: false,
                groupingType: 'NONE'
              },
              timePeriods: costData.resultsByTime?.map((result: any) => ({
                start: result.TimePeriod?.Start,
                end: result.TimePeriod?.End,
                totalCost: parseFloat(result.Total?.UnblendedCost?.Amount || '0'),
                totalUsage: parseFloat(result.Total?.UsageQuantity?.Amount || '0'),
                estimated: result.Estimated || false
              })) || [],
              metadata: {
                startDate: costData.resultsByTime?.[0]?.TimePeriod?.Start,
                endDate: costData.resultsByTime?.[costData.resultsByTime.length - 1]?.TimePeriod?.End,
                granularity,
                groupBy: 'NONE',
                includeDecommissioned
              },
              costDataset: costData.dataset
            }
          } else {
            const enhancedData = await enhanceCostData(costData, includeDecommissioned, groupByDimension)
            return { ...enhancedData, costDataset: costData.dataset }
          }
        } else {
          return costData
        }
      }
    },
    {
      ttl: 900, // 15 minutes for cost data
      tags: [CacheTags.COSTS, environment, proforma ? 'proforma' : 'standard', enhanced ? 'enhanced' : 'raw']
    }
  )

  // Add cache metadata
  const cacheInfo = costCache.getEntryInfo(cacheKey)
  const cacheStats = costCache.getStats()
  
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
      proforma,
      enhanced
    },
    dateRange: {
      startDate,
      endDate,
      description: dateRange.description || null,
      granularity,
      isRelativePeriod: !!query.period,
      empty: dateRange.empty
    },
    dataSource: proforma 
      ? { type: 'proforma', billingDomain: 'proforma', accountId: proformaAccountId }
      : { type: 'standard', billingDomain: 'billable', accountId: environment === 'commercial' ? masterAccountId : null, environment },
    compatibility: {
      deprecatedFields: ['masterAccount.unallocatedCost', 'validation.passed'],
      canonicalField: 'data.costDataset'
    }
  }

  // Normalize proforma nesting: ensure resultsByTime is directly on the proforma object
  if (finalResult?.proforma?.rawData?.resultsByTime && !finalResult?.proforma?.resultsByTime) {
    finalResult.proforma.resultsByTime = finalResult.proforma.rawData.resultsByTime
  }

  return sendSuccess(event, finalResult, metadata)
}))
