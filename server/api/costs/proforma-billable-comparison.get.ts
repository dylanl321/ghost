/**
 * Proforma vs Billable Comparison API
 * Returns comprehensive comparison data for historical and forecast periods
 *
 * Query Parameters:
 * - proforma: boolean (default: true) - Fetch both billable and proforma data
 * - accountIds: string (optional) - Comma-separated account IDs
 * - lob: string (optional) - Filter by Line of Business
 * - department: string (optional) - Filter by Department
 * - includeDecommissioned: boolean (default: false)
 * - historicalYear: number (default: current year - 1)
 * - forecastYear: number (default: current year)
 * - environment: 'commercial' | 'govcloud' (default: 'commercial')
 */

import { defineEventHandler, getQuery } from 'h3'
import { handleAsync, sendSuccess, errors } from '../../utils/api-response'
import { getCostAndUsage, getProformaCosts } from '../../utils/cost-explorer'
import { batchForecastCalls } from '../../utils/forecast-batcher'
import { getAllAccountsUnified } from '../../utils/accounts-consolidated'
import { logger } from '../../utils/logger'

interface MonthlyData {
  month: string
  cost: number
}

interface AccountComparison {
  accountId: string
  accountName: string
  lob: string
  department: string
  historical: {
    billable: {
      yearTotal: number
      monthlyBreakdown: MonthlyData[]
    }
    proforma: {
      yearTotal: number
      monthlyBreakdown: MonthlyData[]
    }
    savings: {
      yearTotal: number
      savingsPercent: number
    }
  }
  forecast: {
    billable: {
      yearTotal: number
      monthlyBreakdown: MonthlyData[]
    }
    proforma: {
      yearTotal: number
      monthlyBreakdown: MonthlyData[]
    }
    savings: {
      yearTotal: number
      savingsPercent: number
    }
  }
}

