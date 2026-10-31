/**
 * Cost Explorer Utility Functions
 * Common operations for AWS Cost Explorer API
 */

import {
  GetCostAndUsageWithResourcesCommand,
  GetCostForecastCommand,
  GetDimensionValuesCommand,
  GetTagsCommand,
  type DateInterval,
  type Granularity,
  type Expression
} from '@aws-sdk/client-cost-explorer'
import { getCostExplorerClient } from '../lib/aws-client-factory'
import type { CostExplorerParams } from '../types'
import { mergeCostExplorerPeriods, queryBillingDomains, queryCostDataset } from './cost-domain'
import { logger } from './logger'

/** Safe percentage change: returns null when base is 0 and target > 0 (indicates "new" cost) */
function safePercentChange(from: number, to: number): number | null {
  if (from === 0 && to === 0) return 0
  if (from === 0) return null
  return ((to - from) / from) * 100
}

/**
 * Get cost and usage data
 */
export async function getCostAndUsage(
  params: CostExplorerParams,
  environment: 'commercial' | 'govcloud' = 'commercial',
  targetAccountId?: string
) {
  const source = targetAccountId === (process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832')
    ? 'proforma'
    : 'billable'
  return queryCostDataset(params, { environment, source, accountId: targetAccountId })
}

/**
 * Get cost and usage data with resource-level granularity.
 * Uses the separate GetCostAndUsageWithResources API which supports RESOURCE_ID grouping.
 * A Filter is required by this API.
 */
export async function getCostAndUsageWithResources(
  params: {
    startDate: string
    endDate: string
    granularity: 'DAILY' | 'MONTHLY'
    metrics: string[]
    filter: Expression
  },
  environment: 'commercial' | 'govcloud' = 'commercial',
  targetAccountId?: string
) {
  const client = await getCostExplorerClient(environment, undefined, targetAccountId)

  const pages: any[][] = []
  let nextPageToken: string | undefined = undefined

  do {
    const command = new GetCostAndUsageWithResourcesCommand({
      TimePeriod: { Start: params.startDate, End: params.endDate },
      Granularity: params.granularity as Granularity,
      Metrics: params.metrics,
      Filter: params.filter,
      GroupBy: [{ Type: 'DIMENSION', Key: 'RESOURCE_ID' }],
      NextPageToken: nextPageToken
    })

    const response = await client.send(command)
    pages.push(response.ResultsByTime || [])
    nextPageToken = response.NextPageToken

    logger.debug(`CostWithResources pagination: fetched ${response.ResultsByTime?.length || 0} results, nextToken: ${!!nextPageToken}`)
  } while (nextPageToken)

  const allResultsByTime = mergeCostExplorerPeriods(pages)
  logger.info(`CostWithResources total results: ${allResultsByTime.length} time periods`)

  return { resultsByTime: allResultsByTime }
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
  environment: 'commercial' | 'govcloud' = 'commercial',
  targetAccountId?: string,
  options?: { billingViewArn?: string }
) {
  const client = await getCostExplorerClient(environment, undefined, targetAccountId)
  
  const command = new GetCostForecastCommand({
    TimePeriod: {
      Start: startDate,
      End: endDate
    },
    Metric: metric as any,
    Granularity: granularity as Granularity,
    Filter: filter,
    ...(options?.billingViewArn ? { BillingViewArn: options.billingViewArn } : {})
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
    Dimension: dimension as any,
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
  environment: 'commercial' | 'govcloud' = 'commercial',
  targetAccountId?: string,
  options: { limit?: number; nextToken?: string } = {}
) {
  const client = await getCostExplorerClient(environment, undefined, targetAccountId)

  const tags = new Set<string>()
  let returnSize = 0
  let totalSize = 0
  let nextPageToken: string | undefined = options.nextToken

  do {
    const response = await client.send(new GetTagsCommand({
      TimePeriod: timePeriod,
      TagKey: tagKey,
      Filter: filter,
      MaxResults: options.limit ? Math.min(100, Math.max(1, options.limit - tags.size)) : undefined,
      NextPageToken: nextPageToken
    }))

    for (const tag of response.Tags || []) tags.add(tag)
    returnSize += response.ReturnSize || 0
    totalSize = Math.max(totalSize, response.TotalSize || 0)
    nextPageToken = response.NextPageToken
  } while (nextPageToken && (!options.limit || tags.size < options.limit))

  return {
    tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
    returnSize,
    totalSize,
    nextToken: nextPageToken
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
  environment: 'commercial' | 'govcloud' = 'commercial',
  targetAccountId?: string
) {
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const currentStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
  const previousStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1))
  const observedDays = Math.round((today.getTime() - currentStart.getTime()) / 86400000)
  const previousMtdEnd = new Date(Math.min(
    previousStart.getTime() + observedDays * 86400000,
    currentStart.getTime()
  ))
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  const query = (startDate: Date, endDate: Date) => getCostAndUsage({
    startDate: iso(startDate),
    endDate: iso(endDate),
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost']
  }, environment, targetAccountId)
  const [current, priorMtd, priorFull] = await Promise.all([
    query(currentStart, today),
    query(previousStart, previousMtdEnd),
    query(previousStart, currentStart)
  ])
  const currentTotal = parseFloat(current.total?.UnblendedCost?.Amount || '0')
  const previousMonthMtd = parseFloat(priorMtd.total?.UnblendedCost?.Amount || '0')
  const previousMonthFull = parseFloat(priorFull.total?.UnblendedCost?.Amount || '0')
  const change = currentTotal - previousMonthMtd
  const percentChange = safePercentChange(previousMonthMtd, currentTotal)

  return {
    currentMonth: currentTotal,
    lastMonth: previousMonthMtd,
    previousMonthMtd,
    previousMonthFull,
    observedDays,
    change,
    percentChange
  }
}

/**
 * Get proforma forecast data
 * Uses commercial keys to assume role into proforma account and calculates master account forecast
 */
export async function getProformaForecast(
  startDate: string,
  endDate: string,
  metric: string,
  granularity: 'DAILY' | 'MONTHLY' = 'DAILY',
  filter?: Expression,
  proformaAccountId: string = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832',
  masterAccountId: string = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
) {
  // Always use commercial environment for proforma data
  const environment = 'commercial'

  // Run master and proforma forecast fetches in parallel — they hit different AWS accounts
  const [masterForecast, proformaForecast] = await Promise.all([
    getCostForecast(startDate, endDate, metric, granularity, filter, environment, masterAccountId),
    (async () => {
      const proformaClient = await getCostExplorerClient(environment, undefined, proformaAccountId)
      const proformaCommand = new GetCostForecastCommand({
        TimePeriod: {
          Start: startDate,
          End: endDate
        },
        Metric: metric as any,
        Granularity: granularity as Granularity,
        Filter: filter
      })
      const proformaResponse = await proformaClient.send(proformaCommand)
      return {
        total: proformaResponse.Total,
        forecastResultsByTime: proformaResponse.ForecastResultsByTime || []
      }
    })()
  ])

  // Calculate master account only forecast (total - proforma)
  const masterTotal = parseFloat(masterForecast.total?.Amount || '0')
  const proformaTotal = parseFloat(proformaForecast.total?.Amount || '0')
  const masterOnlyTotal = masterTotal - proformaTotal

  // Calculate master account only forecast by time period. Match periods by start
  // date: the two accounts can return different numbers of periods.
  const proformaByStart = new Map(
    proformaForecast.forecastResultsByTime.map(result => [result.TimePeriod?.Start, result])
  )
  const masterOnlyResultsByTime = masterForecast.forecastResultsByTime.map((masterResult) => {
    const proformaResult = proformaByStart.get(masterResult.TimePeriod?.Start)

    if (!proformaResult) {
      return masterResult
    }

    // Calculate difference for each forecast data point
    const masterAmount = parseFloat(masterResult.MeanValue || '0')
    const proformaAmount = parseFloat(proformaResult.MeanValue || '0')
    const difference = masterAmount - proformaAmount

    return {
      ...masterResult,
      MeanValue: difference.toString()
    }
  })

  return {
    masterAccount: {
      accountId: masterAccountId,
      forecast: {
        ...masterForecast,
        total: {
          ...masterForecast.total,
          Amount: masterTotal.toString()
        }
      }
    },
    proformaAccount: {
      accountId: proformaAccountId,
      forecast: proformaForecast
    },
    masterOnlyForecast: {
      total: {
        ...masterForecast.total,
        Amount: masterOnlyTotal.toString()
      },
      forecastResultsByTime: masterOnlyResultsByTime
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
 * Query the two independent AWS billing domains with identical parameters.
 * Billing Conductor's primary view is authoritative for proforma costs; the
 * management account is authoritative for billable costs.
 */
export async function getProformaCosts(
  params: CostExplorerParams,
  proformaAccountId: string = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832',
  masterAccountId: string = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477',
  comparisonMetric: string = 'UnblendedCost'
) {
  const { billable: billableCosts, proforma: proformaCosts } = await queryBillingDomains(
    params,
    proformaAccountId,
    masterAccountId
  )
  const billableTotal = parseFloat(billableCosts.total?.[comparisonMetric]?.Amount || '0')
  const proformaTotal = parseFloat(proformaCosts.total?.[comparisonMetric]?.Amount || '0')
  const periodId = (period: any) => `${period.TimePeriod?.Start || ''}|${period.TimePeriod?.End || ''}`
  const billablePeriods = new Map<string, any>(billableCosts.resultsByTime.map(period => [periodId(period), period]))
  const proformaPeriods = new Map<string, any>(proformaCosts.resultsByTime.map(period => [periodId(period), period]))
  const periods = new Set([...billablePeriods.keys(), ...proformaPeriods.keys()])

  const comparisonByTime = [...periods].sort().map(id => {
    const billablePeriod = billablePeriods.get(id)
    const proformaPeriod = proformaPeriods.get(id)
    const billablePeriodTotal = parseFloat(billablePeriod?.Total?.[comparisonMetric]?.Amount || '0')
    const proformaPeriodTotal = parseFloat(proformaPeriod?.Total?.[comparisonMetric]?.Amount || '0')
    const groupId = (group: any) => JSON.stringify(group.Keys || [])
    const billableGroups = new Map<string, any>((billablePeriod?.Groups || []).map((group: any) => [groupId(group), group]))
    const proformaGroups = new Map<string, any>((proformaPeriod?.Groups || []).map((group: any) => [groupId(group), group]))
    const groups = new Set([...billableGroups.keys(), ...proformaGroups.keys()])
    const accountComparisons = params.groupBy?.some(group => group.key === 'LINKED_ACCOUNT')
      ? [...groups].map(id => {
          const billableGroup: any = billableGroups.get(id)
          const proformaGroup: any = proformaGroups.get(id)
          const accountId = billableGroup?.Keys?.[0] || proformaGroup?.Keys?.[0] || ''
          const billable = parseFloat(billableGroup?.Metrics?.[comparisonMetric]?.Amount || '0')
          const proforma = parseFloat(proformaGroup?.Metrics?.[comparisonMetric]?.Amount || '0')
          return {
            accountId,
            billable,
            proforma,
            difference: proforma - billable,
            percentChange: safePercentChange(billable, proforma)
          }
        })
      : []

    return {
      timePeriod: billablePeriod?.TimePeriod || proformaPeriod?.TimePeriod,
      billable: { total: billablePeriodTotal, groups: billablePeriod?.Groups || [] },
      proforma: { total: proformaPeriodTotal, groups: proformaPeriod?.Groups || [] },
      difference: proformaPeriodTotal - billablePeriodTotal,
      percentChange: safePercentChange(billablePeriodTotal, proformaPeriodTotal),
      accountComparisons
    }
  })

  let enterpriseSupportCost = 0
  if (params.groupBy?.some(group => group.key === 'SERVICE')) {
    for (const period of billableCosts.resultsByTime) {
      for (const group of period.Groups || []) {
        if (group.Keys?.includes('AWS Premium Support') || group.Keys?.includes('AWS Support')) {
          enterpriseSupportCost += parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
        }
      }
    }
  }

  const difference = proformaTotal - billableTotal
  return {
    billable: {
      accountId: masterAccountId,
      costs: billableCosts,
      total: billableTotal,
      dataset: billableCosts.dataset
    },
    proforma: {
      accountId: proformaAccountId,
      costs: proformaCosts,
      total: proformaTotal,
      dataset: proformaCosts.dataset
    },
    masterAccount: {
      accountId: masterAccountId,
      // Compatibility field only: this is a signed cross-domain difference, not an allocation.
      unallocatedCost: billableTotal - proformaTotal,
      enterpriseSupportCost,
      proformaCosts: {
        resultsByTime: [],
        total: {
          UnblendedCost: { Amount: String(billableTotal - proformaTotal), Unit: 'USD' }
        }
      }
    },
    comparison: {
      metric: comparisonMetric,
      byTime: comparisonByTime,
      totals: {
        billable: billableTotal,
        proforma: proformaTotal,
        difference,
        percentChange: safePercentChange(billableTotal, proformaTotal)
      }
    },
    validation: {
      status: 'UNAVAILABLE' as const,
      passed: null,
      message: 'Billable and proforma are independent AWS billing domains; ordering is not a validity rule.',
      billableTotal,
      proformaTotal,
      difference
    },
    datasets: {
      billable: billableCosts.dataset,
      proforma: proformaCosts.dataset
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

  const costs = resultsByTime.map(result => {
    // ALWAYS prefer the Total if available (includes unallocated costs)
    let cost = parseFloat(result.Total?.['UnblendedCost']?.Amount || '0')

    // Only fall back to summing groups if Total is truly not available or is 0
    // Note: This fallback will miss unallocated costs
    if (cost === 0 && result.Groups) {
      cost = result.Groups.reduce((sum, group) => {
        const groupCost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
        return sum + (isNaN(groupCost) ? 0 : groupCost)
      }, 0)
    }

    return {
      date: result.TimePeriod?.Start || '',
      cost: cost
    }
  })

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

  const costs = resultsByTime.map(result => {
    // ALWAYS prefer the Total if available (includes unallocated costs)
    let cost = parseFloat(result.Total?.['UnblendedCost']?.Amount || '0')

    // Only fall back to summing groups if Total is truly not available or is 0
    // Note: This fallback will miss unallocated costs
    if (cost === 0 && result.Groups) {
      cost = result.Groups.reduce((sum, group) => {
        const groupCost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
        return sum + (isNaN(groupCost) ? 0 : groupCost)
      }, 0)
    }

    return cost
  })

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
 * @param groupByDimension - The dimension used for grouping (LINKED_ACCOUNT, SERVICE, REGION)
 */
export async function enhanceCostData(costData: any, includeDecommissioned: boolean = false, groupByDimension: string = 'LINKED_ACCOUNT') {
  const { getAllAccountsUnified } = await import('./accounts-consolidated')

  // Debug: Check if per-period Totals are present
  const hasPerPeriodTotals = costData.resultsByTime?.some((r: any) => r.Total?.UnblendedCost?.Amount)
  logger.info(`[enhanceCostData] Processing cost data:`, {
    periodsCount: costData.resultsByTime?.length || 0,
    hasPerPeriodTotals,
    firstPeriodTotal: costData.resultsByTime?.[0]?.Total?.UnblendedCost?.Amount || 'MISSING',
    firstPeriodGroupsCount: costData.resultsByTime?.[0]?.Groups?.length || 0,
    rootTotal: costData.total?.UnblendedCost?.Amount || 'MISSING',
    groupByDimension
  })

  // Get account data for enrichment
  // Always include decommissioned accounts - costs are real regardless of account status
  const accounts = await getAllAccountsUnified(true)
  const accountMap = new Map()
  
  // Create lookup map by account ID (using correct field names)
  accounts.forEach(account => {
    if (account.accountId) {
      accountMap.set(account.accountId, account)
    }
    if (account.awsStandardAccountID) {
      accountMap.set(account.awsStandardAccountID, account)
    }
    if (account.govCloudAccountId) {
      accountMap.set(account.govCloudAccountId, account)
    }
    if (account.awsGovCloudAccountID) {
      accountMap.set(account.awsGovCloudAccountID, account)
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

  // Track unmatched accounts (accounts in cost data but not in DynamoDB/Organizations)
  let unmatchedCost = 0
  let unmatchedUsage = 0
  const unmatchedAccounts: string[] = []

  // Track decommissioned accounts that still have costs (potential issue)
  let decommissionedCost = 0
  const decommissionedAccountsWithCosts: string[] = []
  
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
  
  // Build enhanced summary based on grouping dimension
  for (const [itemKey, totals] of accountTotals.entries()) {
    let itemData: any = {}

    if (groupByDimension === 'LINKED_ACCOUNT') {
      const account = accountMap.get(itemKey)

      // Accounts missing from DynamoDB/Organizations still cost money: keep them
      // in the list and total (flagged), so the account view totals the same as
      // the service and region views.
      if (!account) {
        unmatchedCost += totals.cost
        unmatchedUsage += totals.usage
        if (!unmatchedAccounts.includes(itemKey)) {
          unmatchedAccounts.push(itemKey)
        }
        logger.warn(`[enhanceCostData] Unmatched account: ${itemKey} (cost: $${totals.cost.toFixed(2)})`)
        accountSummary.push({
          accountId: itemKey,
          accountName: dimensionMap.get(itemKey) || 'Unmatched account',
          organizationalUnit: null,
          departmentNumber: null,
          linesOfBusiness: null,
          enclaveStatus: null,
          estimatedMonthlyBudget: null,
          isDecommissioned: false,
          isUnmatched: true,
          totalCost: totals.cost,
          totalUsage: totals.usage,
          averageMonthlyCost: totals.periods > 0 ? totals.cost / totals.periods : 0,
          periodsWithData: totals.periods,
          costFormatted: `$${totals.cost.toFixed(2)}`,
          averageCostFormatted: totals.periods > 0 ? `$${(totals.cost / totals.periods).toFixed(2)}` : '$0.00'
        })
        continue
      }

      // Check if account is decommissioned
      const isDecommissioned = account.enclaveStatus === 'Decommissioned'

      // Track decommissioned accounts that still have costs
      if (isDecommissioned && totals.cost > 0) {
        decommissionedCost += totals.cost
        if (!decommissionedAccountsWithCosts.includes(itemKey)) {
          decommissionedAccountsWithCosts.push(itemKey)
        }
        logger.warn(`[enhanceCostData] Decommissioned account with costs: ${itemKey} (cost: $${totals.cost.toFixed(2)})`)
      }

      itemData = {
        accountId: itemKey,
        accountName: account.name || 'Unknown',
        organizationalUnit: account.organizationalUnitPath || null,
        departmentNumber: account.pepDepartment || account.departmentNumber || null,
        linesOfBusiness: account.linesOfBusiness || null,
        enclaveStatus: account.enclaveStatus || null,
        estimatedMonthlyBudget: account.estimatedMonthlyCharge || null,
        isDecommissioned,
      }
    } else if (groupByDimension === 'SERVICE') {
      itemData = {
        serviceName: itemKey,
        serviceDescription: dimensionMap.get(itemKey) || itemKey,
      }
    } else if (groupByDimension === 'REGION') {
      itemData = {
        region: itemKey,
        regionDescription: dimensionMap.get(itemKey) || itemKey,
      }
    } else {
      // Generic dimension
      itemData = {
        [groupByDimension.toLowerCase()]: itemKey,
        description: dimensionMap.get(itemKey) || itemKey,
      }
    }
    
    accountSummary.push({
      ...itemData,
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
  // IMPORTANT: Use per-period Totals (not sum of Groups) to include unallocated costs like support, tax, etc.
  let totalCost = 0
  if (costData.resultsByTime && costData.resultsByTime.length > 0) {
    // Sum per-period Totals (includes unallocated costs)
    totalCost = costData.resultsByTime.reduce((sum: number, result: any) => {
      const periodTotal = parseFloat(result.Total?.UnblendedCost?.Amount || '0')
      return sum + periodTotal
    }, 0)
    logger.debug(`[enhanceCostData] Using per-period Totals sum: $${totalCost.toFixed(2)}`)
  } else {
    // Fallback to summing Groups (may miss unallocated costs)
    totalCost = Array.from(accountTotals.values()).reduce((sum, account) => sum + account.cost, 0)
    logger.warn(`[enhanceCostData] Falling back to Groups sum: $${totalCost.toFixed(2)} - per-period Totals not available`)
  }

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
  
  // Determine the appropriate label for the items based on dimension
  const itemsLabel = groupByDimension === 'LINKED_ACCOUNT' ? 'accounts' :
                    groupByDimension === 'SERVICE' ? 'services' :
                    groupByDimension === 'REGION' ? 'regions' :
                    'items'
  
  const topItemsLabel = groupByDimension === 'LINKED_ACCOUNT' ? 'topAccounts' :
                       groupByDimension === 'SERVICE' ? 'topServices' :
                       groupByDimension === 'REGION' ? 'topRegions' :
                       'topItems'
  
  const itemCountLabel = groupByDimension === 'LINKED_ACCOUNT' ? 'totalAccounts' :
                        groupByDimension === 'SERVICE' ? 'totalServices' :
                        groupByDimension === 'REGION' ? 'totalRegions' :
                        'totalItems'
  
  const avgPerItemLabel = groupByDimension === 'LINKED_ACCOUNT' ? 'averageCostPerAccount' :
                         groupByDimension === 'SERVICE' ? 'averageCostPerService' :
                         groupByDimension === 'REGION' ? 'averageCostPerRegion' :
                         'averageCostPerItem'
  
  // Log summary of data quality for visibility
  if (groupByDimension === 'LINKED_ACCOUNT') {
    logger.info(`[enhanceCostData] Account matching summary:`, {
      totalAccountsInCostData: accountTotals.size,
      matchedAccounts: accountSummary.length,
      unmatchedAccounts: unmatchedAccounts.length,
      unmatchedCost: `$${unmatchedCost.toFixed(2)}`,
      unmatchedAccountIds: unmatchedAccounts.slice(0, 5) // Log first 5 for visibility
    })
  }

  // The total is the same for every grouping; unmatched accounts are included
  // and also reported separately below.
  const itemCount = accountSummary.length

  return {
    summary: {
      totalCost: totalCost,
      totalCostFormatted: `$${totalCost.toFixed(2)}`,
      [itemCountLabel]: itemCount,
      [avgPerItemLabel]: itemCount > 0 ? totalCost / itemCount : 0,
      [`${avgPerItemLabel}Formatted`]: itemCount > 0 ? `$${(totalCost / itemCount).toFixed(2)}` : '$0.00',
      periodsAnalyzed: timePeriods.length,
      dateRange: {
        start: timePeriods[0]?.start,
        end: timePeriods[timePeriods.length - 1]?.end
      },
      groupedBy: groupByDimension,
      // Unmatched account tracking (only relevant for LINKED_ACCOUNT grouping)
      ...(groupByDimension === 'LINKED_ACCOUNT' ? {
        unmatchedCost,
        unmatchedCostFormatted: `$${unmatchedCost.toFixed(2)}`,
        unmatchedAccountCount: unmatchedAccounts.length,
        unmatchedAccountIds: unmatchedAccounts,
        // Decommissioned accounts that still have costs (potential issue requiring attention)
        decommissionedCost,
        decommissionedCostFormatted: `$${decommissionedCost.toFixed(2)}`,
        decommissionedAccountCount: decommissionedAccountsWithCosts.length,
        decommissionedAccountIds: decommissionedAccountsWithCosts
      } : {})
    },
    [itemsLabel]: accountSummary,
    timePeriods,
    [topItemsLabel]: accountSummary.slice(0, 10), // Top 10 by cost
    rawData: {
      resultsByTime: costData.resultsByTime,
      dimensionValueAttributes: costData.dimensionValueAttributes,
      total: costData.total
    }
  }
}
