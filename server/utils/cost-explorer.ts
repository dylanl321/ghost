/**
 * Cost Explorer Utility Functions
 * Common operations for AWS Cost Explorer API
 */

import {
  GetCostAndUsageCommand,
  GetCostForecastCommand,
  GetDimensionValuesCommand,
  GetTagsCommand,
  type DateInterval,
  type Granularity,
  type GroupDefinition,
  type Expression
} from '@aws-sdk/client-cost-explorer'
import { getCostExplorerClient } from '../lib/aws-client-factory'
import type { CostExplorerParams } from '../types'

/**
 * Get cost and usage data
 */
export async function getCostAndUsage(
  params: CostExplorerParams,
  environment: 'commercial' | 'govcloud' = 'commercial',
  targetAccountId?: string
) {
  const client = await getCostExplorerClient(environment, undefined, targetAccountId)
  
  const groupBy: GroupDefinition[] | undefined = params.groupBy?.map(group => ({
    Type: group.type,
    Key: group.key
  }))

  const command = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: params.startDate,
      End: params.endDate
    },
    Granularity: params.granularity as Granularity,
    Metrics: params.metrics,
    GroupBy: groupBy,
    Filter: params.filter
  })

  const response = await client.send(command)
  
  return {
    resultsByTime: response.ResultsByTime || [],
    dimensionValueAttributes: response.DimensionValueAttributes || [],
    total: response.Total
  }
}

/**
 * Get cost forecast
 */
export async function getCostForecast(
  startDate: string,
  endDate: string,
  metric: string,
  granularity: 'DAILY' | 'MONTHLY' = 'DAILY',
  filter?: Expression,
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const client = await getCostExplorerClient(environment)
  
  const command = new GetCostForecastCommand({
    TimePeriod: {
      Start: startDate,
      End: endDate
    },
    Metric: metric,
    Granularity: granularity as Granularity,
    Filter: filter
  })

  const response = await client.send(command)
  
  return {
    total: response.Total,
    forecastResultsByTime: response.ForecastResultsByTime || []
  }
}

/**
 * Get available dimension values (e.g., SERVICE, LINKED_ACCOUNT, etc.)
 */
export async function getDimensionValues(
  dimension: string,
  timePeriod: DateInterval,
  searchString?: string,
  filter?: Expression,
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const client = await getCostExplorerClient(environment)
  
  const command = new GetDimensionValuesCommand({
    Dimension: dimension,
    TimePeriod: timePeriod,
    SearchString: searchString,
    Filter: filter
  })

  const response = await client.send(command)
  
  return {
    dimensionValues: response.DimensionValues || [],
    returnSize: response.ReturnSize || 0,
    totalSize: response.TotalSize || 0
  }
}

/**
 * Get available cost allocation tags
 */
export async function getCostAllocationTags(
  timePeriod: DateInterval,
  tagKey?: string,
  filter?: Expression,
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const client = await getCostExplorerClient(environment)
  
  const command = new GetTagsCommand({
    TimePeriod: timePeriod,
    TagKey: tagKey,
    Filter: filter
  })

  const response = await client.send(command)
  
  return {
    tags: response.Tags || [],
    returnSize: response.ReturnSize || 0,
    totalSize: response.TotalSize || 0
  }
}

/**
 * Get costs by service
 */
export async function getCostsByService(
  startDate: string,
  endDate: string,
  granularity: 'DAILY' | 'MONTHLY' = 'MONTHLY',
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  return getCostAndUsage({
    startDate,
    endDate,
    granularity,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION',
      key: 'SERVICE'
    }]
  }, environment)
}

/**
 * Get costs by linked account
 */
export async function getCostsByAccount(
  startDate: string,
  endDate: string,
  granularity: 'DAILY' | 'MONTHLY' = 'MONTHLY',
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  return getCostAndUsage({
    startDate,
    endDate,
    granularity,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION',
      key: 'LINKED_ACCOUNT'
    }]
  }, environment)
}

/**
 * Get costs by region
 */
export async function getCostsByRegion(
  startDate: string,
  endDate: string,
  granularity: 'DAILY' | 'MONTHLY' = 'MONTHLY',
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  return getCostAndUsage({
    startDate,
    endDate,
    granularity,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION',
      key: 'REGION'
    }]
  }, environment)
}

/**
 * Get top spending services
 */
