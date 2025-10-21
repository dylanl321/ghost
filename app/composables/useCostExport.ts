/**
 * Cost Data Export Composable
 * Creates export configurations specifically for cost data
 */

import { computed } from 'vue'
import type { NormalizedDataset } from '~/types/costs'
import type {
  DataExportConfig,
  SheetConfig,
  ColumnConfig,
  ExportFormat,
  ExportMetadata
} from '~/shared/types/export'

export function useCostExport(dataset: NormalizedDataset) {
  const { exportData, exportMultipleFormats, isExporting } = useDataExport()
  const { user } = useOidcAuth()

  /**
   * Format timeframe to human-readable text
   */
  function formatTimeframe(timeframe: string): string {
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
  function formatScope(scope: string, count?: number): string {
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
   * Create export metadata from dataset
   */
  function createMetadata(): ExportMetadata {
    const selectedAccountsCount = dataset.accounts?.length || 0
    const scope = selectedAccountsCount === 0
      ? 'org-wide'
      : selectedAccountsCount === 1
        ? 'single-account'
        : 'selected-accounts'

    // Get user name from session
    const userName = user.value?.claims?.name || user.value?.claims?.given_name || user.value?.claims?.email || 'Unknown User'

    return {
      generatedBy: `${userName} via GHOST Cost Dashboard`,
      timestamp: new Date().toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      }),
      timeframe: formatTimeframe(dataset.timeframe),
      mode: dataset.mode.charAt(0).toUpperCase() + dataset.mode.slice(1),
      scope: formatScope(scope, selectedAccountsCount),
      selectedAccounts: dataset.accounts,
      selectedAccountsCount: selectedAccountsCount > 0 ? selectedAccountsCount : undefined,
      filters: {
        'Data Mode': dataset.mode === 'billable' ? 'Billable (Actual Costs)' : 'Pro-forma (With Savings Plans)',
        'Time Period': formatTimeframe(dataset.timeframe)
      }
    }
  }

  /**
   * Get account metadata (LOB, Department) from account object or accountsList
   */
  function getAccountMetadata(account: any) {
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
    if ((!lob || !department) && dataset.accountsList && dataset.accountsList.length > 0) {
      const foundAccount = dataset.accountsList.find((acc: any) =>
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
  function createCurrentMonthSheet(): SheetConfig | null {
    // Get data from budgetAnalysis which has the actual cost and budget data
    const analysisData = (dataset.analysis as any)?.data || dataset.analysis
    const byAccount = analysisData?.budgetAnalysis?.byAccount || []

    if (byAccount.length === 0) return null

    // Get YTD data if available
    const ytdSummaryData = (dataset.ytdSummary as any)?.data || dataset.ytdSummary
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

    const columns: ColumnConfig[] = [
      { key: 'accountId', header: 'Account ID', format: 'text', width: 20 },
      { key: 'accountName', header: 'Account Name', format: 'text', width: 30 },
      { key: 'department', header: 'Department', format: 'text', width: 15 },
      { key: 'lob', header: 'Line of Business', format: 'text', width: 20 },
      { key: 'totalCost', header: 'Current Cost', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
      { key: 'budget', header: 'Budget', format: 'currency', decimals: 2, alignment: 'right', width: 15 },
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
      const metadata = getAccountMetadata(account)
      const totalCost = account.actualCost || 0
      const budget = account.budgetedCost || account.budget || 0

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
        budget,
        variance: totalCost - budget,
        utilizationPct: budget > 0 ? (totalCost / budget) * 100 : 0
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

    return {
      name: 'Current Month Summary',
      type: 'table',
      description: hasYtdData || hasForecastData
        ? `Cost summary for ${dataset.timeframe} (${dataset.mode} mode) with forecast data`
        : `Cost summary for ${dataset.timeframe} (${dataset.mode} mode)`,
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
   * Create AWS Services Breakdown Sheet
   */
  function createServicesSheet(): SheetConfig | null {
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
   * Create Historical Costs Sheet
   */
  function createHistoricalSheet(): SheetConfig | null {
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
   * Create Current Month Detail Sheet (MTD Actual + Forecast to Month End)
   */
  function createCurrentMonthDetailSheet(): SheetConfig | null {
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
   * Create Monthly Breakdown Sheet (Full Year View with Actuals and Forecasts)
   */
  function createMonthlyBreakdownSheet(): SheetConfig | null {
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
   * Create Forecast Sheet
   */
  function createForecastSheet(): SheetConfig | null {
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
   * Create Year-End Summary Sheet
   */
  function createYearEndSummarySheet(): SheetConfig | null {
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

    // Get total budget from analysis data
    const analysisData = (dataset.analysis as any)?.data || dataset.analysis
    const byAccount = analysisData?.budgetAnalysis?.byAccount || []
    const monthlyBudget = byAccount.reduce((sum: number, account: any) => {
      return sum + (account.budgetedCost || account.budget || 0)
    }, 0)

    // Calculate annual budget (multiply monthly by 12)
    const annualBudget = monthlyBudget > 0 ? monthlyBudget * 12 : 0

    const data = [
      { metric: 'Year-to-Date Actual', value: yearToDate },
      { metric: '  - Complete Months', value: ytdActual },
      { metric: '  - Current Month (MTD)', value: currentMonthActual },
      { metric: 'Remaining Forecast', value: currentMonthRemainder + futureMonthsForecast },
      { metric: '  - Current Month Remainder', value: currentMonthRemainder },
      { metric: '  - Future Months', value: futureMonthsForecast },
      { metric: 'Year-End Projection', value: yearEndProjection },
      { metric: 'Estimated Annual Budget', value: annualBudget },
      { metric: 'Projected Variance', value: yearEndProjection - annualBudget }
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

  /**
   * Create complete cost export configuration
   */
  function createCostExportConfig(options?: {
    title?: string
    subtitle?: string
    includeServices?: boolean
    includeHistorical?: boolean
    includeForecast?: boolean
  }): DataExportConfig {
    const sheets: SheetConfig[] = []

    const metadata = createMetadata()

    // Always include current month summary
    const currentMonthSheet = createCurrentMonthSheet()
    if (currentMonthSheet) sheets.push(currentMonthSheet)

    // Include current month detail (MTD + forecast) for current timeframes
    if (dataset.timeframe === 'thisMonth' || dataset.timeframe === 'yearToDate') {
      const currentMonthDetailSheet = createCurrentMonthDetailSheet()
      if (currentMonthDetailSheet) sheets.push(currentMonthDetailSheet)
    }

    // Include services if requested and available
    if (options?.includeServices !== false) {
      const servicesSheet = createServicesSheet()
      if (servicesSheet) sheets.push(servicesSheet)
    }

    // Include monthly breakdown (year-to-date actuals + forecasts)
    const monthlyBreakdownSheet = createMonthlyBreakdownSheet()
    if (monthlyBreakdownSheet) sheets.push(monthlyBreakdownSheet)

    // Include historical if requested and available
    if (options?.includeHistorical !== false) {
      const historicalSheet = createHistoricalSheet()
      if (historicalSheet) sheets.push(historicalSheet)
    }

    // Include forecast if requested and available
    if (options?.includeForecast !== false) {
      const forecastSheet = createForecastSheet()
      if (forecastSheet) sheets.push(forecastSheet)

      const yearEndSheet = createYearEndSummarySheet()
      if (yearEndSheet) sheets.push(yearEndSheet)
    }

    // Create subtitle with better formatting
    const selectedAccountsCount = dataset.accounts?.length || 0
    const rawScope = selectedAccountsCount === 0 ? 'org-wide' : selectedAccountsCount === 1 ? 'single-account' : 'selected-accounts'

    const scopeDescription = rawScope === 'org-wide'
      ? 'Organization-Wide'
      : rawScope === 'single-account'
        ? `Single Account`
        : `${selectedAccountsCount} Selected Accounts`

    const timeframeFormatted = formatTimeframe(dataset.timeframe)
    const modeFormatted = dataset.mode.charAt(0).toUpperCase() + dataset.mode.slice(1)

    return {
      title: options?.title || 'AWS Cost Report',
      subtitle: options?.subtitle || `${scopeDescription} · ${timeframeFormatted} · ${modeFormatted}`,
      metadata,
      sheets,
      options: {
        filename: `aws-cost-report-${dataset.timeframe}-${dataset.mode}`,
        includeMetadata: true,
        pdf: {
          orientation: 'landscape',
          pageSize: 'a4',
          includeToc: sheets.length > 3,
          footerText: 'GHOST Cost Dashboard | Page {page}'
        },
        xlsx: {
          autoWidth: true,
          freezeHeader: true,
          showGridlines: true
        },
        csv: {
          includeHeaders: true,
          multiFileZip: sheets.length > 1
        }
      }
    }
  }

  /**
   * Export cost data in specified format
   */
  async function exportCostData(
    format: ExportFormat,
    options?: {
      title?: string
      subtitle?: string
      includeServices?: boolean
      includeHistorical?: boolean
      includeForecast?: boolean
    }
  ) {
    const config = createCostExportConfig(options)
    return await exportData(config, format)
  }

  /**
   * Export cost data in multiple formats
   */
  async function exportCostDataMultiple(
    formats: ExportFormat[],
    options?: {
      title?: string
      subtitle?: string
      includeServices?: boolean
      includeHistorical?: boolean
      includeForecast?: boolean
    }
  ) {
    const config = createCostExportConfig(options)
    return await exportMultipleFormats(config, formats)
  }

  return {
    // State
    isExporting: computed(() => isExporting.value),

    // Methods
    createCostExportConfig,
    exportCostData,
    exportCostDataMultiple,

    // Sheet creators (for custom exports)
    createCurrentMonthSheet,
    createCurrentMonthDetailSheet,
    createServicesSheet,
    createMonthlyBreakdownSheet,
    createHistoricalSheet,
    createForecastSheet,
    createYearEndSummarySheet
  }
}
