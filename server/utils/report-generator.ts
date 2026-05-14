/**
 * Report Generator
 * Generates cost reports for scheduled delivery
 * Reuses the existing export system from the frontend
 */

import type { ReportConfig } from '../../shared/types/scheduled-reports'
import type { NormalizedDataset } from '~/types/costs'
import { getCostAndUsage } from './cost-explorer'
import { getAllAccountsUnified } from './accounts-consolidated'
import { validateDateParams } from './date-helpers'
import { exportToPDFServer } from './pdf-export-server'
import { logger } from './logger'

/**
 * Generate a cost report based on configuration
 * Returns report as Buffer for email attachment
 */
export async function generateCostReport(
  config: ReportConfig
): Promise<{
  success: boolean
  buffer?: Buffer
  filename?: string
  error?: string
}> {
  try {
    logger.info('Generating cost report with config:', {
      accounts: config.accounts?.length || 'all',
      timeframe: config.timeframe,
      dataMode: config.dataMode,
      format: config.format
    })

    // Step 1: Fetch all required cost data and build NormalizedDataset
    const dataset = await buildDataset(config)

    // Step 2: Generate export using the existing export system
    if (config.format === 'pdf') {
      return await generatePDFReport(dataset, config)
    } else {
      return await generateTextReport(dataset, config)
    }
  } catch (error: any) {
    logger.error('Report generation error:', error)
    return {
      success: false,
      error: error.message || 'Unknown error during report generation'
    }
  }
}

/**
 * Build NormalizedDataset from cost data
 * This creates the same data structure the frontend uses with proper budgetAnalysis
 */
async function buildDataset(config: ReportConfig): Promise<NormalizedDataset> {
  logger.info('[Report Generator] Building dataset with config:', {
    dataMode: config.dataMode,
    timeframe: config.timeframe,
    accountCount: config.accounts?.length || 0
  })

  // Import necessary utilities
  const { getProformaCosts } = await import('./cost-explorer')

  // Convert timeframe to date range
  const dateRange = validateDateParams({
    period: config.timeframe as any
  })

  const environment = 'commercial'

  logger.info('[Report Generator] Fetching costs:', {
    mode: config.dataMode,
    fetcher: config.dataMode === 'proforma' ? 'getProformaCosts' : 'getCostAndUsage',
    dateRange
  })

  // Fetch cost data
  const costParams = {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
    granularity: 'MONTHLY' as const,
    metrics: ['UnblendedCost', 'UsageQuantity'],
    groupBy: [{
      type: 'DIMENSION' as const,
      key: 'LINKED_ACCOUNT'
    }],
    filter: config.accounts && config.accounts.length > 0 ? {
      Dimensions: {
        Key: 'LINKED_ACCOUNT',
        Values: config.accounts,
        MatchOptions: ['EQUALS']
      }
    } : undefined
  }

  // Fetch all required data - call the appropriate function with correct parameters
  const [rawCostData, accounts] = await Promise.all([
    config.dataMode === 'proforma'
      ? getProformaCosts(costParams)  // Uses default proforma account ID from env
      : getCostAndUsage(costParams, environment),  // Pass environment for billable
    getAllAccountsUnified(false)
  ])

  // Extract the actual cost data based on mode
  // getProformaCosts returns { proforma: { costs: {...} } }
  // getCostAndUsage returns { resultsByTime: [...] } directly
  let costData: any
  if (config.dataMode === 'proforma') {
    if (!rawCostData?.proforma?.costs?.resultsByTime) {
      throw new Error('No proforma cost data returned from AWS')
    }
    costData = rawCostData.proforma.costs
  } else {
    if (!rawCostData?.resultsByTime) {
      throw new Error('No cost data returned from AWS')
    }
    costData = rawCostData
  }

  if (!costData.resultsByTime) {
    throw new Error('No cost data returned from AWS')
  }

  // Build budgetAnalysis structure that matches what sheets expect
  const accountCostsMap = new Map<string, number>()
  costData.resultsByTime.forEach((result: any) => {
    result.Groups?.forEach((group: any) => {
      const accountId = group.Keys?.[0]
      const cost = parseFloat(group.Metrics?.UnblendedCost?.Amount || '0')
      if (accountId) {
        accountCostsMap.set(accountId, (accountCostsMap.get(accountId) || 0) + cost)
      }
    })
  })

  // Build account lookup map
  const accountMap = new Map()
  accounts.forEach(acc => {
    if (acc.awsStandardAccountID) accountMap.set(acc.awsStandardAccountID, acc)
    if (acc.awsGovCloudAccountID) accountMap.set(acc.awsGovCloudAccountID, acc)
  })

  // Build budgetAnalysis.byAccount array that matches the structure sheets need
  const byAccount = Array.from(accountCostsMap.entries()).map(([accountId, actualCost]) => {
    const account = accountMap.get(accountId)

    // Extract budget from account metadata (stored as estimatedMonthlyCharge)
    const budgetStr = account?.estimatedMonthlyCharge || '0'
    const budgetedCost = parseFloat(budgetStr.replace(/[^0-9.-]/g, '')) || 0

    return {
      accountId,
      accountName: account?.name || account?.projectName || accountId,
      actualCost,
      budgetedCost,
      variance: actualCost - budgetedCost,
      utilizationPct: budgetedCost > 0 ? (actualCost / budgetedCost) * 100 : 0,
      // Additional metadata
      linesOfBusiness: account?.linesOfBusiness || '',
      departmentNumber: account?.pepDepartment || account?.departmentNumber || ''
    }
  })

  // Build budget analysis structure - matches what /api/costs/analysis returns
  const budgetAnalysis = {
    byAccount,
    totalActual: Array.from(accountCostsMap.values()).reduce((sum, cost) => sum + cost, 0),
    totalBudget: byAccount.reduce((sum, acc) => sum + acc.budgetedCost, 0),
    overBudgetAccounts: byAccount.filter(acc => acc.utilizationPct > 100),
    underBudgetAccounts: byAccount.filter(acc => acc.utilizationPct <= 100)
  }

  logger.info('[Report Generator] Dataset built successfully:', {
    mode: config.dataMode,
    hasBudgetAnalysis: true,
    accountCount: byAccount.length,
    totalCost: budgetAnalysis.totalActual
  })

  // Build normalized dataset matching client structure
  // IMPORTANT: analysis should NOT have .data property that wraps budgetAnalysis
  // The sheet builder checks for .data and if it exists, uses that instead of budgetAnalysis
  const dataset: NormalizedDataset = {
    accounts: config.accounts || [],
    timeframe: config.timeframe,
    mode: config.dataMode,
    analysis: { budgetAnalysis },  // Top-level budgetAnalysis, matches API response
    services: config.includeServices ? { data: costData } : null,
    historical: config.includeHistorical ? { data: costData } : null,
    projections: config.includeProjections ? { data: costData } : null,
    ytdSummary: config.includeProjections ? { data: costData } : null,
    yearEndProjections: config.includeProjections ? { data: costData } : null,
    currentMonthOrgWide: { data: costData, accounts: byAccount },
    accountsList: accounts
  }

  return dataset
}

