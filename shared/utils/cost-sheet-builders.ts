/**
 * Shared Cost Sheet Builders
 * Creates standardized data sheets for cost exports
 * Used by both client and server to ensure identical PDF/Excel outputs
 */

import type { NormalizedDataset } from '~/types/costs'
import type {
  SheetConfig,
  ColumnConfig,
  ExportMetadata
} from '#shared/types/export'

/**
 * Format timeframe to human-readable text
 */
export function formatTimeframe(timeframe: string): string {
  const now = new Date()
  const monthName = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const timeframeMap: Record<string, string> = {
    'thisMonth': `This Month (${monthName})`,
    'lastMonth': 'Last Month',
    'last3Months': 'Last 3 Months',
    'last6Months': 'Last 6 Months',
    'last12Months': 'Last 12 Months',
    'yearToDate': 'Year to Date',
    'lastYear': 'Last Year'
  }

  return timeframeMap[timeframe] || timeframe
}

/**
 * Format scope to human-readable text
 */
export function formatScope(scope: string, count?: number): string {
  const scopeMap: Record<string, string> = {
    'org-wide': 'Organization-Wide (All Accounts)',
    'single-account': `Single Account`,
    'selected-accounts': `${count} Selected Accounts`,
    'department': 'Department View',
    'lob': 'Line of Business View'
  }

  return scopeMap[scope] || scope
}

/**
 * Get account metadata (LOB, Department) from account object or accountsList
 */
function getAccountMetadata(account: any, accountsList: any[]) {
  // Check all possible field names for LOB
  const lob = account.linesOfBusiness ||
              account.lineOfBusiness ||
              account.lob ||
              account.LOB ||
              account.lineofbusiness || ''

  // Check all possible field names for Department
  const department = account.departmentNumber ||
                     account.department ||
                     account.dept ||
                     account.Department ||
                     account.departmentnumber || ''

  // If not found and accountsList is available, try to look up
  if ((!lob || !department) && accountsList && accountsList.length > 0) {
    const foundAccount = accountsList.find((acc: any) =>
      acc.accountId === account.accountId ||
      acc.awsStandardAccountID === account.accountId ||
      acc.awsCommercialAccountID === account.accountId
    )

    return {
      lob: lob || foundAccount?.linesOfBusiness || foundAccount?.lineOfBusiness || '',
      department: department || foundAccount?.departmentNumber || foundAccount?.department || '',
      accountName: account.accountName || foundAccount?.accountName || foundAccount?.projectName || foundAccount?.name || account.accountId
    }
  }

  return {
    lob,
    department,
    accountName: account.accountName || account.projectName || account.name || account.accountId
  }
}


/**
 * Create Current Month Summary Sheet
 */
