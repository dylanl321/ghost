/**
 * Server-side Cost Export Configuration Builder
 * Creates DataExportConfig for server-side PDF generation
 * Mirrors the logic from app/composables/useCostExport.ts
 */

import type { NormalizedDataset } from '~/types/costs'
import type { DataExportConfig, SheetConfig, ColumnConfig, ExportMetadata } from '~/shared/types/export'

export function createCostExportConfig(
  dataset: NormalizedDataset,
  options: {
    includeServices?: boolean
    includeHistorical?: boolean
    includeForecast?: boolean
  } = {}
): DataExportConfig {
  const sheets: SheetConfig[] = []

  // Create metadata
  const metadata = createMetadata(dataset)

  // Add summary sheet (always included)
  const summarySheet = createSummarySheet(dataset)
  if (summarySheet) sheets.push(summarySheet)

  // Add services sheet if requested
  if (options.includeServices) {
    const servicesSheet = createServicesSheet(dataset)
    if (servicesSheet) sheets.push(servicesSheet)
  }

  // Add historical sheet if requested
  if (options.includeHistorical) {
    const historicalSheet = createHistoricalSheet(dataset)
    if (historicalSheet) sheets.push(historicalSheet)
  }

  return {
    title: 'AWS Cost Report',
    subtitle: `${formatTimeframe(dataset.timeframe)} - ${dataset.mode === 'billable' ? 'Billable Costs' : 'Pro-forma Costs'}`,
    sheets,
    metadata,
    options: {
      filename: `aws-cost-report-${new Date().toISOString().split('T')[0]}`,
      pdf: {
        orientation: 'portrait',
        pageSize: 'a4',
        includeToc: sheets.length > 1,
        footerText: 'Page {page}'
      }
    }
  }
}

