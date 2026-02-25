/**
 * GET /api/costs/analysis
 * Advanced cost analysis with GDMS forecast comparison, anomalies, and proforma analysis
 * 
 * COST DATA SOURCES:
 * - Master Account (205950196477): Raw AWS billing data - what AWS actually charges
 * - Proforma Account (253821132832): Post-AWS Billing Conductor data with savings plans 
 *   and enterprise discounts properly allocated across accounts
 * 
 * PROFORMA vs MASTER ANALYSIS:
 * - proforma=false: Uses master account data (raw AWS costs)
 * - proforma=true: Uses proforma account data (Billing Conductor managed costs)
 * 
 * The proforma data reflects "true cost per account" after enterprise-level savings
 * plans are distributed from the master account to individual accounts based on usage.
 * This is essential for accurate department budgeting and cost allocation.
 */

import { defineEventHandler, getQuery } from 'h3'
import { getCostAndUsage, getProformaCosts, getMonthOverMonthChange, detectCostAnomalies, calculateCostTrends } from '../../utils/cost-explorer'
import { sendSuccess, errors, handleAsync } from '../../utils/api-response'
import { registerEndpoint } from '../../plugins/swagger'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { parseAndValidateAccountFilters, getAccountIdsFromCriteria } from '../../utils/account-filters'
import { costCache, accountCache, CacheTags } from '../../utils/cache-manager'
import { validateDateParams, getRecommendedGranularity, type RelativePeriod } from '../../utils/date-helpers'
import { logger } from '../../utils/logger'