export function createCurrentMonthSheet(dataset: NormalizedDataset): SheetConfig | null {
  // Get data from budgetAnalysis which has the actual cost and GDMS forecast data
  const analysisData = (dataset.analysis as any)?.data || dataset.analysis
  const byAccount = analysisData?.budgetAnalysis?.byAccount || []

  if (byAccount.length === 0) return null

  // Get YTD data if available
  const ytdSummaryData = (dataset.summary as any)?.data || dataset.summary
  const ytdByAccount = new Map<string, number>()

  if (ytdSummaryData?.resultsByTime) {
    ytdSummaryData.resultsByTime.forEach((result: any) => {
      result.Groups?.forEach((group: any) => {
        const accountId = group.Keys?.[0]
        const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
        if (accountId) {
          ytdByAccount.set(accountId, (ytdByAccount.get(accountId) || 0) + cost)
        }
      })
    })
  }

  // Get current month forecast data if available
  const forecastData = (dataset.forecast as any)?.data || dataset.forecast
  const totalCurrentCost = byAccount.reduce((sum: number, acc: any) => sum + (acc.actualCost || 0), 0)
  const totalForecastRemainder = forecastData?.forecast?.total?.Amount
    ? parseFloat(forecastData.forecast.total.Amount)
    : 0

  // Get year-end forecast if available
  const yearEndForecastData = (dataset.yearEndForecast as any)?.data || dataset.yearEndForecast
  const totalYearEndForecast = yearEndForecastData?.forecast?.total?.Amount
    ? parseFloat(yearEndForecastData.forecast.total.Amount)
    : 0

  const hasYtdData = ytdByAccount.size > 0
  const hasForecastData = totalForecastRemainder > 0 || totalYearEndForecast > 0

  const columns: any[] = [
    { key: 'accountId', header: 'Account ID', format: 'text', width: 20 },
    { key: 'accountName', header: 'Account Name', format: 'text', width: 30 },
    { key: 'department', header: 'Department', format: 'text', width: 15 },
    { key: 'lob', header: 'Line of Business', format: 'text', width: 20 },
    { key: 'totalCost', header: 'Current Cost', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'budget', header: 'GDMS Forecast', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'variance', header: 'Variance', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'utilizationPct', header: 'Utilization %', format: 'percentage', decimals: 1, alignment: 'right', width: 12 }
  ]

  // Add forecast columns if data is available
  if (hasForecastData) {
    columns.push(
      { key: 'endOfMonthForecast', header: 'End of Month Forecast', format: 'currency', decimals: 2, alignment: 'right', width: 18 }
    )
  }

  if (hasYtdData) {
    columns.push(
      { key: 'ytdTotal', header: 'YTD Total', format: 'currency', decimals: 2, alignment: 'right', width: 15 }
    )
  }

  if (hasForecastData && hasYtdData) {
    columns.push(
      { key: 'fullYearEstimate', header: 'Full Year Estimate', format: 'currency', decimals: 2, alignment: 'right', width: 18 }
    )
  }

  const data = byAccount.map((account: any) => {
    const metadata = getAccountMetadata(account, dataset.accountsList || [])
    const totalCost = account.actualCost || 0
    const gdmsForecast = account.budgetedCost || account.budget || 0

    // Calculate proportional end of month forecast
    const proportion = totalCurrentCost > 0 ? totalCost / totalCurrentCost : 0
    const forecastRemainder = totalForecastRemainder * proportion
    const endOfMonthForecast = totalCost + forecastRemainder

    // Get YTD total
    const ytdTotal = ytdByAccount.get(account.accountId) || 0

    // Calculate full year estimate: past months + end of month + future months
    const pastMonthsActual = ytdTotal - totalCost
    const futureMonthsForecast = totalYearEndForecast * proportion
    const fullYearEstimate = pastMonthsActual + endOfMonthForecast + futureMonthsForecast

    const rowData: any = {
      accountId: account.accountId,
      accountName: metadata.accountName,
      department: metadata.department,
      lob: metadata.lob,
      totalCost,
      budget: gdmsForecast,
      variance: totalCost - gdmsForecast,
      utilizationPct: gdmsForecast > 0 ? (totalCost / gdmsForecast) * 100 : 0
    }

    // Add forecast data if available
    if (hasForecastData) {
      rowData.endOfMonthForecast = endOfMonthForecast
    }

    if (hasYtdData) {
      rowData.ytdTotal = ytdTotal
    }

    if (hasForecastData && hasYtdData) {
      rowData.fullYearEstimate = fullYearEstimate
    }

    return rowData
  })

  // Sort by highest current cost first
  data.sort((a: any, b: any) => (b.totalCost || 0) - (a.totalCost || 0))

  return {
    name: 'Current Month Summary',
    type: 'table',
    description: hasYtdData || hasForecastData
      ? `Cost summary for ${formatTimeframe(dataset.timeframe)} (${dataset.mode} mode) with forecast data`
      : `Cost summary for ${formatTimeframe(dataset.timeframe)} (${dataset.mode} mode)`,
    data,
    columns,
    formatting: {
      headerStyle: {
        backgroundColor: '#1e40af',
        textColor: '#ffffff',
        bold: true
      },
      rowStyle: {
        alternateColors: true,
        evenRowColor: '#f9fafb',
        oddRowColor: '#ffffff'
      }
    }
  }
}


/**
 * createServicesSheet
 */
  export function createServicesSheet(dataset: NormalizedDataset): SheetConfig | null {
    if (!dataset.services) return null

    const servicesResponse = (dataset.services as any)?.data || dataset.services
    const isProformaMode = dataset.mode === 'proforma'

    // Extract service costs from resultsByTime
    let resultsByTime: any[] = []

    if (isProformaMode && servicesResponse?.proforma?.resultsByTime) {
      resultsByTime = servicesResponse.proforma.resultsByTime
    } else if (servicesResponse?.resultsByTime) {
      resultsByTime = servicesResponse.resultsByTime
    } else if (servicesResponse?.rawData?.resultsByTime) {
      resultsByTime = servicesResponse.rawData.resultsByTime
    }

    // Aggregate service costs
    const serviceMap = new Map<string, number>()

    resultsByTime.forEach((bucket: any) => {
      if (bucket.Groups) {
        bucket.Groups.forEach((g: any) => {
          const serviceName = g.Keys?.[0] || 'Unknown Service'
          const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
          serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + amount)
        })
      }
    })

    if (serviceMap.size === 0) return null

    // Convert to array and sort
    const data = Array.from(serviceMap.entries())
      .map(([name, cost]) => ({
        serviceName: name.replace(/^AWS\s+/, ''),
        cost
      }))
      .sort((a, b) => b.cost - a.cost)

    const columns: ColumnConfig[] = [
      { key: 'serviceName', header: 'AWS Service', format: 'text', width: 40 },
      { key: 'cost', header: 'Total Cost', format: 'currency', decimals: 2, alignment: 'right', width: 20 }
    ]

    return {
      name: 'AWS Services Breakdown',
      type: 'table',
      description: 'Cost breakdown by AWS service',
      data,
      columns,
      formatting: {
        headerStyle: {
          backgroundColor: '#1e40af',
          textColor: '#ffffff',
          bold: true
        }
      }
    }
  }


