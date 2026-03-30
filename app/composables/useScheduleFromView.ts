/**
 * Composable to help schedule reports from current cost views
 * Captures current page state and prepares it for scheduling
 */

import type { ReportConfig, CreateReportRequest } from '#shared/types/scheduled-reports'

export const useScheduleFromView = () => {
  const showSimpleModal = ref(false)
  const showAdvancedModal = ref(false)
  const currentConfig = ref<ReportConfig>({
    accounts: [],
    timeframe: 'lastMonth',
    dataMode: 'billable',
    viewType: 'summary',
    format: 'pdf',
    includeServices: true,
    includeHistorical: true,
    includeForecast: false
  })
  const advancedInitialConfig = ref<Partial<CreateReportRequest> | undefined>()

  /**
   * Open the simple schedule modal with current view configuration
   */
  function openScheduleModal(config: Partial<ReportConfig>) {
    currentConfig.value = {
      accounts: config.accounts || [],
      timeframe: config.timeframe || 'lastMonth',
      dataMode: config.dataMode || 'billable',
      viewType: config.viewType || 'summary',
      format: config.format || 'pdf',
      includeServices: config.includeServices ?? true,
      includeHistorical: config.includeHistorical ?? true,
      includeForecast: config.includeForecast ?? false
    }
    showSimpleModal.value = true
  }

  /**
   * Handle opening advanced settings from simple modal
   */
  function handleOpenAdvanced(
    config: ReportConfig,
    schedule: any,
    reportName: string
  ) {
    advancedInitialConfig.value = {
      reportName,
      reportConfig: config,
      schedule
    }
    showAdvancedModal.value = true
  }

  /**
   * Capture state from common cost view props
   */
  function captureViewState(options: {
    selectedAccounts?: string[]
    timeframe?: string
    dataMode?: 'billable' | 'proforma'
    format?: 'pdf' | 'xlsx' | 'csv' | 'json'
    includeServices?: boolean
    includeHistorical?: boolean
    includeForecast?: boolean
  }): ReportConfig {
    return {
      accounts: options.selectedAccounts || [],
      timeframe: (options.timeframe || 'lastMonth') as any,
      dataMode: options.dataMode || 'billable',
      viewType: 'summary',
      format: options.format || 'pdf',
      includeServices: options.includeServices ?? true,
      includeHistorical: options.includeHistorical ?? true,
      includeForecast: options.includeForecast ?? false
    }
  }

  return {
    // State
    showSimpleModal,
    showAdvancedModal,
    currentConfig,
    advancedInitialConfig,

    // Methods
    openScheduleModal,
    handleOpenAdvanced,
    captureViewState
  }
}