function createMetadata(dataset: NormalizedDataset): ExportMetadata {
  const selectedAccountsCount = dataset.accounts?.length || 0
  const scope = selectedAccountsCount === 0
    ? 'org-wide'
    : selectedAccountsCount === 1
      ? 'single-account'
      : 'selected-accounts'

  return {
    generatedBy: 'GHOST Scheduled Reports',
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

function createSummarySheet(dataset: NormalizedDataset): SheetConfig | null {
  const costData = (dataset.analysis as any)?.data || dataset.analysis
  if (!costData?.resultsByTime) return null

  // Calculate account costs
  const accountCosts = new Map<string, number>()
  costData.resultsByTime.forEach((result: any) => {
    result.Groups?.forEach((group: any) => {
      const accountId = group.Keys?.[0]
      const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
      if (accountId) {
        accountCosts.set(accountId, (accountCosts.get(accountId) || 0) + cost)
      }
    })
  })

  // Calculate YTD totals if available
  const ytdCosts = new Map<string, number>()
  if (dataset.ytdSummary) {
    const ytdData = (dataset.ytdSummary as any)?.data || dataset.ytdSummary
    if (ytdData?.resultsByTime) {
      ytdData.resultsByTime.forEach((result: any) => {
        result.Groups?.forEach((group: any) => {
          const accountId = group.Keys?.[0]
          const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
          if (accountId) {
            ytdCosts.set(accountId, (ytdCosts.get(accountId) || 0) + cost)
          }
        })
      })
    }
  }

  // Get budget data from summary if available
  const budgetMap = new Map<string, number>()
  if (dataset.summary?.items) {
    dataset.summary.items.forEach((item: any) => {
      if (item.budget && item.accountId) {
        budgetMap.set(item.accountId, item.budget)
      }
    })
  }

  // Build account summary data
  const accountMap = new Map()
  dataset.accountsList.forEach(acc => {
    if (acc.awsStandardAccountID) accountMap.set(acc.awsStandardAccountID, acc)
    if (acc.awsGovCloudAccountID) accountMap.set(acc.awsGovCloudAccountID, acc)
  })

  const hasYtdData = ytdCosts.size > 0
  const hasBudgetData = budgetMap.size > 0

  const data = Array.from(accountCosts.entries())
    .map(([accountId, cost]) => {
      const account = accountMap.get(accountId)
      const rowData: any = {
        accountName: account?.name || accountId,
        accountId,
        cost
      }

      // Add YTD if available
      if (hasYtdData) {
        rowData.ytdTotal = ytdCosts.get(accountId) || 0
      }

      // Add budget if available
      if (hasBudgetData) {
        const budget = budgetMap.get(accountId)
        if (budget) {
          rowData.budget = budget
          rowData.budgetUtilization = (cost / budget) * 100
        }
      }

      return rowData
    })
    .sort((a, b) => b.cost - a.cost)

  const columns: ColumnConfig[] = [
    { key: 'accountName', header: 'Account Name', format: 'text', width: 40 },
    { key: 'accountId', header: 'Account ID', format: 'text', width: 20 },
    { key: 'cost', header: 'Total Cost', format: 'currency', decimals: 2, alignment: 'right', width: 20 }
  ]

  // Add budget columns if data is available
  if (hasBudgetData) {
    columns.push(
      {
        key: 'budget',
        header: 'Budget',
        format: 'currency',
        decimals: 2,
        alignment: 'right',
        width: 20
      },
      {
        key: 'budgetUtilization',
        header: 'Utilization %',
        format: 'number',
        decimals: 1,
        alignment: 'right',
        width: 15
      }
    )
  }

  // Add YTD column if data is available
  if (hasYtdData) {
    columns.push({
      key: 'ytdTotal',
      header: 'YTD Total',
      format: 'currency',
      decimals: 2,
      alignment: 'right',
      width: 20
    })
  }

  return {
    name: 'Cost Summary by Account',
    type: 'table',
    description: hasYtdData
      ? 'Total costs grouped by AWS account with YTD totals'
      : 'Total costs grouped by AWS account',
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

function createServicesSheet(dataset: NormalizedDataset): SheetConfig | null {
  const servicesResponse = (dataset.services as any)?.data || dataset.services
  if (!servicesResponse?.resultsByTime) return null

  // Aggregate service costs
  const serviceMap = new Map<string, number>()

  servicesResponse.resultsByTime.forEach((bucket: any) => {
    if (bucket.Groups) {
      bucket.Groups.forEach((g: any) => {
        const serviceName = g.Keys?.[0] || 'Unknown Service'
        const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
        serviceMap.set(serviceName, (serviceMap.get(serviceName) || 0) + amount)
      })
    }
  })

  if (serviceMap.size === 0) return null

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

function createHistoricalSheet(dataset: NormalizedDataset): SheetConfig | null {
  const historicalResponse = (dataset.historical as any)?.data || dataset.historical
  const monthlyBreakdown = historicalResponse?.monthlyBreakdown || []

  if (monthlyBreakdown.length === 0) return null

  const columns: ColumnConfig[] = [
    { key: 'month', header: 'Month', format: 'text', width: 15 },
    { key: 'cost', header: 'Total Cost', format: 'currency', decimals: 2, alignment: 'right', width: 20 },
    { key: 'accountCount', header: 'Accounts', format: 'number', decimals: 0, alignment: 'right', width: 12 }
  ]

  const data = monthlyBreakdown.map((month: any) => ({
    month: month.month,
    cost: month.cost || 0,
    accountCount: month.accountBreakdown?.length || dataset.accounts.length
  }))

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
      }
    }
  }
}

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

function formatScope(scope: string, count?: number): string {
  const scopeMap: Record<string, string> = {
    'org-wide': 'Organization-Wide (All Accounts)',
    'single-account': 'Single Account',
    'selected-accounts': `${count} Selected Accounts`,
    'department': 'Department View',
    'lob': 'Line of Business View'
  }

  return scopeMap[scope] || scope
}