/**
 * createHistoricalSheet
 */
  export function createHistoricalSheet(dataset: NormalizedDataset): SheetConfig | null {
    if (!dataset.historical) return null

    const historicalResponse = (dataset.historical as any)?.data || dataset.historical
    const monthlyBreakdown = historicalResponse.monthlyBreakdown || []

    if (monthlyBreakdown.length === 0) return null

    const columns: ColumnConfig[] = [
      { key: 'month', header: 'Month', format: 'text', width: 15 },
      { key: 'cost', header: 'Total Cost', format: 'currency', decimals: 2, alignment: 'right', width: 20 },
      { key: 'accountCount', header: 'Accounts', format: 'number', decimals: 0, alignment: 'right', width: 12 }
    ]

    const data = monthlyBreakdown.map((month: any) => {
      // Count unique accounts - check multiple possible structures
      let accountCount = 0

      if (month.accountBreakdown && Array.isArray(month.accountBreakdown)) {
        accountCount = month.accountBreakdown.length
      } else if (month.accounts && Array.isArray(month.accounts)) {
        accountCount = month.accounts.length
      } else if (dataset.accounts && dataset.accounts.length > 0) {
        // If filtered by accounts, use that count
        accountCount = dataset.accounts.length
      }

      return {
        month: month.month,
        cost: month.cost || 0,
        accountCount
      }
    })

    return {
      name: 'Historical Costs',
      type: 'table',
      description: 'Monthly cost history',
      data,
      columns,
      formatting: {
        headerStyle: {
          backgroundColor: '#1e40af',
          textColor: '#ffffff',
          bold: true
        },
        rowStyle: {
          alternateColors: true,
          evenRowColor: '#f9fafb',
          oddRowColor: '#ffffff'
        }
      }
    }
  }


/**
 * createCurrentMonthDetailSheet
 */
  export function createCurrentMonthDetailSheet(dataset: NormalizedDataset): SheetConfig | null {
    const currentMonthSummary = (dataset.currentMonthOrgWide as any)?.data || dataset.currentMonthOrgWide
    const currentForecast = (dataset.forecast as any)?.data || dataset.forecast
    const mode = dataset.mode

    if (!currentMonthSummary) return null

    const today = new Date()
    const currentMonthName = today.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    const dayOfMonth = today.getDate()

    // Get current month actual (MTD)
    let currentMonthActual = 0
    const selectedAccounts = dataset.accounts || []
    const filterBySelection = selectedAccounts.length > 0

    if (mode === 'proforma' && currentMonthSummary?.proforma?.accounts) {
      const accounts = currentMonthSummary.proforma.accounts
      if (filterBySelection) {
        currentMonthActual = accounts
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      } else {
        currentMonthActual = accounts
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      }
    } else if (currentMonthSummary?.accounts) {
      const accounts = currentMonthSummary.accounts
      if (filterBySelection) {
        currentMonthActual = accounts
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      } else {
        currentMonthActual = accounts
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      }
    }

    // Get remainder forecast
    let remainderForecast = 0
    if (currentForecast?.forecast?.total?.Amount) {
      remainderForecast = parseFloat(currentForecast.forecast.total.Amount)
    }

    const endOfMonthProjection = currentMonthActual + remainderForecast

    const data = [
      { metric: 'Month-to-Date Actual', value: currentMonthActual, description: `Actual costs through day ${dayOfMonth}` },
      { metric: 'Forecast to Month End', value: remainderForecast, description: 'Projected costs for remainder of month' },
      { metric: 'End-of-Month Projection', value: endOfMonthProjection, description: 'Total projected cost for the month' }
    ]

    const columns: ColumnConfig[] = [
      { key: 'metric', header: 'Metric', format: 'text', width: 30 },
      { key: 'value', header: 'Amount', format: 'currency', decimals: 2, alignment: 'right', width: 20 },
      { key: 'description', header: 'Description', format: 'text', width: 50 }
    ]

    return {
      name: 'Current Month Detail',
      type: 'table',
      description: `${currentMonthName} - Actual vs Forecast`,
      data,
      columns,
      formatting: {
        headerStyle: {
          backgroundColor: '#1e40af',
          textColor: '#ffffff',
          bold: true
        }
      }
    }
  }