export async function getTopSpendingServices(
  startDate: string,
  endDate: string,
  limit: number = 10,
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const costs = await getCostsByService(startDate, endDate, 'MONTHLY', environment)
  
  // Aggregate costs by service
  const serviceCosts = new Map<string, number>()
  
  costs.resultsByTime.forEach(result => {
    result.Groups?.forEach(group => {
      const service = group.Keys?.[0] || 'Unknown'
      const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
      serviceCosts.set(service, (serviceCosts.get(service) || 0) + cost)
    })
  })
  
  // Sort and limit
  const sorted = Array.from(serviceCosts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([service, cost]) => ({ service, cost }))
  
  return sorted
}

/**
 * Calculate month-over-month cost change
 */
export async function getMonthOverMonthChange(
  environment: 'commercial' | 'govcloud' = 'commercial'
) {
  const now = new Date()
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
  
  const formatDate = (date: Date) => date.toISOString().split('T')[0]
  
  // Get current month costs
  const currentMonthCosts = await getCostAndUsage({
    startDate: formatDate(currentMonthStart),
    endDate: formatDate(now),
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost']
  }, environment)
  
  // Get last month costs
  const lastMonthCosts = await getCostAndUsage({
    startDate: formatDate(lastMonthStart),
    endDate: formatDate(lastMonthEnd),
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost']
  }, environment)
  
  const currentTotal = parseFloat(currentMonthCosts.total?.['UnblendedCost']?.Amount || '0')
  const lastTotal = parseFloat(lastMonthCosts.total?.['UnblendedCost']?.Amount || '0')
  
  const change = currentTotal - lastTotal
  const percentChange = lastTotal > 0 ? (change / lastTotal) * 100 : 0
  
  return {
    currentMonth: currentTotal,
    lastMonth: lastTotal,
    change,
    percentChange
  }
}

/**
 * Get proforma cost data
 * Uses commercial keys to assume role into proforma account and calculates master account costs
 */
export async function getProformaCosts(
  params: CostExplorerParams,
  proformaAccountId: string = '253821132832',
  masterAccountId: string = '205950196477'
) {
  // Always use commercial environment for proforma data
  const environment = 'commercial'
  
  // Get total costs from master account (using base commercial credentials)
  const masterCosts = await getCostAndUsage(params, environment)
  
  // Get costs from proforma account (assume role)
  const proformaClient = await getCostExplorerClient(environment, undefined, proformaAccountId)
  
  const groupBy = params.groupBy?.map(group => ({
    Type: group.type,
    Key: group.key
  }))

  const proformaCommand = new GetCostAndUsageCommand({
    TimePeriod: {
      Start: params.startDate,
      End: params.endDate
    },
    Granularity: params.granularity as Granularity,
    Metrics: params.metrics,
    GroupBy: groupBy,
    Filter: params.filter
  })

  const proformaResponse = await proformaClient.send(proformaCommand)
  const proformaCosts = {
    resultsByTime: proformaResponse.ResultsByTime || [],
    dimensionValueAttributes: proformaResponse.DimensionValueAttributes || [],
    total: proformaResponse.Total
  }
  
  // Calculate master account only costs (total - proforma)
  const masterTotal = parseFloat(masterCosts.total?.['UnblendedCost']?.Amount || '0')
  const proformaTotal = parseFloat(proformaCosts.total?.['UnblendedCost']?.Amount || '0')
  const masterOnlyTotal = masterTotal - proformaTotal
  
  // Calculate master account only costs by time period
  const masterOnlyResultsByTime = masterCosts.resultsByTime.map((masterResult, index) => {
    const proformaResult = proformaCosts.resultsByTime[index]
    
    if (!proformaResult) {
      return masterResult
    }
    
    // Calculate the difference for each group
    const adjustedGroups = masterResult.Groups?.map(masterGroup => {
      const proformaGroup = proformaResult.Groups?.find(
        pg => JSON.stringify(pg.Keys) === JSON.stringify(masterGroup.Keys)
      )
      
      if (!proformaGroup) {
        return masterGroup
      }
      
      // Calculate difference for each metric
      const adjustedMetrics = { ...masterGroup.Metrics }
      Object.keys(adjustedMetrics || {}).forEach(metric => {
        const masterAmount = parseFloat(masterGroup.Metrics?.[metric]?.Amount || '0')
        const proformaAmount = parseFloat(proformaGroup.Metrics?.[metric]?.Amount || '0')
        const difference = masterAmount - proformaAmount
        
        if (adjustedMetrics[metric]) {
          adjustedMetrics[metric] = {
            ...adjustedMetrics[metric],
            Amount: difference.toString()
          }
        }
      })
      
      return {
        ...masterGroup,
        Metrics: adjustedMetrics
      }
    })
    
    // Calculate total for this time period
    const masterPeriodTotal = parseFloat(masterResult.Total?.['UnblendedCost']?.Amount || '0')
    const proformaPeriodTotal = parseFloat(proformaResult.Total?.['UnblendedCost']?.Amount || '0')
    const adjustedPeriodTotal = masterPeriodTotal - proformaPeriodTotal
    
    return {
      ...masterResult,
      Groups: adjustedGroups,
      Total: {
        ...masterResult.Total,
        'UnblendedCost': {
          ...masterResult.Total?.['UnblendedCost'],
          Amount: adjustedPeriodTotal.toString()
        }
      }
    }
  })
  
  return {
    masterAccount: {
      accountId: masterAccountId,
      costs: {
        ...masterCosts,
        resultsByTime: masterOnlyResultsByTime,
        total: {
          ...masterCosts.total,
          'UnblendedCost': {
            ...masterCosts.total?.['UnblendedCost'],
            Amount: masterOnlyTotal.toString()
          }
        }
      }
    },
    proformaAccount: {
      accountId: proformaAccountId,
      costs: proformaCosts
    },
    totals: {
      master: masterTotal,
      proforma: proformaTotal,
      masterOnly: masterOnlyTotal,
      grandTotal: masterTotal
    }
  }
}