export default defineEventHandler(handleAsync(async (event) => {
  const startTime = Date.now()
  const query = getQuery(event)

  // Parse parameters
  const proforma = query.proforma !== 'false'
  const accountIdsParam = query.accountIds as string
  const lob = query.lob as string
  const department = query.department as string
  const includeDecommissioned = query.includeDecommissioned === 'true'
  const currentYear = new Date().getFullYear()
  const historicalYear = parseInt(query.historicalYear as string) || currentYear - 1
  const forecastYear = parseInt(query.forecastYear as string) || currentYear
  const environment = (query.environment as 'commercial' | 'govcloud') || 'commercial'

  logger.info('[ProformaComparison] Starting comparison fetch', {
    proforma,
    historicalYear,
    forecastYear,
    environment,
    hasAccountFilter: !!accountIdsParam,
    hasLobFilter: !!lob,
    hasDepartmentFilter: !!department
  })

  // Fetch accounts list with metadata
  let accountsList = await getAllAccountsUnified(includeDecommissioned)

  // Apply filters
  if (accountIdsParam) {
    const requestedIds = accountIdsParam.split(',')
    accountsList = accountsList.filter(acc =>
      requestedIds.includes(acc.accountId) ||
      requestedIds.includes(acc.awsStandardAccountID) ||
      requestedIds.includes(acc.govCloudAccountId)
    )
  }

  if (lob) {
    accountsList = accountsList.filter(acc =>
      acc.linesOfBusiness?.toLowerCase() === lob.toLowerCase() ||
      acc.lineOfBusiness?.toLowerCase() === lob.toLowerCase()
    )
  }

  if (department) {
    accountsList = accountsList.filter(acc =>
      acc.pepDepartment?.toLowerCase() === department.toLowerCase() ||
      acc.departmentNumber?.toLowerCase() === department.toLowerCase() ||
      acc.department?.toLowerCase() === department.toLowerCase()
    )
  }

  // Filter by environment if specified
  if (environment === 'govcloud') {
    accountsList = accountsList.filter(acc => acc.govCloudAccountId)
  }

  // Filter out master and proforma accounts
  accountsList = accountsList.filter(acc =>
    acc.accountId !== '205950196477' &&
    acc.accountId !== '253821132832' &&
    acc.awsStandardAccountID !== '205950196477' &&
    acc.awsStandardAccountID !== '253821132832'
  )

  if (accountsList.length === 0) {
    return errors.badRequest(event, 'No accounts match the specified filters')
  }

  logger.info(`[ProformaComparison] Processing ${accountsList.length} accounts`)

  // ==========================================
  // STEP 1: Fetch Historical Data (2025)
  // ==========================================

  const historicalStartDate = `${historicalYear}-01-01`
  const historicalEndDate = `${historicalYear}-12-31`

  logger.info('[ProformaComparison] Fetching historical data...')

  let billableHistoricalData: any
  let proformaHistoricalData: any

  if (proforma) {
    // Fetch both billable and proforma using getProformaCosts
    const historicalCosts = await getProformaCosts({
      startDate: historicalStartDate,
      endDate: historicalEndDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
    })

    billableHistoricalData = historicalCosts.billable.costs
    proformaHistoricalData = historicalCosts.proforma.costs
  } else {
    // Fetch only billable
    billableHistoricalData = await getCostAndUsage({
      startDate: historicalStartDate,
      endDate: historicalEndDate,
      granularity: 'MONTHLY',
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION', key: 'LINKED_ACCOUNT' }]
    }, environment)

    proformaHistoricalData = null
  }

  // ==========================================
  // STEP 2: Fetch Forecast Data (2026)
  // ==========================================

  logger.info('[ProformaComparison] Fetching forecast data...')

  const forecastStartDate = `${forecastYear}-01-01`
  const forecastEndDate = `${forecastYear}-12-31`

  // Build forecast requests for each account
  const accountIds = accountsList.map(acc =>
    environment === 'govcloud'
      ? (acc.govCloudAccountId || acc.awsGovCloudAccountID)
      : (acc.accountId || acc.awsStandardAccountID)
  )

  const billableForecastRequests = accountIds.map(accountId => ({
    accountId,
    startDate: forecastStartDate,
    endDate: forecastEndDate,
    metric: 'UNBLENDED_COST',
    granularity: 'MONTHLY' as const,
    proforma: false,
    environment
  }))

  const proformaForecastRequests = proforma ? accountIds.map(accountId => ({
    accountId,
    startDate: forecastStartDate,
    endDate: forecastEndDate,
    metric: 'UNBLENDED_COST',
    granularity: 'MONTHLY' as const,
    proforma: true,
    environment
  })) : []

  // Fetch forecasts in batches
  const [billableForecastResults, proformaForecastResults] = await Promise.all([
    batchForecastCalls(billableForecastRequests, {
      batchSize: 15,
      delayBetweenBatches: 200,
      maxRetries: 2
    }),
    proforma ? batchForecastCalls(proformaForecastRequests, {
      batchSize: 15,
      delayBetweenBatches: 200,
      maxRetries: 2
    }) : Promise.resolve([])
  ])

  logger.info('[ProformaComparison] Forecast fetch complete', {
    billableSuccess: billableForecastResults.filter(r => r.success).length,
    billableFailed: billableForecastResults.filter(r => !r.success).length,
    proformaSuccess: proformaForecastResults.filter(r => r.success).length,
    proformaFailed: proformaForecastResults.filter(r => !r.success).length
  })

  // ==========================================
  // STEP 3: Process and Structure Data
  // ==========================================

  const accountComparisons: AccountComparison[] = []

  for (const account of accountsList) {
    // Use the appropriate account ID based on environment
    const accountId = environment === 'govcloud'
      ? (account.govCloudAccountId || account.awsGovCloudAccountID)
      : (account.accountId || account.awsStandardAccountID)

    // Get account metadata
    const accountName = account.name || account.projectName || account.accountName || accountId
    const accountLob = account.linesOfBusiness || account.lineOfBusiness || ''
    const accountDept = account.departmentNumber || account.department || ''

    // Process historical billable data
    const billableHistoricalMonthly: MonthlyData[] = []
    let billableHistoricalTotal = 0

    if (billableHistoricalData?.resultsByTime) {
      for (const period of billableHistoricalData.resultsByTime) {
        const month = period.TimePeriod?.Start || ''
        const accountGroup = period.Groups?.find((g: any) => g.Keys?.[0] === accountId)
        const cost = parseFloat(accountGroup?.Metrics?.UnblendedCost?.Amount || '0')

        if (month) {
          billableHistoricalMonthly.push({ month, cost })
          billableHistoricalTotal += cost
        }
      }
    }

    // Process historical proforma data
    const proformaHistoricalMonthly: MonthlyData[] = []
    let proformaHistoricalTotal = 0

    if (proformaHistoricalData?.resultsByTime) {
      for (const period of proformaHistoricalData.resultsByTime) {
        const month = period.TimePeriod?.Start || ''
        const accountGroup = period.Groups?.find((g: any) => g.Keys?.[0] === accountId)
        const cost = parseFloat(accountGroup?.Metrics?.UnblendedCost?.Amount || '0')

        if (month) {
          proformaHistoricalMonthly.push({ month, cost })
          proformaHistoricalTotal += cost
        }
      }
    }

    // Process forecast billable data
    const billableForecastResult = billableForecastResults.find(r => r.accountId === accountId)
    const billableForecastMonthly: MonthlyData[] = []
    let billableForecastTotal = 0

    if (billableForecastResult?.success && billableForecastResult.data) {
      billableForecastTotal = parseFloat(billableForecastResult.data.total?.Amount || '0')

      for (const period of billableForecastResult.data.forecastResultsByTime) {
        const month = period.TimePeriod?.Start || ''
        const cost = parseFloat(period.MeanValue || '0')

        if (month) {
          billableForecastMonthly.push({ month, cost })
        }
      }
    }

    // Process forecast proforma data
    const proformaForecastResult = proformaForecastResults.find(r => r.accountId === accountId)
    const proformaForecastMonthly: MonthlyData[] = []
    let proformaForecastTotal = 0

    if (proformaForecastResult?.success && proformaForecastResult.data) {
      proformaForecastTotal = parseFloat(proformaForecastResult.data.total?.Amount || '0')

      for (const period of proformaForecastResult.data.forecastResultsByTime) {
        const month = period.TimePeriod?.Start || ''
        const cost = parseFloat(period.MeanValue || '0')

        if (month) {
          proformaForecastMonthly.push({ month, cost })
        }
      }
    }

    // Calculate savings
    const historicalSavings = billableHistoricalTotal - proformaHistoricalTotal
    const historicalSavingsPercent = billableHistoricalTotal > 0
      ? (historicalSavings / billableHistoricalTotal) * 100
      : 0

    const forecastSavings = billableForecastTotal - proformaForecastTotal
    const forecastSavingsPercent = billableForecastTotal > 0
      ? (forecastSavings / billableForecastTotal) * 100
      : 0

    accountComparisons.push({
      accountId,
      accountName,
      lob: accountLob,
      department: accountDept,
      historical: {
        billable: {
          yearTotal: billableHistoricalTotal,
          monthlyBreakdown: billableHistoricalMonthly
        },
        proforma: {
          yearTotal: proformaHistoricalTotal,
          monthlyBreakdown: proformaHistoricalMonthly
        },
        savings: {
          yearTotal: historicalSavings,
          savingsPercent: historicalSavingsPercent
        }
      },
      forecast: {
        billable: {
          yearTotal: billableForecastTotal,
          monthlyBreakdown: billableForecastMonthly
        },
        proforma: {
          yearTotal: proformaForecastTotal,
          monthlyBreakdown: proformaForecastMonthly
        },
        savings: {
          yearTotal: forecastSavings,
          savingsPercent: forecastSavingsPercent
        }
      }
    })
  }

  // Calculate organization totals
  const totals = {
    [`billable${historicalYear}`]: accountComparisons.reduce((sum, acc) => sum + acc.historical.billable.yearTotal, 0),
    [`proforma${historicalYear}`]: accountComparisons.reduce((sum, acc) => sum + acc.historical.proforma.yearTotal, 0),
    [`savings${historicalYear}`]: accountComparisons.reduce((sum, acc) => sum + acc.historical.savings.yearTotal, 0),
    [`billable${forecastYear}`]: accountComparisons.reduce((sum, acc) => sum + acc.forecast.billable.yearTotal, 0),
    [`proforma${forecastYear}`]: accountComparisons.reduce((sum, acc) => sum + acc.forecast.proforma.yearTotal, 0),
    [`savings${forecastYear}`]: accountComparisons.reduce((sum, acc) => sum + acc.forecast.savings.yearTotal, 0)
  }

  const duration = Date.now() - startTime
  logger.info(`[ProformaComparison] Request completed in ${duration}ms`)

  return sendSuccess(event, {
    accounts: accountComparisons,
    totals,
    metadata: {
      generatedAt: new Date().toISOString(),
      accountsCount: accountComparisons.length,
      historicalYear,
      forecastYear,
      durationMs: duration,
      filters: {
        ...(accountIdsParam && { accountIds: accountIdsParam }),
        ...(lob && { lob }),
        ...(department && { department })
      },
      forecastResults: {
        billableSuccess: billableForecastResults.filter(r => r.success).length,
        billableFailed: billableForecastResults.filter(r => !r.success).length,
        proformaSuccess: proformaForecastResults.filter(r => r.success).length,
        proformaFailed: proformaForecastResults.filter(r => !r.success).length
      }
    }
  })
}))
