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
 * - forecastYear: number (default: current year). Its figures are actuals to
 *   date plus the Cost Explorer forecast for the rest of the year.
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
  const excludedAccountIds = new Set([
    process.env.AWS_MASTER_ACCOUNT_ID || '205950196477',
    process.env.AWS_PROFORMA_ACCOUNT_ID || '253821132832'
  ])
  accountsList = accountsList.filter(acc =>
    !excludedAccountIds.has(acc.accountId) &&
    !excludedAccountIds.has(acc.awsStandardAccountID)
  )

  if (accountsList.length === 0) {
    return errors.badRequest(event, 'No accounts match the specified filters')
  }

  logger.info(`[ProformaComparison] Processing ${accountsList.length} accounts`)

  // ==========================================
  // STEP 1: Fetch actuals
  // ==========================================
  // Cost Explorer end dates are exclusive: a calendar year ends on Jan 1 of the
  // next year. "-12-31" silently dropped December 31.

  const fetchActuals = async (startDate: string, endDate: string) => {
    if (startDate >= endDate) return { billable: null, proforma: null }
    const params = {
      startDate,
      endDate,
      granularity: 'MONTHLY' as const,
      metrics: ['UnblendedCost'],
      groupBy: [{ type: 'DIMENSION' as const, key: 'LINKED_ACCOUNT' }]
    }
    if (proforma) {
      const costs = await getProformaCosts(params)
      return { billable: costs.billable.costs, proforma: costs.proforma.costs }
    }
    return { billable: await getCostAndUsage(params, environment), proforma: null }
  }

  const todayDate = new Date().toISOString().slice(0, 10)
  const forecastYearStart = `${forecastYear}-01-01`
  const forecastYearEnd = `${forecastYear + 1}-01-01`
  // The forecast-year figures are actuals to date plus the AWS forecast for the
  // rest of the year. Cost Explorer rejects forecasts that start in the past,
  // which made every forecast for the current year fail and report $0.
  const forecastStartDate = todayDate > forecastYearStart ? todayDate : forecastYearStart
  const actualToDateEnd = forecastStartDate < forecastYearEnd ? forecastStartDate : forecastYearEnd

  logger.info('[ProformaComparison] Fetching actuals...')
  const [historicalActuals, forecastYearActuals] = await Promise.all([
    fetchActuals(`${historicalYear}-01-01`, `${historicalYear + 1}-01-01`),
    fetchActuals(forecastYearStart, actualToDateEnd)
  ])

  // ==========================================
  // STEP 2: Fetch forecast for the rest of the forecast year
  // ==========================================

  logger.info('[ProformaComparison] Fetching forecast data...')

  const accountIds = accountsList.map(acc =>
    environment === 'govcloud'
      ? (acc.govCloudAccountId || acc.awsGovCloudAccountID)
      : (acc.accountId || acc.awsStandardAccountID)
  )

  const hasForecastWindow = forecastStartDate < forecastYearEnd
  const forecastRequests = (isProforma: boolean) => hasForecastWindow
    ? accountIds.map(accountId => ({
        accountId,
        startDate: forecastStartDate,
        endDate: forecastYearEnd,
        metric: 'UNBLENDED_COST',
        granularity: 'MONTHLY' as const,
        proforma: isProforma,
        environment
      }))
    : []
  const batchOptions = { batchSize: 15, delayBetweenBatches: 200, maxRetries: 2 }

  const [billableForecastResults, proformaForecastResults] = await Promise.all([
    batchForecastCalls(forecastRequests(false), batchOptions),
    proforma ? batchForecastCalls(forecastRequests(true), batchOptions) : Promise.resolve([])
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

  // Month keys are YYYY-MM-01. A forecast that starts mid-month shares its
  // month with the actuals before it, so values for one month are summed.
  const monthKey = (date: string) => `${date.slice(0, 7)}-01`
  const addMonthlyActuals = (months: Map<string, number>, data: any, accountId: string) => {
    for (const period of data?.resultsByTime || []) {
      const start = period.TimePeriod?.Start
      if (!start) continue
      const group = period.Groups?.find((g: any) => g.Keys?.[0] === accountId)
      const key = monthKey(start)
      months.set(key, (months.get(key) || 0) + parseFloat(group?.Metrics?.UnblendedCost?.Amount || '0'))
    }
  }
  const addMonthlyForecast = (months: Map<string, number>, results: any[], accountId: string) => {
    const result = results.find(r => r.accountId === accountId)
    if (!result?.success || !result.data) return
    for (const period of result.data.forecastResultsByTime || []) {
      const start = period.TimePeriod?.Start
      if (!start) continue
      const key = monthKey(start)
      months.set(key, (months.get(key) || 0) + parseFloat(period.MeanValue || '0'))
    }
  }
  const toBreakdown = (months: Map<string, number>) => {
    const monthlyBreakdown: MonthlyData[] = [...months.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([month, cost]) => ({ month, cost }))
    return { yearTotal: monthlyBreakdown.reduce((sum, m) => sum + m.cost, 0), monthlyBreakdown }
  }

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

    const billableHistoricalMonths = new Map<string, number>()
    const proformaHistoricalMonths = new Map<string, number>()
    addMonthlyActuals(billableHistoricalMonths, historicalActuals.billable, accountId)
    addMonthlyActuals(proformaHistoricalMonths, historicalActuals.proforma, accountId)

    const billableOutlookMonths = new Map<string, number>()
    const proformaOutlookMonths = new Map<string, number>()
    addMonthlyActuals(billableOutlookMonths, forecastYearActuals.billable, accountId)
    addMonthlyActuals(proformaOutlookMonths, forecastYearActuals.proforma, accountId)
    addMonthlyForecast(billableOutlookMonths, billableForecastResults, accountId)
    addMonthlyForecast(proformaOutlookMonths, proformaForecastResults, accountId)

    const billableHistorical = toBreakdown(billableHistoricalMonths)
    const proformaHistorical = toBreakdown(proformaHistoricalMonths)
    const billableForecast = toBreakdown(billableOutlookMonths)
    const proformaForecast = toBreakdown(proformaOutlookMonths)
    const billableHistoricalMonthly = billableHistorical.monthlyBreakdown
    const proformaHistoricalMonthly = proformaHistorical.monthlyBreakdown
    const billableForecastMonthly = billableForecast.monthlyBreakdown
    const proformaForecastMonthly = proformaForecast.monthlyBreakdown
    const billableHistoricalTotal = billableHistorical.yearTotal
    const proformaHistoricalTotal = proformaHistorical.yearTotal
    const billableForecastTotal = billableForecast.yearTotal
    const proformaForecastTotal = proformaForecast.yearTotal

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
      // Forecast-year totals are actuals before this date plus the forecast from it.
      forecastStartDate: hasForecastWindow ? forecastStartDate : null,
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