/**
 * Generate PDF report using existing export system
 */
async function generatePDFReport(
  dataset: NormalizedDataset,
  config: ReportConfig
): Promise<{
  success: boolean
  buffer?: Buffer
  filename?: string
  error?: string
}> {
  try {
    // Use the existing export system by creating DataExportConfig
    const { createCostExportConfig } = await import('./cost-export-server')

    const exportConfig = createCostExportConfig(dataset, {
      includeServices: config.includeServices,
      includeHistorical: config.includeHistorical,
      includeForecast: config.includeForecast
    })

    // Generate PDF using server-compatible exporter
    const result = await exportToPDFServer(exportConfig)

    if (!result.success || !result.blob) {
      throw new Error(result.error || 'PDF generation failed')
    }

    // Convert Blob to Buffer
    const arrayBuffer = await result.blob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    return {
      success: true,
      buffer,
      filename: result.filename
    }
  } catch (error: any) {
    logger.error('PDF generation error:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Generate text/CSV report
 */
async function generateTextReport(
  dataset: NormalizedDataset,
  config: ReportConfig
): Promise<{
  success: boolean
  buffer?: Buffer
  filename?: string
  error?: string
}> {
  const dateRange = validateDateParams({
    period: config.timeframe as any
  })

  const reportContent = formatReportData(config, dataset, dateRange)
  const buffer = Buffer.from(reportContent, 'utf-8')

  const timestamp = new Date().toISOString().split('T')[0]
  const filename = `cost-report-${timestamp}.${config.format}`

  return {
    success: true,
    buffer,
    filename
  }
}

/**
 * Format cost data into a readable text report
 */
function formatReportData(
  config: ReportConfig,
  dataset: NormalizedDataset,
  dateRange: { startDate: string; endDate: string }
): string {
  const accountMap = new Map()
  dataset.accountsList.forEach(acc => {
    if (acc.awsStandardAccountID) accountMap.set(acc.awsStandardAccountID, acc)
    if (acc.awsGovCloudAccountID) accountMap.set(acc.awsGovCloudAccountID, acc)
  })

  // Calculate totals from analysis data
  let totalCost = 0
  const accountCosts = new Map<string, number>()

  const costData = (dataset.analysis as any)?.data || dataset.analysis
  if (costData?.resultsByTime) {
    costData.resultsByTime.forEach((result: any) => {
      result.Groups?.forEach((group: any) => {
        const accountId = group.Keys?.[0]
        const cost = parseFloat(group.Metrics?.['UnblendedCost']?.Amount || '0')
        if (accountId) {
          accountCosts.set(accountId, (accountCosts.get(accountId) || 0) + cost)
          totalCost += cost
        }
      })
    })
  }

  // Build report sections
  const sections = []

  // Header
  sections.push(`AWS COST REPORT`)
  sections.push(`Generated: ${new Date().toLocaleString()}`)
  sections.push(`Period: ${dateRange.startDate} to ${dateRange.endDate}`)
  sections.push(`Data Mode: ${dataset.mode}`)
  sections.push(`\n${'='.repeat(80)}\n`)

  // Summary
  sections.push(`SUMMARY`)
  sections.push(`Total Cost: $${totalCost.toFixed(2)}`)
  sections.push(`Accounts: ${accountCosts.size}`)
  sections.push(`\n${'='.repeat(80)}\n`)

  // Account breakdown
  sections.push(`COST BY ACCOUNT`)
  sections.push(`\n`)

  const sortedAccounts = Array.from(accountCosts.entries())
    .sort((a, b) => b[1] - a[1])

  sortedAccounts.forEach(([accountId, cost]) => {
    const account = accountMap.get(accountId)
    const accountName = account?.name || accountId
    sections.push(`${accountName.padEnd(50)} $${cost.toFixed(2).padStart(15)}`)
  })

  sections.push(`\n${'='.repeat(80)}`)
  sections.push(`TOTAL${' '.repeat(45)}$${totalCost.toFixed(2).padStart(15)}`)

  return sections.join('\n')
}