/**
 * createMonthlyBreakdownSheet
 */
  export function createMonthlyBreakdownSheet(dataset: NormalizedDataset): SheetConfig | null {
    // Only show this for current timeframes, not historical ones
    if (dataset.timeframe !== 'thisMonth' && dataset.timeframe !== 'yearToDate') {
      return null
    }

    const historicalResponse = (dataset.historical as any)?.data || dataset.historical
    const monthlyBreakdown = historicalResponse?.monthlyBreakdown || []
    const currentMonthSummary = (dataset.currentMonthOrgWide as any)?.data || dataset.currentMonthOrgWide
    const currentForecast = (dataset.forecast as any)?.data || dataset.forecast
    const yearEndForecast = (dataset.yearEndForecast as any)?.data || dataset.yearEndForecast
    const mode = dataset.mode

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonthIndex = today.getMonth() // 0-11

    const selectedAccounts = dataset.accounts || []
    const filterBySelection = selectedAccounts.length > 0
    const usingFilteredHistorical = filterBySelection && !!dataset.historical

    // Build historical cost map
    const historicalCostMap = new Map<string, number>()
    monthlyBreakdown.forEach((month: any) => {
      const monthKey = month.month // Format: YYYY-MM
      if (!monthKey.startsWith(String(currentYear))) return // Only current year

      let cost = 0
      if (usingFilteredHistorical) {
        cost = month.cost || 0
      } else if (filterBySelection && month.accountBreakdown && Array.isArray(month.accountBreakdown)) {
        cost = month.accountBreakdown
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, acc: any) => sum + (acc.cost || 0), 0)
      } else {
        cost = month.cost || 0
      }
      historicalCostMap.set(monthKey, cost)
    })

    // Get current month actual
    let currentMonthActual = 0
    if (mode === 'proforma' && currentMonthSummary?.proforma?.accounts) {
      const accounts = currentMonthSummary.proforma.accounts
      if (filterBySelection) {
        currentMonthActual = accounts
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      } else {
        currentMonthActual = accounts
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      }
    } else if (currentMonthSummary?.accounts) {
      const accounts = currentMonthSummary.accounts
      if (filterBySelection) {
        currentMonthActual = accounts
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      } else {
        currentMonthActual = accounts
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      }
    }

    // Get current month remainder forecast
    let remainderForecast = 0
    if (currentForecast?.forecast?.total?.Amount) {
      remainderForecast = parseFloat(currentForecast.forecast.total.Amount)
    }
    const currentMonthEndForecast = currentMonthActual + remainderForecast

    const columns: ColumnConfig[] = [
      { key: 'month', header: 'Month', format: 'text', width: 15 },
      { key: 'actual', header: 'Actual', format: 'currency', decimals: 2, alignment: 'right', width: 18 },
      { key: 'forecast', header: 'Forecast', format: 'currency', decimals: 2, alignment: 'right', width: 18 },
      { key: 'type', header: 'Type', format: 'text', width: 20 }
    ]

    const data: any[] = []

    // Build full year view
    for (let m = 0; m < 12; m++) {
      const date = new Date(currentYear, m, 1)
      const monthKey = `${currentYear}-${String(m + 1).padStart(2, '0')}`
      const monthLabel = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })

      if (m < currentMonthIndex) {
        // Past months - use historical
        const actualCost = historicalCostMap.get(monthKey) || 0
        data.push({
          month: monthLabel,
          actual: actualCost,
          forecast: null,
          type: 'Complete'
        })
      } else if (m === currentMonthIndex) {
        // Current month - show both actual (MTD) and forecast (end of month)
        data.push({
          month: monthLabel,
          actual: currentMonthActual,
          forecast: currentMonthEndForecast,
          type: 'Current (MTD + Forecast)'
        })
      } else {
        // Future months - will be filled from year-end forecast
        data.push({
          month: monthLabel,
          actual: null,
          forecast: null,
          type: 'Future'
        })
      }
    }

    // Fill in future months from year-end forecast
    if (yearEndForecast?.forecast?.forecastResultsByTime) {
      yearEndForecast.forecast.forecastResultsByTime.forEach((period: any) => {
        const dateStr = period?.TimePeriod?.Start || ''
        if (!dateStr) return

        const date = new Date(dateStr + 'T00:00:00Z')
        const monthIndex = date.getUTCMonth()
        const year = date.getUTCFullYear()

        if (year === currentYear && monthIndex > currentMonthIndex) {
          const meanValue = parseFloat(period?.MeanValue || '0')
          if (data[monthIndex]) {
            data[monthIndex].forecast = meanValue
          }
        }
      })
    }

    return {
      name: 'Monthly Breakdown',
      type: 'table',
      description: `${currentYear} Full Year - Actuals and Forecasts`,
      data,
      columns,
      formatting: {
        headerStyle: {
          backgroundColor: '#1e40af',
          textColor: '#ffffff',
          bold: true
        },
        rowStyle: {
          alternateColors: true,
          evenRowColor: '#f9fafb',
          oddRowColor: '#ffffff'
        }
      }
    }
  }


/**
 * createForecastSheet
 */
  export function createForecastSheet(dataset: NormalizedDataset): SheetConfig | null {
    if (!dataset.yearEndForecast) return null

    const forecastResponse = (dataset.yearEndForecast as any)?.data || dataset.yearEndForecast
    const forecastByTime = forecastResponse?.forecast?.forecastResultsByTime || []

    if (forecastByTime.length === 0) return null

    const columns: ColumnConfig[] = [
      { key: 'month', header: 'Month', format: 'text', width: 15 },
      { key: 'forecastCost', header: 'Forecast Cost', format: 'currency', decimals: 2, alignment: 'right', width: 20 },
      { key: 'lowerBound', header: 'Lower Bound', format: 'currency', decimals: 2, alignment: 'right', width: 18 },
      { key: 'upperBound', header: 'Upper Bound', format: 'currency', decimals: 2, alignment: 'right', width: 18 }
    ]

    const data = forecastByTime.map((period: any) => {
      const date = new Date(period?.TimePeriod?.Start || '')
      const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })

      return {
        month: monthLabel,
        forecastCost: parseFloat(period?.MeanValue || '0'),
        lowerBound: period?.PredictionIntervalLowerBound
          ? parseFloat(period.PredictionIntervalLowerBound)
          : null,
        upperBound: period?.PredictionIntervalUpperBound
          ? parseFloat(period.PredictionIntervalUpperBound)
          : null
      }
    })

    return {
      name: 'Cost Forecast',
      type: 'table',
      description: 'Projected costs for upcoming months',
      data,
      columns,
      formatting: {
        headerStyle: {
          backgroundColor: '#1e40af',
          textColor: '#ffffff',
          bold: true
        }
      }
    }
  }