// Register OpenAPI documentation
registerEndpoint('/api/costs/analysis', 'GET', {
  summary: 'Advanced cost analysis',
  description: 'Comprehensive cost analysis including budget vs actual, anomalies, proforma breakdown, and trends',
  tags: ['Costs'],
  parameters: [
    {
      name: 'startDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Analysis start date (YYYY-MM-DD). Required if period is not specified.'
    },
    {
      name: 'endDate',
      in: 'query',
      required: false,
      schema: { type: 'string', format: 'date' },
      description: 'Analysis end date (YYYY-MM-DD). Required if period is not specified.'
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
        enum: ['SERVICE', 'LINKED_ACCOUNT', 'REGION'],
        default: 'LINKED_ACCOUNT'
      }
    },
    {
      name: 'environment',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        enum: ['commercial', 'govcloud'],
        default: 'commercial'
      }
    },
    {
      name: 'proforma',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: false
      },
      description: 'Include proforma analysis (commercial environment only)'
    },
    {
      name: 'includeBudget',
      in: 'query',
      required: false,
      schema: { 
        type: 'boolean',
        default: true
      },
      description: 'Include budget vs actual analysis using estimatedMonthlyCharge from account metadata'
    },
    {
      name: 'anomalyThreshold',
      in: 'query',
      required: false,
      schema: { 
        type: 'number',
        minimum: 0,
        maximum: 100,
        default: 25
      },
      description: 'Percentage threshold for anomaly detection (default: 25%)'
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
      description: 'Include decommissioned accounts in analysis (default: false)'
    },
    {
      name: 'proformaAccountId',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        default: '253821132832'
      },
      description: 'Proforma account ID for cost analysis (default: 253821132832)'
    },
    {
      name: 'masterAccountId',
      in: 'query',
      required: false,
      schema: { 
        type: 'string',
        default: '205950196477'
      },
      description: 'Master account ID for cost analysis (default: 205950196477)'
    }
  ],
  responses: {
    200: {
      description: 'Advanced cost analysis data',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  summary: {
                    type: 'object',
                    properties: {
                      totalCost: { type: 'number' },
                      totalBudget: { type: 'number' },
                      budgetVariance: { type: 'number' },
                      averageDailyCost: { type: 'number' },
                      accountsAnalyzed: { type: 'integer' }
                    }
                  },
                  proformaAnalysis: {
                    type: 'object',
                    description: 'Only included if proforma=true'
                  },
                  budgetAnalysis: {
                    type: 'object',
                    properties: {
                      byAccount: { type: 'array' },
                      overBudgetAccounts: { type: 'array' },
                      underBudgetAccounts: { type: 'array' }
                    }
                  },
                  trends: {
                    type: 'object',
                    properties: {
                      monthOverMonth: { type: 'object' },
                      dailyAverages: { type: 'array' }
                    }
                  },
                  anomalies: {
                    type: 'object',
                    properties: {
                      detected: { type: 'array' },
                      threshold: { type: 'number' }
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

interface CostAnalysisResult {
  summary: {
    totalCost: number
    totalBudget: number
    budgetVariance: number
    averageDailyCost: number
    accountsAnalyzed: number
  }
  proformaAnalysis?: any
  dataSource?: any
  budgetAnalysis: {
    byAccount: Array<{
      accountId: string
      accountName?: string
      actualCost: number
      budgetedCost: number
      variance: number
      variancePercent: number
      status: 'over' | 'under' | 'on_target'
    }>
    overBudgetAccounts: any[]
    underBudgetAccounts: any[]
  }
  trends: {
    monthOverMonth: any
    dailyAverages: Array<{
      date: string
      cost: number
      cumulativeCost: number
    }>
    costTrends: any
  }
  anomalies: {
    detected: Array<{
      accountId: string
      accountName?: string
      date: string
      cost: number
      expectedCost: number
      deviation: number
      deviationPercent: number
    }>
    threshold: number
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)
  
  // ================================
  // PARAMETER PARSING & VALIDATION
  // ================================
  
  // Validate date parameters - either explicit dates or relative period
  let dateRange: { startDate: string; endDate: string; description?: string }
  try {
    dateRange = validateDateParams({
      startDate: query.startDate as string,
      endDate: query.endDate as string,
      period: query.period as RelativePeriod
    })
  } catch (error) {
    return errors.badRequest(event, (error as Error).message)
  }
  
  // Extract and set defaults for analysis parameters
  const { startDate, endDate } = dateRange
  const granularity = (query.granularity as 'DAILY' | 'MONTHLY') || getRecommendedGranularity(startDate, endDate)
  const groupByDimension = (query.groupBy as string) || 'LINKED_ACCOUNT'
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'
  
  // PROFORMA FLAG: Determines which cost data source to use
  // - false: Master account (raw AWS billing data)
  // - true: Proforma account (Billing Conductor managed costs with savings applied)
  const proforma = query.proforma === 'true' || query.proforma === true
  
  const includeBudget = query.includeBudget !== 'false' && query.includeBudget !== false
  const anomalyThreshold = parseFloat(query.anomalyThreshold as string) || 25
  const includeDecommissioned = query.includeDecommissioned === 'true' || query.includeDecommissioned === true
  
  // Account IDs for cost data sources
  const proformaAccountId = (query.proformaAccountId as string) || process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832' // Billing Conductor account
  const masterAccountId = (query.masterAccountId as string) || process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'     // Master billing account
  
  // Parse and validate account filtering criteria
  const { criteria: accountFilters, errors: filterErrors } = parseAndValidateAccountFilters(query)
  
  // Check for validation errors
  if (filterErrors.length > 0) {
    return errors.badRequest(event, `Invalid account filters: ${filterErrors.join('; ')}`)
  }
  
  // Ensure includeDecommissioned is consistent
  accountFilters.includeDecommissioned = includeDecommissioned
  
  // Validate date format
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
    return errors.badRequest(event, 'Dates must be in YYYY-MM-DD format')
  }
  
  // Validate date range
  const startDateObj = new Date(startDate)
  const endDateObj = new Date(endDate)
  const today = new Date()
  
  if (startDateObj > endDateObj) {
    return errors.badRequest(event, 'Start date must be before or equal to end date')
  }
  
  if (startDateObj > today) {
    return errors.badRequest(event, 'Start date cannot be in the future')
  }
  
  // Validate date range isn't too large (more than 2 years) and calculate duration
  // daysDiff is used later for calculating average daily cost
  const daysDiff = Math.ceil((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24))
  if (daysDiff > 730) {
    return errors.badRequest(event, 'Date range cannot exceed 2 years (730 days)')
  }

  // Validate daily granularity isn't used for too long periods (performance issue)
  if (granularity === 'DAILY' && daysDiff > 90) {
    return errors.badRequest(event, 'Daily granularity is limited to 90 days maximum. Use MONTHLY granularity for longer periods.')
  }
  
  // Validate proforma requirements
  if (proforma && environment !== 'commercial') {
    return errors.badRequest(event, 'Proforma analysis is only available for commercial environment')
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
  
  // Validate anomaly threshold
  if (anomalyThreshold < 0 || anomalyThreshold > 100) {
    return errors.badRequest(event, 'Anomaly threshold must be between 0 and 100')
  }
  
  // Use previously calculated date range for averages
  // daysDiff already calculated above in validation
  
  // Get filtered account IDs only if specific filters are provided
  // Do NOT filter for decommissioned status alone - Cost Explorer handles that naturally
  const filteredAccountIds = (accountFilters.accountIds || accountFilters.linesOfBusiness || accountFilters.departments)
    ? await getAccountIdsFromCriteria(accountFilters)
    : undefined
  
  // Build cost parameters
  const costParams = {
    startDate,
    endDate,
    granularity,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION' as const,
      key: groupByDimension
    }],
    // Add account filter for Cost Explorer only if we have specific accounts
    // Never pass an empty array to AWS Cost Explorer
    filter: filteredAccountIds && filteredAccountIds.length > 0 ? {
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: filteredAccountIds,
        MatchOptions: ['EQUALS']
      }
    } : undefined
  }
  
  // ================================
  // COST DATA RETRIEVAL
  // ================================

  // Generate cache keys
  const costDataCacheKey = `costs:analysis:${JSON.stringify({
    startDate,
    endDate,
    granularity,
    groupByDimension,
    environment,
    proforma,
    proformaAccountId,
    masterAccountId,
    filteredAccountIds: filteredAccountIds ? `${filteredAccountIds.length}:${filteredAccountIds.sort().join(',').substring(0, 100)}` : null // Hash for key uniqueness
  })}`

  const accountDataCacheKey = `accounts:unified:${includeDecommissioned}`

  // Fetch cost data and account metadata in parallel with caching
  const [costData, accountsData] = await Promise.all([
    // Get cost data using appropriate method based on proforma flag
    costCache.getOrSet(
      costDataCacheKey,
      async () => {
        logger.info('Cache miss: Fetching cost data from AWS Cost Explorer...')
        if (proforma) {
          // Use getProformaCosts for proper proforma analysis
          // This gets master account costs, assumes role into proforma account,
          // and calculates master-only costs as: Master Total - Proforma Total
          return await getProformaCosts(costParams, proformaAccountId, masterAccountId)
        } else {
          // Use standard cost explorer for raw AWS billing data
          return await getCostAndUsage(costParams, environment)
        }
      },
      {
        ttl: 900, // 15 minutes for cost data
        tags: [CacheTags.COSTS, environment, proforma ? 'proforma' : 'standard']
      }
    ),

    // Get account metadata for budget analysis with caching (only if budget comparison is requested)
    includeBudget
      ? accountCache.getOrSet(
          accountDataCacheKey,
          async () => {
            logger.info('Cache miss: Fetching unified accounts for budget analysis...')
            return await getAllAccountsUnified(includeDecommissioned)
          },
          {
            ttl: 600, // 10 minutes for account data
            tags: [CacheTags.ACCOUNTS]
          }
        )
      : Promise.resolve([])
  ])
  
  // Validate that we received cost data from AWS
  if (!costData) {
    return errors.notFound(event, 'No cost data found for the specified parameters')
  }

  // Extract cost data - different format depending on proforma flag
  let resultsByTime: any[]
  let proformaBreakdown: any = null

  if (proforma && 'masterAccount' in costData) {
    // getProformaCosts returns a different structure
    // Use billable costs resultsByTime for the main analysis
    resultsByTime = costData.billable.costs.resultsByTime || []
    proformaBreakdown = {
      masterAccount: costData.masterAccount,
      proformaAccount: costData.proforma,
      totals: costData.comparison.totals
    }
  } else if ('resultsByTime' in costData) {
    // Standard getCostAndUsage format
    resultsByTime = costData.resultsByTime || []
  } else {
    resultsByTime = []
  }
  
  // Check if we have any cost data to analyze
  if (!resultsByTime || resultsByTime.length === 0) {
    return errors.notFound(event, 'No cost data found for the specified date range and filters')
  }
  
  // Check if any accounts were found when filters are applied
  // If filters were applied but no accounts found, return early with a clear message
  if (filteredAccountIds !== undefined && filteredAccountIds.length === 0) {
    return errors.notFound(event, 'No accounts found matching the specified filters')
  }
  
  // ================================
  // BUDGET ANALYSIS PREPARATION
  // ================================
  
  // Create account lookup map for enriching budget analysis with account names and budgets
  const accountMap = new Map()
  if (includeBudget && Array.isArray(accountsData)) {
    accountsData.forEach(account => {
      // Map by commercial account ID
      if (account.awsStandardAccountID) {
        accountMap.set(account.awsStandardAccountID, account)
      }
      if (account.accountId) {
        accountMap.set(account.accountId, account)
      }
      // Also add GovCloud mapping for cross-account lookups
      if (account.awsGovCloudAccountID) {
        accountMap.set(account.awsGovCloudAccountID, account)
      }
      if (account.govCloudAccountId) {
        accountMap.set(account.govCloudAccountId, account)
      }
    })
  }
  
  // Extract total cost from the appropriate data source
  // IMPORTANT: Always use the API-provided Total when available to include unallocated costs
  let totalCostAmount = 0

  if (proforma && 'masterAccount' in costData) {
    // For proforma data, use the billable total from the comparison
    totalCostAmount = costData.comparison.totals.billable
  } else if ('total' in costData && costData.total?.['UnblendedCost']?.Amount) {
    // Use the total if available (no grouping)
    totalCostAmount = parseFloat(costData.total['UnblendedCost'].Amount)
  } else if ('resultsByTime' in costData && costData.resultsByTime) {
    // Calculate total from time series data
    costData.resultsByTime.forEach((result: any) => {
      // ALWAYS prefer the Total if available (includes unallocated costs like support, tax, etc.)
      if (result.Total?.['UnblendedCost']?.Amount) {
        totalCostAmount += parseFloat(result.Total['UnblendedCost'].Amount)
      } else if (result.Groups) {
        // Only fall back to summing groups if Total is not available
        // Note: This will miss unallocated costs
        result.Groups.forEach((group: any) => {
          const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
          totalCostAmount += cost
        })
      }
    })
  }
  
  // Initialize budget analysis structure
  const budgetAnalysis = {
    byAccount: [] as any[],
    overBudgetAccounts: [] as any[],
    underBudgetAccounts: [] as any[]
  }
  
  let totalBudget = 0
  
  // ================================
  // BUDGET vs ACTUAL COMPARISON
  // ================================
  
  if (includeBudget && groupByDimension === 'LINKED_ACCOUNT') {
    // Step 1: Aggregate costs by account across all time periods
    // This sums up costs for each account across the entire date range
    const accountCosts = new Map<string, number>()
    
    resultsByTime.forEach((result: any) => {
      result.Groups?.forEach((group: any) => {
        const accountId = group.Keys?.[0]
        const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
        if (accountId) {
          // Accumulate costs per account across all time periods
          accountCosts.set(accountId, (accountCosts.get(accountId) || 0) + cost)
        }
      })
    })
    
    // Step 2: Compare aggregated costs with budgets for each account
    accountCosts.forEach((actualCost, accountId) => {
      const account = accountMap.get(accountId)
      
      // Extract budget from account metadata (stored as estimatedMonthlyCharge)
      const budgetStr = account?.estimatedMonthlyCharge || '0'
      const budgetedCost = parseFloat(budgetStr.replace(/[^0-9.-]/g, '')) || 0
      
      totalBudget += budgetedCost
      
      // Calculate variance and percentage
      const variance = actualCost - budgetedCost
      const variancePercent = budgetedCost > 0 ? (variance / budgetedCost) * 100 : 0
      
      // Determine budget status with 10% tolerance
      let status: 'over' | 'under' | 'on_target' = 'on_target'
      
      if (budgetedCost === 0) {
        // No budget set - any cost is considered over budget
        status = actualCost > 0 ? 'over' : 'on_target'
      } else {
        // Apply 10% tolerance for budget variance
        if (variancePercent > 10) status = 'over'
        else if (variancePercent < -10) status = 'under'
      }
      
      // Create analysis record for this account
      const accountAnalysis = {
        accountId,
        accountName: account?.name || 'Unknown',
        actualCost,          // Cost from selected data source (master or proforma)
        budgetedCost,        // Budget from account metadata
        variance,            // Dollar difference (actual - budget)
        variancePercent,     // Percentage difference
        status               // over/under/on_target based on 10% tolerance
      }
      
      // Add to main list and categorized lists
      budgetAnalysis.byAccount.push(accountAnalysis)
      
      if (status === 'over') {
        budgetAnalysis.overBudgetAccounts.push(accountAnalysis)
      } else if (status === 'under') {
        budgetAnalysis.underBudgetAccounts.push(accountAnalysis)
      }
    })
  }
  
  // ================================
  // TREND ANALYSIS & ANOMALY DETECTION
  // ================================
  
  // Calculate daily cost progression (only for daily granularity)
  const dailyAverages: Array<{date: string, cost: number, cumulativeCost: number}> = []
  let cumulativeCost = 0
  
  if (granularity === 'DAILY') {
    resultsByTime.forEach((result: any) => {
      let dailyCost = parseFloat(result.Total?.['UnblendedCost']?.Amount || '0')

      // If Total is not available (common with grouped data), sum from individual groups
      if (dailyCost === 0 && result.Groups) {
        dailyCost = result.Groups.reduce((sum, group) => {
          const groupCost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
          return sum + (isNaN(groupCost) ? 0 : groupCost)
        }, 0)
      }

      cumulativeCost += dailyCost

      dailyAverages.push({
        date: result.TimePeriod?.Start || '',
        cost: dailyCost,
        cumulativeCost
      })
    })
  }
  
  // Detect cost anomalies using statistical analysis
  // Compares each data point against the average with configurable threshold
  const detectedAnomalies = detectCostAnomalies(resultsByTime, anomalyThreshold)
  const anomalies = {
    detected: detectedAnomalies.map(anomaly => ({
      accountId: 'aggregate',
      accountName: 'All Accounts',
      ...anomaly
    })),
    threshold: anomalyThreshold
  }
  
  // Calculate cost trends (increasing/decreasing/stable patterns)
  const costTrends = calculateCostTrends(resultsByTime)
  
  // Get month-over-month comparison for broader trend context
  // Note: This always uses master account data for consistency in trend analysis
  const monthOverMonth = await getMonthOverMonthChange(environment)
  
  // ================================
  // RESULT ASSEMBLY
  // ================================
  
  // Assemble the comprehensive cost analysis result
  const result: CostAnalysisResult = {
    summary: {
      totalCost: totalCostAmount,                                    // Total from selected data source
      totalBudget,                                                   // Sum of all account budgets
      budgetVariance: totalCostAmount - totalBudget,                 // Overall budget performance
      averageDailyCost: daysDiff > 0 ? totalCostAmount / daysDiff : 0, // Daily spend rate
      accountsAnalyzed: budgetAnalysis.byAccount.length              // Number of accounts in analysis
    },
    budgetAnalysis,     // Account-by-account budget vs actual comparison
    trends: {
      monthOverMonth,   // Month-over-month change from master account
      dailyAverages,    // Daily progression (if daily granularity)
      costTrends        // Statistical trend analysis
    },
    anomalies           // Cost spikes/drops beyond threshold
  }
  
  // ================================
  // DATA SOURCE METADATA
  // ================================

  // Add metadata about which cost data source was used
  if (proforma && 'masterAccount' in costData) {
    result.proformaAnalysis = {
      dataSource: 'proforma-breakdown',
      masterAccount: {
        accountId: masterAccountId,
        costs: costData.comparison.totals.billable
      },
      proformaAccount: {
        accountId: proformaAccountId,
        costs: costData.comparison.totals.proforma
      },
      masterOnlyCosts: costData.masterAccount.unallocatedCost,
      note: 'This analysis shows master account costs minus proforma account costs. ' +
            'This represents the true cost per account after enterprise savings plans ' +
            'and discounts are allocated from the master account based on usage patterns.'
    }
  } else {
    result.dataSource = {
      type: 'master',
      accountId: masterAccountId,
      note: 'This analysis shows raw AWS billing costs from the master account before ' +
            'Billing Conductor processing and savings plan allocation.'
    }
  }
  
  // Add cache performance metadata
  const costCacheInfo = costCache.getEntryInfo(costDataCacheKey)
  const accountCacheInfo = includeBudget ? accountCache.getEntryInfo(accountDataCacheKey) : null
  const costCacheStats = costCache.getStats()
  const accountCacheStats = accountCache.getStats()
  
  const metadata = {
    cache: {
      costData: {
        hit: !!costCacheInfo,
        age: costCacheInfo?.age || null,
        ttl: costCacheInfo?.ttl || null,
        hitRate: `${costCacheStats.hitRate.toFixed(1)}%`
      },
      accountData: includeBudget ? {
        hit: !!accountCacheInfo,
        age: accountCacheInfo?.age || null,
        ttl: accountCacheInfo?.ttl || null,
        hitRate: `${accountCacheStats.hitRate.toFixed(1)}%`
      } : null,
      totalEntries: costCacheStats.entries + accountCacheStats.entries
    },
    performance: {
      analysisTimeMs: Date.now() - startTime,
      accountsProcessed: budgetAnalysis.byAccount.length,
      anomaliesDetected: anomalies.detected.length
    }
  }
  
  return sendSuccess(event, result, metadata)
}))