/**
 * Detect cost anomalies in time series data
 */
export function detectCostAnomalies(
  resultsByTime: any[],
  thresholdPercent: number = 25
): Array<{
  date: string
  cost: number
  expectedCost: number
  deviation: number
  deviationPercent: number
}> {
  if (resultsByTime.length < 3) {
    return [] // Need at least 3 data points for meaningful anomaly detection
  }

  const costs = resultsByTime.map(result => ({
    date: result.TimePeriod?.Start || '',
    cost: parseFloat(result.Total?.['UnblendedCost']?.Amount || '0')
  }))

  // Calculate moving average (simple baseline)
  const anomalies: any[] = []
  
  for (let i = 2; i < costs.length; i++) {
    // Use previous 2 points as baseline
    const baseline = (costs[i-2].cost + costs[i-1].cost) / 2
    const current = costs[i].cost
    const deviation = current - baseline
    const deviationPercent = baseline > 0 ? Math.abs(deviation / baseline) * 100 : 0

    if (deviationPercent > thresholdPercent) {
      anomalies.push({
        date: costs[i].date,
        cost: current,
        expectedCost: baseline,
        deviation,
        deviationPercent
      })
    }
  }

  return anomalies
}

/**
 * Calculate cost trends and patterns
 */
export function calculateCostTrends(resultsByTime: any[]) {
  if (resultsByTime.length < 2) {
    return {
      trend: 'insufficient_data',
      totalChange: 0,
      averageChange: 0,
      isIncreasing: false,
      isDecreasing: false
    }
  }

  const costs = resultsByTime.map(result => 
    parseFloat(result.Total?.['UnblendedCost']?.Amount || '0')
  )

  const firstCost = costs[0]
  const lastCost = costs[costs.length - 1]
  const totalChange = lastCost - firstCost
  const totalChangePercent = firstCost > 0 ? (totalChange / firstCost) * 100 : 0

  // Calculate period-over-period changes
  const changes: number[] = []
  for (let i = 1; i < costs.length; i++) {
    const change = costs[i] - costs[i-1]
    const changePercent = costs[i-1] > 0 ? (change / costs[i-1]) * 100 : 0
    changes.push(changePercent)
  }

  const averageChange = changes.length > 0 ? changes.reduce((sum, change) => sum + change, 0) / changes.length : 0
  const isIncreasing = averageChange > 5 // More than 5% average increase
  const isDecreasing = averageChange < -5 // More than 5% average decrease

  let trend = 'stable'
  if (isIncreasing) trend = 'increasing'
  else if (isDecreasing) trend = 'decreasing'

  return {
    trend,
    totalChange,
    totalChangePercent,
    averageChange,
    isIncreasing,
    isDecreasing,
    periodChanges: changes
  }
}