/**
 * createProformaBillableComparisonSheets
 * Creates three sheets: Summary, Monthly Detail, and Account Detail
 */
export function createProformaBillableComparisonSheets(
  data: any[]
): SheetConfig[] {
  const sheets: SheetConfig[] = []

  // Sheet 1: Summary Sheet (Year totals and month totals)
  const summarySheet = createProformaBillableSummarySheet(data)
  if (summarySheet) sheets.push(summarySheet)

  // Sheet 2: Monthly Detail Sheet (all accounts by month)
  const monthlyDetailSheet = createProformaBillableMonthlySheet(data)
  if (monthlyDetailSheet) sheets.push(monthlyDetailSheet)

  // Sheet 3: Account Detail Sheet (per-account breakdown with LOB grouping)
  const accountDetailSheet = createProformaBillableAccountSheet(data)
  if (accountDetailSheet) sheets.push(accountDetailSheet)

  return sheets
}

/**
 * Sheet 1: Summary Sheet - Year totals and month totals
 */
function createProformaBillableSummarySheet(data: any[]): SheetConfig | null {
  if (!data || data.length === 0) return null

  // Calculate overall totals
  let billable2025Total = 0
  let proforma2025Total = 0
  let billable2026Total = 0
  let proforma2026Total = 0

  data.forEach((account) => {
    billable2025Total += account.billable2025 || 0
    proforma2025Total += account.proforma2025 || 0
    billable2026Total += account.billable2026 || 0
    proforma2026Total += account.proforma2026 || 0
  })

  const savings2025Total = billable2025Total - proforma2025Total
  const savings2026Total = billable2026Total - proforma2026Total
  const savingsPercent2025 = billable2025Total > 0
    ? (savings2025Total / billable2025Total) * 100
    : 0
  const savingsPercent2026 = billable2026Total > 0
    ? (savings2026Total / billable2026Total) * 100
    : 0

  // Build month-by-month totals
  const monthlyTotalsMap = new Map<string, { billable: number; proforma: number }>()

  data.forEach((account) => {
    account.monthlyData?.forEach((month: any) => {
      if (!monthlyTotalsMap.has(month.month)) {
        monthlyTotalsMap.set(month.month, { billable: 0, proforma: 0 })
      }
      const monthTotal = monthlyTotalsMap.get(month.month)!
      monthTotal.billable += month.billable || 0
      monthTotal.proforma += month.proforma || 0
    })
  })

  // Convert to sorted array
  const monthlyTotals = Array.from(monthlyTotalsMap.entries())
    .map(([month, totals]) => ({
      month,
      billable: totals.billable,
      proforma: totals.proforma,
      savings: totals.billable - totals.proforma,
      savingsPercent: totals.billable > 0
        ? ((totals.billable - totals.proforma) / totals.billable) * 100
        : 0
    }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // Build summary data
  const summaryData = [
    { category: '2025 TOTALS', metric: 'Billable', value: billable2025Total },
    { category: '2025 TOTALS', metric: 'Proforma', value: proforma2025Total },
    { category: '2025 TOTALS', metric: 'Savings', value: savings2025Total },
    { category: '2025 TOTALS', metric: 'Savings %', value: savingsPercent2025 / 100 },
    { category: '', metric: '', value: null }, // Spacer
    { category: '2026 FORECAST', metric: 'Billable', value: billable2026Total },
    { category: '2026 FORECAST', metric: 'Proforma', value: proforma2026Total },
    { category: '2026 FORECAST', metric: 'Savings', value: savings2026Total },
    { category: '2026 FORECAST', metric: 'Savings %', value: savingsPercent2026 / 100 },
    { category: '', metric: '', value: null }, // Spacer
    { category: 'GRAND TOTAL', metric: 'Billable (2025+2026)', value: billable2025Total + billable2026Total },
    { category: 'GRAND TOTAL', metric: 'Proforma (2025+2026)', value: proforma2025Total + proforma2026Total },
    { category: 'GRAND TOTAL', metric: 'Total Savings', value: savings2025Total + savings2026Total }
  ]

  // Add monthly breakdown
  summaryData.push({ category: '', metric: '', value: null }) // Spacer
  summaryData.push({ category: 'MONTHLY TOTALS', metric: '', value: null }) // Header

  monthlyTotals.forEach((m) => {
    const date = new Date(m.month + '-01')
    const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })

    summaryData.push({ category: monthLabel, metric: 'Billable', value: m.billable })
    summaryData.push({ category: monthLabel, metric: 'Proforma', value: m.proforma })
    summaryData.push({ category: monthLabel, metric: 'Savings', value: m.savings })
    summaryData.push({ category: monthLabel, metric: 'Savings %', value: m.savingsPercent / 100 })
  })

  const columns: ColumnConfig[] = [
    { key: 'category', header: 'Category', format: 'text', width: 25 },
    { key: 'metric', header: 'Metric', format: 'text', width: 30 },
    {
      key: 'value',
      header: 'Amount',
      format: 'currency',
      decimals: 2,
      alignment: 'right',
      width: 20
    }
  ]

  return {
    name: 'Summary',
    type: 'table',
    description: 'Proforma vs Billable Summary - Year and Month Totals. 2025 shows actual costs (YTD). 2026 shows AWS Cost Forecast distributed proportionally to accounts based on their 2025 cost share.',
    data: summaryData,
    columns,
    formatting: {
      headerStyle: {
        backgroundColor: '#1e40af',
        textColor: '#ffffff',
        bold: true
      },
      rowStyle: {
        alternateColors: true,
        evenRowColor: '#f9fafb',
        oddRowColor: '#ffffff'
      }
    }
  }
}

