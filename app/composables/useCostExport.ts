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
import {
  formatTimeframe,
  formatScope,
  createCurrentMonthSheet,
  createServicesSheet,
  createHistoricalSheet,
  createCurrentMonthDetailSheet,
  createMonthlyBreakdownSheet,
  createForecastSheet,
  createYearEndSummarySheet
} from '#shared/utils/cost-sheet-builders'

export function useCostExport(dataset: NormalizedDataset) {
  const { exportData, exportMultipleFormats, isExporting } = useDataExport()
  const { user } = useOidcAuth()

  // Note: formatTimeframe and formatScope are now imported from shared utils

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

  // Sheet builders are now imported from shared/utils/cost-sheet-builders

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
    const currentMonthSheet = createCurrentMonthSheet(dataset)
    if (currentMonthSheet) sheets.push(currentMonthSheet)

    // Include current month detail (MTD + forecast) for current timeframes
    if (dataset.timeframe === 'thisMonth' || dataset.timeframe === 'yearToDate') {
      const currentMonthDetailSheet = createCurrentMonthDetailSheet(dataset)
      if (currentMonthDetailSheet) sheets.push(currentMonthDetailSheet)
    }

    // Include services if requested and available
    if (options?.includeServices !== false) {
      const servicesSheet = createServicesSheet(dataset)
      if (servicesSheet) sheets.push(servicesSheet)
    }

    // Include monthly breakdown (year-to-date actuals + forecasts)
    const monthlyBreakdownSheet = createMonthlyBreakdownSheet(dataset)
    if (monthlyBreakdownSheet) sheets.push(monthlyBreakdownSheet)

    // Include historical if requested and available
    if (options?.includeHistorical !== false) {
      const historicalSheet = createHistoricalSheet(dataset)
      if (historicalSheet) sheets.push(historicalSheet)
    }

    // Include forecast if requested and available
    if (options?.includeForecast !== false) {
      const forecastSheet = createForecastSheet(dataset)
      if (forecastSheet) sheets.push(forecastSheet)

      const yearEndSheet = createYearEndSummarySheet(dataset)
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
          orientation: 'portrait',
          pageSize: 'a4',
          includeToc: sheets.length > 1,
          footerText: 'Page {page}'
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