/**
 * Enhance cost data with account information and better formatting
 */
export async function enhanceCostData(costData: any, includeDecommissioned: boolean = false) {
  const { getAllAccountsUnified } = await import('./accounts-consolidated')
  
  // Get account data for enrichment
  const accounts = await getAllAccountsUnified(includeDecommissioned)
  const accountMap = new Map()
  
  // Create lookup map by account ID
  accounts.forEach(account => {
    accountMap.set(account.id, account)
    if (account.govId) {
      accountMap.set(account.govId, account)
    }
  })
  
  // Also add any dimension value attributes from Cost Explorer
  const dimensionMap = new Map()
  if (costData.dimensionValueAttributes) {
    costData.dimensionValueAttributes.forEach((attr: any) => {
      dimensionMap.set(attr.Value, attr.Attributes?.description || null)
    })
  }
  
  // Enhanced account summary
  const accountSummary: any[] = []
  const accountTotals = new Map<string, { cost: number, usage: number, periods: number }>()
  
  // Aggregate costs by account across all time periods
  if (costData.resultsByTime) {
    costData.resultsByTime.forEach((result: any) => {
      if (result.Groups) {
        result.Groups.forEach((group: any) => {
          const accountId = group.Keys?.[0]
          if (accountId) {
            const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
            const usage = parseFloat(group.Metrics?.UsageQuantity?.Amount || '0')
            
            const existing = accountTotals.get(accountId) || { cost: 0, usage: 0, periods: 0 }
            accountTotals.set(accountId, {
              cost: existing.cost + cost,
              usage: existing.usage + usage,
              periods: existing.periods + 1
            })
          }
        })
      }
    })
  }
  
  // Build enhanced account summary
  for (const [accountId, totals] of accountTotals.entries()) {
    const account = accountMap.get(accountId)
    const ceDescription = dimensionMap.get(accountId)
    
    accountSummary.push({
      accountId,
      accountName: account?.name || ceDescription || 'Unknown',
      organizationalUnit: account?.organizationalUnitPath || null,
      departmentNumber: account?.departmentNumber || null,
      linesOfBusiness: account?.linesOfBusiness || null,
      enclaveStatus: account?.enclaveStatus || null,
      estimatedMonthlyBudget: account?.estimatedMonthlyCharge || null,
      totalCost: totals.cost,
      totalUsage: totals.usage,
      averageMonthlyCost: totals.periods > 0 ? totals.cost / totals.periods : 0,
      periodsWithData: totals.periods,
      costFormatted: `$${totals.cost.toFixed(2)}`,
      averageCostFormatted: totals.periods > 0 ? `$${(totals.cost / totals.periods).toFixed(2)}` : '$0.00'
    })
  }
  
  // Sort by total cost descending
  accountSummary.sort((a, b) => b.totalCost - a.totalCost)
  
  // Calculate overall summary
  const totalCost = Array.from(accountTotals.values()).reduce((sum, account) => sum + account.cost, 0)
  const totalAccounts = accountTotals.size
  const averageCostPerAccount = totalAccounts > 0 ? totalCost / totalAccounts : 0
  
  // Time period analysis
  const timePeriods = costData.resultsByTime?.map((result: any) => ({
    start: result.TimePeriod?.Start,
    end: result.TimePeriod?.End,
    totalCost: parseFloat(result.Total?.UnblendedCost?.Amount || '0'),
    totalUsage: parseFloat(result.Total?.UsageQuantity?.Amount || '0'),
    accountCount: result.Groups?.length || 0,
    estimated: result.Estimated || false
  })) || []
  
  return {
    summary: {
      totalCost,
      totalCostFormatted: `$${totalCost.toFixed(2)}`,
      totalAccounts,
      averageCostPerAccount,
      averageCostPerAccountFormatted: `$${averageCostPerAccount.toFixed(2)}`,
      periodsAnalyzed: timePeriods.length,
      dateRange: {
        start: timePeriods[0]?.start,
        end: timePeriods[timePeriods.length - 1]?.end
      }
    },
    accounts: accountSummary,
    timePeriods,
    topAccounts: accountSummary.slice(0, 10), // Top 10 by cost
    rawData: {
      resultsByTime: costData.resultsByTime,
      dimensionValueAttributes: costData.dimensionValueAttributes,
      total: costData.total
    }
  }
}