/**
 * Sheet 2: Monthly Detail - All accounts by month with LOB grouping
 */
function createProformaBillableMonthlySheet(data: any[]): SheetConfig | null {
  if (!data || data.length === 0) return null

  // Group by LOB
  const lobGroups = new Map<string, any[]>()

  data.forEach((account) => {
    const lob = account.lob || 'Unassigned'
    if (!lobGroups.has(lob)) {
      lobGroups.set(lob, [])
    }
    lobGroups.get(lob)!.push(account)
  })

  // Get all unique months across all accounts
  const allMonths = new Set<string>()
  data.forEach((account) => {
    account.monthlyData?.forEach((m: any) => allMonths.add(m.month))
  })
  const sortedMonths = Array.from(allMonths).sort()

  // Build columns: Account info + each month (Billable, Proforma, Savings)
  const columns: ColumnConfig[] = [
    { key: 'lob', header: 'LOB', format: 'text', width: 20 },
    { key: 'accountId', header: 'Account ID', format: 'text', width: 18 },
    { key: 'accountName', header: 'Account Name', format: 'text', width: 30 }
  ]

  // Add columns for each month
  sortedMonths.forEach((month) => {
    const date = new Date(month + '-01')
    const monthLabel = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' })

    columns.push({
      key: `${month}_billable`,
      header: `${monthLabel} Billable`,
      format: 'currency',
      decimals: 2,
      alignment: 'right',
      width: 15
    })
    columns.push({
      key: `${month}_proforma`,
      header: `${monthLabel} Proforma`,
      format: 'currency',
      decimals: 2,
      alignment: 'right',
      width: 15
    })
    columns.push({
      key: `${month}_savings`,
      header: `${monthLabel} Savings`,
      format: 'currency',
      decimals: 2,
      alignment: 'right',
      width: 15
    })
  })

  // Build rows grouped by LOB
  const rows: any[] = []

  // Sort LOBs alphabetically
  const sortedLobs = Array.from(lobGroups.keys()).sort()

  sortedLobs.forEach((lob) => {
    const accounts = lobGroups.get(lob)!
    // Sort accounts by name within LOB
    accounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

    accounts.forEach((account) => {
      const row: any = {
        lob: account.lob || 'Unassigned',
        accountId: account.accountId,
        accountName: account.accountName
      }

      // Build monthly data map for quick lookup
      const monthlyMap = new Map<string, any>()
      account.monthlyData?.forEach((m: any) => {
        monthlyMap.set(m.month, m)
      })

      // Fill in each month's data
      sortedMonths.forEach((month) => {
        const monthData = monthlyMap.get(month) || { billable: 0, proforma: 0, savings: 0 }
        row[`${month}_billable`] = monthData.billable
        row[`${month}_proforma`] = monthData.proforma
        row[`${month}_savings`] = monthData.savings
      })

      rows.push(row)
    })

    // Add LOB subtotal row
    const lobSubtotal: any = {
      lob: `${lob} SUBTOTAL`,
      accountId: '',
      accountName: ''
    }

    sortedMonths.forEach((month) => {
      let billableSum = 0
      let proformaSum = 0

      accounts.forEach((account) => {
        const monthData = account.monthlyData?.find((m: any) => m.month === month)
        if (monthData) {
          billableSum += monthData.billable || 0
          proformaSum += monthData.proforma || 0
        }
      })

      lobSubtotal[`${month}_billable`] = billableSum
      lobSubtotal[`${month}_proforma`] = proformaSum
      lobSubtotal[`${month}_savings`] = billableSum - proformaSum
    })

    rows.push(lobSubtotal)
  })

  return {
    name: 'Monthly Detail',
    type: 'table',
    description: 'Month-by-month comparison for all accounts grouped by LOB',
    data: rows,
    columns,
    formatting: {
      headerStyle: {
        backgroundColor: '#1e40af',
        textColor: '#ffffff',
        bold: true
      },
      rowStyle: {
        alternateColors: true,
        evenRowColor: '#f9fafb',
        oddRowColor: '#ffffff'
      }
    }
  }
}

/**
 * Sheet 3: Account Detail - Per-account yearly totals with LOB grouping
 */
