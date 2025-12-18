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
import { logger } from './logger'

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

  // Handle pagination for Cost Explorer API
  let allResultsByTime: any[] = []
  let dimensionValueAttributes: any[] = []
  let total: any = {}
  let nextPageToken: string | undefined = undefined
  
  do {
    const command = new GetCostAndUsageCommand({
      TimePeriod: {
        Start: params.startDate,
        End: params.endDate
      },
      Granularity: params.granularity as Granularity,
      Metrics: params.metrics,
      GroupBy: groupBy,
      Filter: params.filter,
      NextPageToken: nextPageToken
    })

    const response = await client.send(command)
    
    // Accumulate results
    allResultsByTime = allResultsByTime.concat(response.ResultsByTime || [])
    dimensionValueAttributes = dimensionValueAttributes.concat(response.DimensionValueAttributes || [])
    
    // Use the total from the last response (should be consistent across pages)
    if (response.Total) {
      total = response.Total
    }
    
    // Check for next page
    nextPageToken = response.NextPageToken
    
    logger.debug(`Cost Explorer pagination: fetched ${response.ResultsByTime?.length || 0} results, nextToken: ${!!nextPageToken}`)
    
  } while (nextPageToken)
  
  logger.info(`Cost Explorer total results: ${allResultsByTime.length} time periods`)
  
  // IMPORTANT: When using GroupBy, AWS doesn't return a root-level Total
  // We need to make a separate call without GroupBy to get the true total
  if (groupBy && groupBy.length > 0 && Object.keys(total).length === 0) {
    logger.info('GroupBy detected with no root Total - making separate call for total')
    try {
      const totalCommand = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: params.startDate,
          End: params.endDate
        },
        Granularity: params.granularity as Granularity,
        Metrics: params.metrics,
        Filter: params.filter
        // Explicitly NO GroupBy to get the total
      })

      const totalResponse: any = await client.send(totalCommand)

      logger.debug('Separate total call response:', {
        hasResultsByTime: !!totalResponse.ResultsByTime,
        resultsByTimeLength: totalResponse.ResultsByTime?.length || 0,
        firstPeriodHasTotal: !!totalResponse.ResultsByTime?.[0]?.Total
      })

      // AWS doesn't return a root-level Total; we need to sum from ResultsByTime
      if (totalResponse.ResultsByTime && totalResponse.ResultsByTime.length > 0) {
        // Initialize accumulator for each metric
        const accumulatedTotal: any = {}

        // Sum up totals from all time periods AND inject per-period Totals back into allResultsByTime
        totalResponse.ResultsByTime.forEach((result: any, index: number) => {
          if (result.Total) {
            // Inject the per-period Total into the original allResultsByTime structure
            // This fixes the issue where enhanceCostData sums Groups instead of using Totals
            if (allResultsByTime[index]) {
              allResultsByTime[index].Total = result.Total
              logger.debug(`✓ Billable: Injected period ${index} Total: ${result.Total?.UnblendedCost?.Amount}`)
            } else {
              logger.warn(`✗ Billable: Cannot inject period ${index} Total - allResultsByTime[${index}] is undefined`)
            }

            params.metrics.forEach((metric: string) => {
              if (result.Total[metric]?.Amount) {
                if (!accumulatedTotal[metric]) {
                  accumulatedTotal[metric] = {
                    Amount: '0',
                    Unit: result.Total[metric].Unit || 'USD'
                  }
                }
                const currentAmount = parseFloat(accumulatedTotal[metric].Amount)
                const addAmount = parseFloat(result.Total[metric].Amount)
                accumulatedTotal[metric].Amount = (currentAmount + addAmount).toString()
              }
            })
          } else {
            logger.debug(`Billable: Period ${index} has no Total in separate call`)
          }
        })

        if (Object.keys(accumulatedTotal).length > 0) {
          total = accumulatedTotal
          logger.info('✓ Successfully retrieved total from separate call (summed from ResultsByTime):', {
            metrics: Object.keys(accumulatedTotal),
            UnblendedCost: accumulatedTotal.UnblendedCost?.Amount
          })
        } else {
          logger.warn('Separate call returned ResultsByTime but no Totals in periods')
        }
      } else {
        logger.warn('Separate call returned no ResultsByTime')
      }
    } catch (error) {
      logger.warn('Failed to get separate total:', error)
      // Fall back to calculating from resultsByTime
    }
  }
  
  return {
    resultsByTime: allResultsByTime,
    dimensionValueAttributes: dimensionValueAttributes,
    total: total
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
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)

  const formatDate = (date: Date) => date.toISOString().split('T')[0]

  // Determine current month date range
  // AWS requires start < end, so on first day of month, return 0 for current month
  let currentMonthStartDate = currentMonthStart
  let currentMonthEndDate = today
  let skipCurrentMonth = false

  if (currentMonthStart.getTime() === today.getTime()) {
    // First day of month: no meaningful data for current month yet
    skipCurrentMonth = true
  }

  // Get current month costs (or return 0 if it's day 1)
  let currentTotal = 0
  if (!skipCurrentMonth) {
    const currentMonthCosts = await getCostAndUsage({
      startDate: formatDate(currentMonthStartDate),
      endDate: formatDate(currentMonthEndDate),
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost']
    }, environment)
    currentTotal = parseFloat(currentMonthCosts.total?.['UnblendedCost']?.Amount || '0')
  }

  // Get last month costs
  const lastMonthCosts = await getCostAndUsage({
    startDate: formatDate(lastMonthStart),
    endDate: formatDate(lastMonthEnd),
    granularity: 'MONTHLY',
    metrics: ['UnblendedCost']
  }, environment)

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

  // Get master account forecast (using base commercial credentials)
  const masterForecast = await getCostForecast(startDate, endDate, metric, granularity, filter, environment)

  // Get proforma account forecast (assume role)
  const proformaClient = await getCostExplorerClient(environment, undefined, proformaAccountId)

  const proformaCommand = new GetCostForecastCommand({
    TimePeriod: {
      Start: startDate,
      End: endDate
    },
    Metric: metric,
    Granularity: granularity as Granularity,
    Filter: filter
  })

  const proformaResponse = await proformaClient.send(proformaCommand)
  const proformaForecast = {
    total: proformaResponse.Total,
    forecastResultsByTime: proformaResponse.ForecastResultsByTime || []
  }

  // Calculate master account only forecast (total - proforma)
  const masterTotal = parseFloat(masterForecast.total?.Amount || '0')
  const proformaTotal = parseFloat(proformaForecast.total?.Amount || '0')
  const masterOnlyTotal = masterTotal - proformaTotal

  // Calculate master account only forecast by time period
  const masterOnlyResultsByTime = masterForecast.forecastResultsByTime.map((masterResult, index) => {
    const proformaResult = proformaForecast.forecastResultsByTime[index]

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
 * Get proforma cost data with billable comparison
 * Returns both billable and proforma data with validation that proforma >= billable
 * Includes difference calculations and enterprise support cost handling
 */
export async function getProformaCosts(
  params: CostExplorerParams,
  proformaAccountId: string = process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832',
  masterAccountId: string = process.env.AWS_MASTER_ACCOUNT_ID || '205950196477'
) {
  // Always use commercial environment for proforma data
  const environment = 'commercial'
  
  // Get billable costs from master account (using base commercial credentials)
  const billableCosts = await getCostAndUsage(params, environment)
  
  // Get proforma costs from proforma account (assume role)
  const proformaClient = await getCostExplorerClient(environment, undefined, proformaAccountId)

  const groupBy = params.groupBy?.map(group => ({
    Type: group.type,
    Key: group.key
  }))

  // Handle pagination for proforma data (same as billable)
  let allProformaResultsByTime: any[] = []
  let proformaDimensionValueAttributes: any[] = []
  let proformaRootTotal: any = {}
  let proformaNextPageToken: string | undefined = undefined

  do {
    const proformaCommand = new GetCostAndUsageCommand({
      TimePeriod: {
        Start: params.startDate,
        End: params.endDate
      },
      Granularity: params.granularity as Granularity,
      Metrics: params.metrics,
      GroupBy: groupBy,
      Filter: params.filter,
      NextPageToken: proformaNextPageToken
    })

    const proformaResponse: any = await proformaClient.send(proformaCommand)

    // Accumulate results
    allProformaResultsByTime = allProformaResultsByTime.concat(proformaResponse.ResultsByTime || [])
    proformaDimensionValueAttributes = proformaDimensionValueAttributes.concat(proformaResponse.DimensionValueAttributes || [])

    if (proformaResponse.Total) {
      proformaRootTotal = proformaResponse.Total
    }

    proformaNextPageToken = proformaResponse.NextPageToken
    logger.debug(`Proforma pagination: fetched ${proformaResponse.ResultsByTime?.length || 0} results, nextToken: ${!!proformaNextPageToken}`)
  } while (proformaNextPageToken)

  logger.info(`Proforma total results: ${allProformaResultsByTime.length} time periods`)

  let proformaCosts = {
    resultsByTime: allProformaResultsByTime,
    dimensionValueAttributes: proformaDimensionValueAttributes,
    total: proformaRootTotal
  }
  
  // IMPORTANT: When using GroupBy, AWS doesn't return a root-level Total
  // Make a separate call without GroupBy to get the true total for proforma account
  if (groupBy && groupBy.length > 0 && (!proformaRootTotal || Object.keys(proformaRootTotal).length === 0)) {
    logger.info('Proforma: GroupBy detected with no root Total - making separate call for total')
    try {
      const proformaTotalCommand = new GetCostAndUsageCommand({
        TimePeriod: {
          Start: params.startDate,
          End: params.endDate
        },
        Granularity: params.granularity as Granularity,
        Metrics: params.metrics,
        Filter: params.filter
        // Explicitly NO GroupBy to get the total
      })

      const proformaTotalResponse: any = await proformaClient.send(proformaTotalCommand)

      logger.debug('Proforma separate total call response:', {
        hasResultsByTime: !!proformaTotalResponse.ResultsByTime,
        resultsByTimeLength: proformaTotalResponse.ResultsByTime?.length || 0,
        firstPeriodHasTotal: !!proformaTotalResponse.ResultsByTime?.[0]?.Total
      })

      // AWS doesn't return a root-level Total; we need to sum from ResultsByTime (same as billable side)
      if (proformaTotalResponse.ResultsByTime && proformaTotalResponse.ResultsByTime.length > 0) {
        const accumulatedTotal: any = {}

        // Sum up totals from all time periods AND inject per-period Totals back into proformaCosts
        logger.info(`Proforma: About to inject Totals. proformaTotalResponse has ${proformaTotalResponse.ResultsByTime.length} periods, proformaCosts has ${proformaCosts.resultsByTime.length} periods`)

        proformaTotalResponse.ResultsByTime.forEach((result: any, index: number) => {
          if (result.Total) {
            // Inject the per-period Total into the original proformaCosts structure
            // This fixes the issue where enhanceCostData sums Groups instead of using Totals
            if (proformaCosts.resultsByTime[index]) {
              const before = proformaCosts.resultsByTime[index].Total?.UnblendedCost?.Amount
              proformaCosts.resultsByTime[index].Total = result.Total
              logger.info(`✓ Proforma period ${index}: Injected Total ${result.Total?.UnblendedCost?.Amount} (was: ${before || 'NONE'})`)
            } else {
              logger.warn(`✗ Proforma: Cannot inject period ${index} Total - resultsByTime[${index}] is undefined (array length: ${proformaCosts.resultsByTime.length})`)
            }

            params.metrics.forEach((metric: string) => {
              if (result.Total[metric]?.Amount) {
                if (!accumulatedTotal[metric]) {
                  accumulatedTotal[metric] = {
                    Amount: '0',
                    Unit: result.Total[metric].Unit || 'USD'
                  }
                }
                const currentAmount = parseFloat(accumulatedTotal[metric].Amount)
                const addAmount = parseFloat(result.Total[metric].Amount)
                accumulatedTotal[metric].Amount = (currentAmount + addAmount).toString()
              }
            })
          } else {
            logger.debug(`Proforma: Period ${index} has no Total in separate call`)
          }
        })

        if (Object.keys(accumulatedTotal).length > 0) {
          proformaCosts.total = accumulatedTotal
          logger.info('✓ Proforma: Successfully retrieved total from separate call (summed from ResultsByTime):', {
            metrics: Object.keys(accumulatedTotal),
            UnblendedCost: accumulatedTotal.UnblendedCost?.Amount
          })
        } else {
          logger.warn('Proforma: Separate call returned ResultsByTime but no Totals in periods')
        }
      } else {
        logger.warn('Proforma: Separate call returned no ResultsByTime')
      }
    } catch (error) {
      logger.warn('Proforma: Failed to get separate total:', error)
    }
  }
  
  // Calculate totals from both accounts
  let billableTotal = 0
  let proformaTotal = 0

  if (billableCosts.total?.['UnblendedCost']?.Amount) {
    const cost = parseFloat(billableCosts.total['UnblendedCost'].Amount)
    billableTotal = isNaN(cost) ? 0 : cost
  } else if (billableCosts.resultsByTime && billableCosts.resultsByTime.length > 0) {
    // Calculate total from grouped results
    // IMPORTANT: Always use the API-provided Total when available to include unallocated costs
    billableCosts.resultsByTime.forEach((result: any) => {
      // ALWAYS prefer the Total if available (includes unallocated costs)
      if (result.Total?.['UnblendedCost']?.Amount) {
        const cost = parseFloat(result.Total['UnblendedCost'].Amount)
        billableTotal += (isNaN(cost) ? 0 : cost)
      } else if (result.Groups) {
        // Only fall back to summing groups if Total is not available
        // Note: This will miss unallocated costs like support fees, tax, etc.
        // This should rarely happen after fix to sum ResultsByTime totals
        logger.warn('Using Group summation for billable costs (period-level Total not available)', {
          period: result.TimePeriod,
          groupCount: result.Groups.length,
          note: 'Unallocated costs may be missed - ensure separate Total call succeeded'
        })
        result.Groups.forEach((group: any) => {
          const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
          billableTotal += (isNaN(cost) ? 0 : cost)
        })
      }
    })
  }

  if (proformaCosts.total?.['UnblendedCost']?.Amount) {
    const cost = parseFloat(proformaCosts.total['UnblendedCost'].Amount)
    proformaTotal = isNaN(cost) ? 0 : cost
  } else if (proformaCosts.resultsByTime && proformaCosts.resultsByTime.length > 0) {
    // Calculate total from grouped results
    // IMPORTANT: Always use the API-provided Total when available to include unallocated costs
    proformaCosts.resultsByTime.forEach((result: any) => {
      // ALWAYS prefer the Total if available (includes unallocated costs)
      if (result.Total?.['UnblendedCost']?.Amount) {
        const cost = parseFloat(result.Total['UnblendedCost'].Amount)
        proformaTotal += (isNaN(cost) ? 0 : cost)
      } else if (result.Groups) {
        // Only fall back to summing groups if Total is not available
        // Note: This will miss unallocated costs like support fees, tax, etc.
        // This should rarely happen after fix to sum ResultsByTime totals
        logger.warn('Using Group summation for proforma costs (period-level Total not available)', {
          period: result.TimePeriod,
          groupCount: result.Groups.length,
          note: 'Unallocated costs may be missed - ensure separate Total call succeeded'
        })
        result.Groups.forEach((group: any) => {
          const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
          proformaTotal += (isNaN(cost) ? 0 : cost)
        })
      }
    })
  }

  // Master account's unallocated cost = billable total - proforma total
  // This represents costs that remain in the master account after Billing Conductor allocation
  const masterUnallocatedCost = Math.max(0, billableTotal - proformaTotal)
  
  logger.info(`Proforma calculation:
    Master Account Total (billable): $${billableTotal.toFixed(2)}
    Proforma Account Total: $${proformaTotal.toFixed(2)}
    Master Unallocated: $${masterUnallocatedCost.toFixed(2)}
    Formula: $${billableTotal.toFixed(2)} - $${proformaTotal.toFixed(2)} = $${masterUnallocatedCost.toFixed(2)}`)
  
  // Extract enterprise support costs if grouped by SERVICE
  let enterpriseSupportCost = 0
  const hasServiceGrouping = params.groupBy?.some(g => g.type === 'DIMENSION' && g.key === 'SERVICE')
  
  if (hasServiceGrouping && billableCosts.resultsByTime) {
    billableCosts.resultsByTime.forEach((result: any) => {
      if (result.Groups) {
        result.Groups.forEach((group: any) => {
          // Check if this is AWS Premium Support service
          if (group.Keys?.includes('AWS Premium Support') || group.Keys?.includes('AWS Support')) {
            const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
            enterpriseSupportCost += isNaN(cost) ? 0 : cost
          }
        })
      }
    })
  }
  
  // Create comparison data for each time period
  const comparisonByTime = billableCosts.resultsByTime.map((billableResult, index) => {
    const proformaResult = proformaCosts.resultsByTime[index]
    
    // Calculate period totals
    const billablePeriodTotal = parseFloat(billableResult.Total?.['UnblendedCost']?.Amount || '0')
    const proformaPeriodTotal = parseFloat(proformaResult?.Total?.['UnblendedCost']?.Amount || '0')
    const periodDifference = proformaPeriodTotal - billablePeriodTotal
    
    // Validate proforma vs billable for this period
    // Note: Proforma should typically be >= billable (savings plans allocated to accounts)
    // Warn if proforma is significantly lower (may indicate allocation issues)
    if (proformaPeriodTotal < billablePeriodTotal && Math.abs(periodDifference) > billablePeriodTotal * 0.05) {
      logger.warn(`⚠️ Period ${billableResult.TimePeriod?.Start}: Proforma ($${proformaPeriodTotal.toFixed(2)}) < Billable ($${billablePeriodTotal.toFixed(2)}) - Check if savings plans are being allocated`)
    }
    
    // Build account-level comparison if grouped by account
    let accountComparisons = []
    if (params.groupBy?.some(g => g.key === 'LINKED_ACCOUNT')) {
      const proformaAccountMap = new Map()
      proformaResult?.Groups?.forEach(group => {
        if (group.Keys?.[0]) {
          proformaAccountMap.set(group.Keys[0], parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0'))
        }
      })
      
      billableResult.Groups?.forEach(billableGroup => {
        const accountId = billableGroup.Keys?.[0]
        if (accountId) {
          const billableCost = parseFloat(billableGroup.Metrics?.['UnblendedCost']?.Amount || '0')
          const proformaCost = proformaAccountMap.get(accountId) || 0
          const difference = proformaCost - billableCost
          const percentChange = billableCost > 0 ? (difference / billableCost) * 100 : 0
          
          // Validation: For individual linked accounts, proforma should be >= billable
          // (Billing Conductor allocates savings plan costs to accounts that benefit from them)
          // Proforma < Billable indicates savings plans may not be allocated properly
          if (accountId !== masterAccountId && accountId !== proformaAccountId && proformaCost < billableCost && Math.abs(difference) > 5) {
            logger.debug(`Account ${accountId}: Proforma ($${proformaCost.toFixed(2)}) < Billable ($${billableCost.toFixed(2)}) - Savings plan allocation may be incomplete`)
          }
          
          accountComparisons.push({
            accountId,
            billable: billableCost,
            proforma: proformaCost,
            difference,
            percentChange
          })
        }
      })
    }
    
    return {
      timePeriod: billableResult.TimePeriod,
      billable: {
        total: billablePeriodTotal,
        groups: billableResult.Groups
      },
      proforma: {
        total: proformaPeriodTotal,
        groups: proformaResult?.Groups || []
      },
      difference: periodDifference,
      percentChange: billablePeriodTotal > 0 ? (periodDifference / billablePeriodTotal) * 100 : 0,
      accountComparisons
    }
  })
  
  // Create synthetic master account cost structure for proforma view
  const masterProformaResultsByTime = billableCosts.resultsByTime.map((billableResult, index) => {
    const proformaResult = proformaCosts.resultsByTime[index]
    
    const billablePeriodTotal = parseFloat(billableResult.Total?.['UnblendedCost']?.Amount || '0')
    const proformaPeriodTotal = parseFloat(proformaResult?.Total?.['UnblendedCost']?.Amount || '0')
    const masterUnallocatedPeriodCost = Math.max(0, billablePeriodTotal - proformaPeriodTotal)
    
    const masterAccountGroup = {
      Keys: [masterAccountId],
      Attributes: {},
      Metrics: {
        'UnblendedCost': {
          Amount: masterUnallocatedPeriodCost.toString(),
          Unit: 'USD'
        },
        'UsageQuantity': {
          Amount: '0',
          Unit: 'N/A'
        }
      }
    }
    
    return {
      ...billableResult,
      Groups: masterUnallocatedPeriodCost > 0 ? [masterAccountGroup] : [],
      Total: {
        ...billableResult.Total,
        'UnblendedCost': {
          ...billableResult.Total?.['UnblendedCost'],
          Amount: masterUnallocatedPeriodCost.toString()
        }
      }
    }
  })
  
  // Overall validation
  // Expected: Proforma >= Billable (savings plans allocated to accounts increase their costs)
  // Exception: Master account unallocated costs (support, overhead) stay in billable side
  const masterUnallocated = billableTotal - proformaTotal

  // Validation passes if proforma >= billable OR difference is small (< 5% of billable)
  const validationPassed = proformaTotal >= billableTotal || Math.abs(masterUnallocated) < billableTotal * 0.05

  const overallValidation = {
    passed: validationPassed,
    message: validationPassed
      ? `✅ Proforma allocation validated: Billable ($${billableTotal.toFixed(2)}) → Proforma ($${proformaTotal.toFixed(2)}) | Master Unallocated: $${masterUnallocated.toFixed(2)}`
      : `⚠️ Proforma validation issue: Proforma ($${proformaTotal.toFixed(2)}) < Billable ($${billableTotal.toFixed(2)}) by $${Math.abs(masterUnallocated).toFixed(2)} - Check savings plan allocation`,
    billableTotal,
    proformaTotal,
    masterUnallocated,
    savingsAllocated: proformaTotal - billableTotal, // Positive = savings allocated to accounts
    allocationPercent: billableTotal > 0 ? ((proformaTotal - billableTotal) / billableTotal) * 100 : 0
  }
  
  return {
    billable: {
      accountId: masterAccountId,
      costs: billableCosts,
      total: billableTotal
    },
    proforma: {
      accountId: proformaAccountId,
      costs: proformaCosts,
      total: proformaTotal
    },
    masterAccount: {
      accountId: masterAccountId,
      unallocatedCost: masterUnallocatedCost,
      enterpriseSupportCost,
      proformaCosts: {
        resultsByTime: masterProformaResultsByTime,
        total: {
          'UnblendedCost': {
            Amount: masterUnallocatedCost.toString(),
            Unit: 'USD'
          }
        }
      }
    },
    comparison: {
      byTime: comparisonByTime,
      totals: {
        billable: billableTotal,
        proforma: proformaTotal,
        difference: proformaTotal - billableTotal,
        percentChange: billableTotal > 0 ? ((proformaTotal - billableTotal) / billableTotal) * 100 : 0
      }
    },
    validation: overallValidation
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

      // Filter out accounts not in DynamoDB/Organizations (ghost accounts)
      if (!account) {
        unmatchedCost += totals.cost
        unmatchedUsage += totals.usage
        if (!unmatchedAccounts.includes(itemKey)) {
          unmatchedAccounts.push(itemKey)
        }
        logger.warn(`[enhanceCostData] Skipping unmatched account: ${itemKey} (cost: $${totals.cost.toFixed(2)})`)
        continue  // Skip ghost accounts - don't add to accountSummary
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
        departmentNumber: account.departmentNumber || null,
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

  // Calculate matched accounts stats (for LINKED_ACCOUNT grouping)
  const matchedTotalCost = groupByDimension === 'LINKED_ACCOUNT'
    ? accountSummary.reduce((sum, acc) => sum + acc.totalCost, 0)
    : totalCost
  const matchedAccountCount = accountSummary.length

  return {
    summary: {
      totalCost: matchedTotalCost,
      totalCostFormatted: `$${matchedTotalCost.toFixed(2)}`,
      [itemCountLabel]: matchedAccountCount,
      [avgPerItemLabel]: matchedAccountCount > 0 ? matchedTotalCost / matchedAccountCount : 0,
      [`${avgPerItemLabel}Formatted`]: matchedAccountCount > 0 ? `$${(matchedTotalCost / matchedAccountCount).toFixed(2)}` : '$0.00',
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