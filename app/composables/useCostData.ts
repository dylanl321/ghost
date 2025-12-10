import { ref, computed, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { DataMode, NormalizedDataset, CostsQuery } from '~/types/costs'

interface UseCostDataArgs {
  selectedAccounts: Ref<string[]>
  selectedTimeframe: Ref<string>
  initialMode?: DataMode
  accountsList?: Ref<any[]> // Full accounts data with metadata
  debounceMs?: number // Debounce delay in milliseconds
}

export const useCostData = ({ selectedAccounts, selectedTimeframe, initialMode = 'proforma', accountsList, debounceMs = 800 }: UseCostDataArgs) => {
  const mode = ref<DataMode>(initialMode)
  const isFetching = ref(false)
  const isPending = ref(false) // True when debounce timer is active
  const fetchError = ref<string | null>(null)
  const dataset = ref<NormalizedDataset | null>(null)
  let debounceTimer: NodeJS.Timeout | null = null

  const query = computed<CostsQuery>(() => ({
    accounts: selectedAccounts.value,
    timeframe: selectedTimeframe.value,
    mode: mode.value
  }))

  const mapUiToSummaryPeriod = (tf: string): string => {
    // summary supports: last7days, last30days, last90days, thisMonth, lastMonth, thisQuarter, lastQuarter, thisYear, lastYear, ytd, last12months
    const allowed = new Set(['last7days','last30days','last90days','thisMonth','lastMonth','thisQuarter','lastQuarter','thisYear','lastYear','ytd','last12months'])
    return allowed.has(tf) ? tf : 'thisMonth'
  }

  const mapUiToHistoricalPeriod = (tf: string): string => {
    // historical supports: last7days, last30days, last90days, lastMonth, lastQuarter, lastYear, ytd, last12months, last24months
    // map UI's thisMonth/thisQuarter/thisYear to appropriate historical periods for trend purposes
    // Use longer periods to ensure we have enough data for charts that need 4+ months
    if (tf === 'thisMonth') return 'last12months'  // Changed from last30days to get more historical data
    if (tf === 'thisQuarter') return 'last12months' // Changed from last90days to get full year context
    if (tf === 'thisYear') return 'last12months'    // Changed from ytd to get trailing 12 months
    const allowed = new Set(['last7days','last30days','last90days','lastMonth','lastQuarter','lastYear','ytd','last12months','last24months'])
    return allowed.has(tf) ? tf : 'last12months'  // Default to last12months instead of last30days
  }

  const buildSummaryUrl = () => {
    const params = new URLSearchParams()
    const period = mapUiToSummaryPeriod(query.value.timeframe)
    params.set('period', period)
    // Use proforma flag
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Group by linked account for per-account series; enhanced=true to get account details
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('enhanced', 'true')
    // IMPORTANT: Don't filter by accountIds for summary - we need all account costs for the sidebar
    // The account selection is used for chart filtering, not data fetching
    // if (query.value.accounts.length > 0) params.set('accountIds', query.value.accounts.join(','))
    return `/api/costs/summary?${params.toString()}`
  }

  const buildHistoricalUrl = () => {
    const params = new URLSearchParams()
    const period = mapUiToHistoricalPeriod(query.value.timeframe)
    params.set('period', period)
    params.set('proforma', String(query.value.mode === 'proforma'))
    if (query.value.accounts.length > 0) params.set('accountIds', query.value.accounts.join(','))
    return `/api/costs/historical?${params.toString()}`
  }

  // Build org-wide historical URL (no account filtering) for contextual charts
  const buildOrgWideHistoricalUrl = () => {
    const params = new URLSearchParams()
    params.set('period', 'last12months') // Always get full year for year-end projection
    params.set('proforma', String(query.value.mode === 'proforma'))
    return `/api/costs/historical?${params.toString()}`
  }

  // Build current month org-wide summary (no account filtering) for Year-End chart
  const buildCurrentMonthOrgWideSummaryUrl = () => {
    const params = new URLSearchParams()
    params.set('period', 'thisMonth')
    params.set('proforma', String(query.value.mode === 'proforma'))
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('enhanced', 'true')
    // No accountIds = org-wide data
    return `/api/costs/summary?${params.toString()}`
  }

  // Build YTD summary for per-account YTD calculations in data table
  const buildYtdSummaryUrl = () => {
    const params = new URLSearchParams()
    params.set('period', 'ytd')
    params.set('proforma', String(query.value.mode === 'proforma'))
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('enhanced', 'true')
    // Include account filtering if accounts are selected
    if (query.value.accounts.length > 0) params.set('accountIds', query.value.accounts.join(','))
    return `/api/costs/summary?${params.toString()}`
  }

  const buildForecastUrl = () => {
    const params = new URLSearchParams()
    // Get forecast for remaining days of current month with daily granularity
    params.set('period', 'current-month-remainder')
    params.set('granularity', 'DAILY')
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Add account filtering
    const accounts = query.value.accounts
    console.log('buildForecastUrl called with accounts:', accounts, 'length:', accounts.length)
    if (accounts.length > 0) {
      params.set('accountIds', accounts.join(','))
      console.log('Forecast: Adding accountIds to URL:', accounts)
    } else {
      console.log('Forecast: No account filtering - org-wide forecast')
    }
    const url = `/api/costs/forecast?${params.toString()}`
    console.log('Final forecast URL:', url)
    return url
  }

  const buildExtendedForecastUrl = () => {
    const params = new URLSearchParams()
    // Get 3-month forecast for trend analysis
    params.set('period', '3-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Add account filtering - MUST match regular forecast
    if (query.value.accounts.length > 0) {
      params.set('accountIds', query.value.accounts.join(','))
      console.log('ExtendedForecast: Adding accountIds to URL:', query.value.accounts)
    }
    return `/api/costs/forecast?${params.toString()}`
  }

  const buildYearEndForecastUrl = () => {
    const params = new URLSearchParams()
    // Get 12-month forecast for year-end projection (spans into next year)
    params.set('period', '12-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Add account filtering
    if (query.value.accounts.length > 0) {
      params.set('accountIds', query.value.accounts.join(','))
      console.log('YearEndForecast: Adding accountIds to URL:', query.value.accounts)
    }
    return `/api/costs/forecast?${params.toString()}`
  }

  const buildAnalysisUrl = () => {
    const params = new URLSearchParams()
    const period = mapUiToSummaryPeriod(query.value.timeframe)
    params.set('period', period)
    params.set('proforma', String(query.value.mode === 'proforma'))
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('granularity', 'MONTHLY')
    params.set('includeBudget', 'true')
    // IMPORTANT: Don't filter analysis API - we need all account budget data
    // The chart will filter as needed when summing budgets
    // if (query.value.accounts.length > 0) {
    //   params.set('accountIds', query.value.accounts.join(','))
    // }
    return `/api/costs/analysis?${params.toString()}`
  }

  const buildServicesSummaryUrl = () => {
    const params = new URLSearchParams()
    const period = mapUiToSummaryPeriod(query.value.timeframe)
    params.set('period', period)
    // Use proforma flag  
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Group by SERVICE to get service breakdown
    params.set('groupBy', 'SERVICE')
    params.set('enhanced', 'false') // Don't need enhanced for service data
    if (query.value.accounts.length > 0) params.set('accountIds', query.value.accounts.join(','))
    return `/api/costs/summary?${params.toString()}`
  }

  const fetchCosts = async () => {
    isFetching.value = true
    fetchError.value = null

    // Log the URLs being called
    const urls = {
      summary: buildSummaryUrl(),
      historical: buildHistoricalUrl(),
      orgWideHistorical: buildOrgWideHistoricalUrl(),
      ytdSummary: buildYtdSummaryUrl(),
      currentMonthOrgWide: buildCurrentMonthOrgWideSummaryUrl(),
      forecast: buildForecastUrl(),
      extendedForecast: buildExtendedForecastUrl(),
      yearEndForecast: buildYearEndForecastUrl(),
      analysis: buildAnalysisUrl(),
      services: buildServicesSummaryUrl()
    }
    console.log('Fetching cost data with URLs:', urls)
    console.log('Current selected accounts:', query.value.accounts)
    console.log('Forecast URL specifically:', urls.forecast)

    try {
      const [summaryRes, historicalRes, orgWideHistoricalRes, ytdSummaryRes, currentMonthOrgWideRes, forecastRes, extendedForecastRes, yearEndForecastRes, analysisRes, servicesRes] = await Promise.all([
        $fetch(urls.summary),
        $fetch(urls.historical),
        $fetch(urls.orgWideHistorical),
        $fetch(urls.ytdSummary),
        $fetch(urls.currentMonthOrgWide),
        $fetch(urls.forecast),
        $fetch(urls.extendedForecast),
        $fetch(urls.yearEndForecast),
        $fetch(urls.analysis),
        $fetch(urls.services)
      ])

      dataset.value = {
        accounts: query.value.accounts, // Selected account IDs
        accountsList: accountsList?.value, // Full accounts list for LOB/Department mapping
        mode: query.value.mode, // Add mode so charts know if we're in proforma
        timeframe: query.value.timeframe, // Selected timeframe for context
        summary: summaryRes as any,
        historical: historicalRes as any,
        orgWideHistorical: orgWideHistoricalRes as any, // Unfiltered org-wide data for contextual charts
        ytdSummary: ytdSummaryRes as any, // YTD per-account data for data table
        currentMonthOrgWide: currentMonthOrgWideRes as any, // Current month org-wide for Year-End chart
        forecast: forecastRes as any,
        extendedForecast: extendedForecastRes as any, // 3-month forecast for trend analysis
        yearEndForecast: yearEndForecastRes as any, // Rest-of-year forecast for year-end projection
        analysis: analysisRes as any,
        services: servicesRes as any
      }
      
      // Log the forecast response to debug
      console.log('Forecast API Response:', {
        note: (forecastRes as any)?.data?.note || 'No note',
        total: (forecastRes as any)?.data?.forecast?.total?.Amount || 'No total',
        periodsCount: (forecastRes as any)?.data?.forecast?.forecastResultsByTime?.length || 0,
        selectedAccounts: query.value.accounts
      })
      
      // Debug logging
      console.log('Cost data fetched:', {
        selectedAccounts: query.value.accounts,
        summaryHasData: !!(summaryRes as any)?.data,
        summaryAccounts: (summaryRes as any)?.data?.accounts?.length || 0,
        analysisHasData: !!(analysisRes as any)?.data,
        analysisByAccount: (analysisRes as any)?.data?.budgetAnalysis?.byAccount?.length || 0,
        forecastHasData: !!(forecastRes as any)?.data,
        forecastTotal: (forecastRes as any)?.data?.forecast?.total?.Amount || 'N/A',
        forecastNote: (forecastRes as any)?.data?.note || 'No note',
        forecastPeriod: (forecastRes as any)?.data?.period || 'No period',
        extendedForecastHasData: !!(extendedForecastRes as any)?.data,
        extendedForecastPeriods: (extendedForecastRes as any)?.data?.forecast?.forecastResultsByTime?.length || 0,
        extendedForecastTotal: (extendedForecastRes as any)?.data?.forecast?.total?.Amount || 'N/A',
        yearEndForecastHasData: !!(yearEndForecastRes as any)?.data,
        yearEndForecastPeriods: (yearEndForecastRes as any)?.data?.forecast?.forecastResultsByTime?.length || 0,
        yearEndForecastTotal: (yearEndForecastRes as any)?.data?.forecast?.total?.Amount || 'N/A'
      })
      
      // URLs are already logged above
    } catch (e: any) {
      fetchError.value = e?.message || 'Failed to fetch cost data'
    } finally {
      isFetching.value = false
    }
  }

  // Debounced fetch function
  const debouncedFetch = () => {
    // Clear any existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    
    // Set pending state immediately for UI feedback
    isPending.value = true
    
    // Set new timer
    debounceTimer = setTimeout(() => {
      isPending.value = false
      void fetchCosts()
    }, debounceMs)
  }

  // Watch for changes to selectedAccounts with debouncing
  watch(selectedAccounts, () => {
    console.log('Accounts selection changed, debouncing fetch...', selectedAccounts.value)
    debouncedFetch()
  }, { deep: true })

  // Watch for mode changes separately to clear cache
  watch(mode, async (newMode, oldMode) => {
    // Only clear cache if mode actually changed (not on initial mount)
    if (oldMode !== undefined && newMode !== oldMode) {
      console.log(`Mode changed from ${oldMode} to ${newMode}, clearing cache...`)
      try {
        await $fetch('/api/costs/cache-clear', {
          method: 'POST',
          body: { tags: ['costs'] }
        })
        console.log('Cache cleared successfully')
      } catch (error) {
        console.error('Failed to clear cache:', error)
        // Continue anyway - worst case we get cached data
      }
    }
  })

  // Watch for changes to timeframe and mode without debouncing (immediate)
  watch([selectedTimeframe, mode], () => {
    console.log('Timeframe or mode changed, fetching immediately...')
    void fetchCosts()
  }, { immediate: true })

  // Cleanup on unmount
  onUnmounted(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
  })

  return { mode, isFetching, isPending, fetchError, dataset, fetchCosts }
}