function createProformaBillableAccountSheet(data: any[]): SheetConfig | null {
  if (!data || data.length === 0) return null

  // Group by LOB
  const lobGroups = new Map<string, any[]>()

  data.forEach((account) => {
    const lob = account.lob || 'Unassigned'
    if (!lobGroups.has(lob)) {
      lobGroups.set(lob, [])
    }
    lobGroups.get(lob)!.push(account)
  })

  const columns: ColumnConfig[] = [
    { key: 'lob', header: 'LOB', format: 'text', width: 20 },
    { key: 'accountId', header: 'Account ID', format: 'text', width: 18 },
    { key: 'accountName', header: 'Account Name', format: 'text', width: 30 },
    { key: 'billable2025', header: '2025 Billable', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'proforma2025', header: '2025 Proforma', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'savings2025', header: '2025 Savings', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'savingsPercent2025', header: '2025 Savings %', format: 'percentage', decimals: 1, alignment: 'right', width: 12 },
    { key: 'billable2026', header: '2026 Billable', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'proforma2026', header: '2026 Proforma', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'savings2026', header: '2026 Savings', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
    { key: 'savingsPercent2026', header: '2026 Savings %', format: 'percentage', decimals: 1, alignment: 'right', width: 12 }
  ]

  // Build rows grouped by LOB
  const rows: any[] = []

  // Sort LOBs alphabetically
  const sortedLobs = Array.from(lobGroups.keys()).sort()

  sortedLobs.forEach((lob) => {
    const accounts = lobGroups.get(lob)!
    // Sort accounts by name within LOB
    accounts.sort((a, b) => a.accountName.localeCompare(b.accountName))

    // Add account rows
    accounts.forEach((account) => {
      rows.push({
        lob: account.lob || 'Unassigned',
        accountId: account.accountId,
        accountName: account.accountName,
        billable2025: account.billable2025,
        proforma2025: account.proforma2025,
        savings2025: account.savings2025,
        savingsPercent2025: account.savingsPercent2025,
        billable2026: account.billable2026,
        proforma2026: account.proforma2026,
        savings2026: account.savings2026,
        savingsPercent2026: account.savingsPercent2026
      })
    })

    // Add LOB subtotal
    const lobSubtotal = {
      lob: `${lob} SUBTOTAL`,
      accountId: '',
      accountName: '',
      billable2025: accounts.reduce((sum, acc) => sum + (acc.billable2025 || 0), 0),
      proforma2025: accounts.reduce((sum, acc) => sum + (acc.proforma2025 || 0), 0),
      savings2025: accounts.reduce((sum, acc) => sum + (acc.savings2025 || 0), 0),
      savingsPercent2025: 0,
      billable2026: accounts.reduce((sum, acc) => sum + (acc.billable2026 || 0), 0),
      proforma2026: accounts.reduce((sum, acc) => sum + (acc.proforma2026 || 0), 0),
      savings2026: accounts.reduce((sum, acc) => sum + (acc.savings2026 || 0), 0),
      savingsPercent2026: 0
    }

    // Calculate subtotal percentages
    lobSubtotal.savingsPercent2025 = lobSubtotal.billable2025 > 0
      ? (lobSubtotal.savings2025 / lobSubtotal.billable2025) * 100
      : 0
    lobSubtotal.savingsPercent2026 = lobSubtotal.billable2026 > 0
      ? (lobSubtotal.savings2026 / lobSubtotal.billable2026) * 100
      : 0

    rows.push(lobSubtotal)
  })

  // Add grand total row
  const grandTotal = {
    lob: 'GRAND TOTAL',
    accountId: '',
    accountName: '',
    billable2025: data.reduce((sum, acc) => sum + (acc.billable2025 || 0), 0),
    proforma2025: data.reduce((sum, acc) => sum + (acc.proforma2025 || 0), 0),
    savings2025: data.reduce((sum, acc) => sum + (acc.savings2025 || 0), 0),
    savingsPercent2025: 0,
    billable2026: data.reduce((sum, acc) => sum + (acc.billable2026 || 0), 0),
    proforma2026: data.reduce((sum, acc) => sum + (acc.proforma2026 || 0), 0),
    savings2026: data.reduce((sum, acc) => sum + (acc.savings2026 || 0), 0),
    savingsPercent2026: 0
  }

  grandTotal.savingsPercent2025 = grandTotal.billable2025 > 0
    ? (grandTotal.savings2025 / grandTotal.billable2025) * 100
    : 0
  grandTotal.savingsPercent2026 = grandTotal.billable2026 > 0
    ? (grandTotal.savings2026 / grandTotal.billable2026) * 100
    : 0

  rows.push(grandTotal)

  return {
    name: 'Account Detail',
    type: 'table',
    description: 'Per-account breakdown with LOB grouping and yearly totals',
    data: rows,
    columns,
    formatting: {
      headerStyle: {
        backgroundColor: '#1e40af',
        textColor: '#ffffff',
        bold: true
      },
      rowStyle: {
        alternateColors: true,
        evenRowColor: '#f9fafb',
        oddRowColor: '#ffffff'
      }
    }
  }
}


/**
 * createYearEndSummarySheet
 */
  export function createYearEndSummarySheet(dataset: NormalizedDataset): SheetConfig | null {
    if (!dataset.historical && !dataset.yearEndForecast) return null

    const historicalResponse = (dataset.historical as any)?.data || dataset.historical
    const monthlyBreakdown = historicalResponse?.monthlyBreakdown || []
    const currentMonthSummary = (dataset.currentMonthOrgWide as any)?.data || dataset.currentMonthOrgWide
    const currentForecast = (dataset.forecast as any)?.data || dataset.forecast
    const yearEndForecast = (dataset.yearEndForecast as any)?.data || dataset.yearEndForecast
    const mode = dataset.mode

    const today = new Date()
    const currentYear = today.getFullYear()
    const currentMonthIndex = today.getMonth() // 0-11

    const selectedAccounts = dataset.accounts || []
    const filterBySelection = selectedAccounts.length > 0
    const usingFilteredHistorical = filterBySelection && !!dataset.historical

    // Calculate YTD from complete months only (not including current month)
    let ytdActual = 0
    monthlyBreakdown.forEach((month: any) => {
      const year = parseInt(month.month?.split('-')[0] || '0')
      const monthNum = parseInt(month.month?.split('-')[1] || '0') - 1 // 0-11

      if (year === currentYear && monthNum < currentMonthIndex) {
        let cost = 0
        if (usingFilteredHistorical) {
          cost = month.cost || 0
        } else if (filterBySelection && month.accountBreakdown && Array.isArray(month.accountBreakdown)) {
          cost = month.accountBreakdown
            .filter((acc: any) => selectedAccounts.includes(acc.accountId))
            .reduce((sum: number, acc: any) => sum + (acc.cost || 0), 0)
        } else {
          cost = month.cost || 0
        }
        ytdActual += cost
      }
    })

    // Get current month actual (MTD)
    let currentMonthActual = 0
    if (mode === 'proforma' && currentMonthSummary?.proforma?.accounts) {
      const accounts = currentMonthSummary.proforma.accounts
      if (filterBySelection) {
        currentMonthActual = accounts
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      } else {
        currentMonthActual = accounts
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      }
    } else if (currentMonthSummary?.accounts) {
      const accounts = currentMonthSummary.accounts
      if (filterBySelection) {
        currentMonthActual = accounts
          .filter((acc: any) => selectedAccounts.includes(acc.accountId))
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      } else {
        currentMonthActual = accounts
          .reduce((sum: number, account: any) => sum + (account.totalCost || 0), 0)
      }
    }

    // YTD includes complete months + current month MTD
    const yearToDate = ytdActual + currentMonthActual

    // Get current month remainder forecast
    let currentMonthRemainder = 0
    if (currentForecast?.forecast?.total?.Amount) {
      currentMonthRemainder = parseFloat(currentForecast.forecast.total.Amount)
    }

    // Get future months forecast (after current month)
    let futureMonthsForecast = 0
    if (yearEndForecast?.forecast?.forecastResultsByTime) {
      yearEndForecast.forecast.forecastResultsByTime.forEach((period: any) => {
        const dateStr = period?.TimePeriod?.Start || ''
        if (!dateStr) return

        const date = new Date(dateStr + 'T00:00:00Z')
        const monthIndex = date.getUTCMonth()
        const year = date.getUTCFullYear()

        if (year === currentYear && monthIndex > currentMonthIndex) {
          futureMonthsForecast += parseFloat(period?.MeanValue || '0')
        }
      })
    }

    // Year-end projection = YTD + current month remainder + future months
    const yearEndProjection = yearToDate + currentMonthRemainder + futureMonthsForecast

    // Get total GDMS forecast from analysis data
    const analysisData = (dataset.analysis as any)?.data || dataset.analysis
    const byAccount = analysisData?.budgetAnalysis?.byAccount || []
    const monthlyGDMSForecast = byAccount.reduce((sum: number, account: any) => {
      return sum + (account.budgetedCost || account.budget || 0)
    }, 0)

    // Calculate annual GDMS forecast (multiply monthly by 12)
    const annualGDMSForecast = monthlyGDMSForecast > 0 ? monthlyGDMSForecast * 12 : 0

    const data = [
      { metric: 'Year-to-Date Actual', value: yearToDate },
      { metric: '  - Complete Months', value: ytdActual },
      { metric: '  - Current Month (MTD)', value: currentMonthActual },
      { metric: 'Remaining AWS Projection', value: currentMonthRemainder + futureMonthsForecast },
      { metric: '  - Current Month Remainder', value: currentMonthRemainder },
      { metric: '  - Future Months', value: futureMonthsForecast },
      { metric: 'Year-End AWS Projection', value: yearEndProjection },
      { metric: 'Annual GDMS Forecast', value: annualGDMSForecast },
      { metric: 'GDMS Forecast Variance', value: yearEndProjection - annualGDMSForecast }
    ]

    const columns: ColumnConfig[] = [
      { key: 'metric', header: 'Metric', format: 'text', width: 30 },
      { key: 'value', header: 'Amount', format: 'currency', decimals: 2, alignment: 'right', width: 20 }
    ]

    return {
      name: 'Year-End Summary',
      type: 'key-value',
      description: 'Year-end cost projection summary',
      data,
      columns,
      formatting: {
        headerStyle: {
          backgroundColor: '#1e40af',
          textColor: '#ffffff',
          bold: true
        }
      }
    }
  }
