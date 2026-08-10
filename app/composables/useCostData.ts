import { ref, computed, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { DataMode, NormalizedDataset, CostsQuery } from '~/types/costs'
import type { AWSEnclaveData } from '~~/shared/types/accounts'
import { getCachedDataset, setCachedDataset, invalidateByMode } from '~/composables/useCostDataCache'
import { getUserFriendlyMessage, retryWithBackoff } from '~/utils/error-helpers'

/**
 * CLIENT-SIDE CACHING GAP
 *
 * This composable re-fetches all cost data from scratch on every navigation
 * to the costs page and on every filter change. There is no client-side
 * memoization layer — the NormalizedDataset lives in a component-scoped ref
 * and is lost when the user navigates away.
 *
 * Server-side caching (15-30 minute TTL via costCache) already reduces the
 * load on AWS Cost Explorer, so this is not an urgent performance issue.
 * However, adding a client-side cache would improve UX by:
 *   - Avoiding full re-fetches when toggling between tabs
 *   - Enabling instant back-navigation to a previously viewed timeframe
 *
 * Recommended approaches if this becomes a priority:
 *   A. Use Nuxt's useAsyncData with a key based on {timeframe, mode, accounts}
 *      to get built-in deduplication and caching.
 *   B. Add a simple LRU cache (e.g. Map with 5-minute TTL) keyed by
 *      JSON.stringify({ timeframe, mode, accounts }) that stores the
 *      NormalizedDataset and serves it on cache hit.
 *   C. Lift the dataset into a Pinia store with persistence so it survives
 *      navigation (but adds complexity around staleness).
 */

interface UseCostDataArgs {
  selectedAccounts: Ref<string[]>
  selectedTimeframe: Ref<string>
  initialMode?: DataMode
  accountsList?: Ref<AWSEnclaveData[]> // Full accounts data with metadata
  defaultAccountScope?: Ref<string[]> // Default filtered account scope when no accounts are explicitly selected
  debounceMs?: number // Debounce delay in milliseconds
  groupByTag?: Ref<string | null> // Tag key to group costs by (e.g. "Environment")
}

export const useCostData = ({ selectedAccounts, selectedTimeframe, initialMode = 'proforma', accountsList, defaultAccountScope, debounceMs = 800, groupByTag }: UseCostDataArgs) => {
  const mode = ref<DataMode>(initialMode)
  const isFetching = ref(false)
  const isDeferredLoading = ref(false) // True while forecast/supplementary data loads in background
  const isPending = ref(false) // True when debounce timer is active
  const loadingPhase = ref<'idle' | 'core' | 'wave1' | 'wave2' | 'complete'>('idle')
  const fetchError = ref<string | null>(null)
  const fetchWarnings = ref<string[]>([]) // Non-fatal warnings (e.g. deferred fetch failed but core succeeded)
  const dataset = ref<NormalizedDataset | null>(null)
  const initialized = ref(false) // Gate watchers until after initial mount fetch
  let debounceTimer: NodeJS.Timeout | null = null
  let abortController: AbortController | null = null
  let fetchGeneration = 0 // Counter to discard stale responses

  const query = computed<CostsQuery>(() => ({
    accounts: selectedAccounts.value,
    timeframe: selectedTimeframe.value,
    mode: mode.value
  }))

  const getCostScopeAccounts = (): string[] => {
    return query.value.accounts.length > 0
      ? query.value.accounts
      : (defaultAccountScope?.value || [])
  }

  const addCostScope = (params: URLSearchParams): void => {
    const accountIds = getCostScopeAccounts()
    if (accountIds.length > 0) params.set('accountIds', accountIds.join(','))
  }

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

    // When grouping by tag, use TAG:<key> groupBy and disable enhanced account enrichment
    if (groupByTag?.value) {
      params.set('groupBy', `TAG:${groupByTag.value}`)
      params.set('enhanced', 'false')
      // Pass selected accounts for tag grouping since we need specific account data
      if (query.value.accounts.length > 0) params.set('accountIds', query.value.accounts.join(','))
    } else {
      // Group by linked account for per-account series; enhanced=true to get account details
      params.set('groupBy', 'LINKED_ACCOUNT')
      params.set('enhanced', 'true')
      // IMPORTANT: Don't filter by accountIds for summary - we need all account costs for the sidebar
      // The account selection is used for chart filtering, not data fetching
    }
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
    params.set('period', 'last24months') // Get 2 years for LOB trend and year-over-year charts
    params.set('proforma', String(query.value.mode === 'proforma'))
    addCostScope(params)
    return `/api/costs/historical?${params.toString()}`
  }

  // Build current month org-wide summary (no account filtering) for Year-End chart
  const buildCurrentMonthOrgWideSummaryUrl = () => {
    const params = new URLSearchParams()
    params.set('period', 'thisMonth')
    params.set('proforma', String(query.value.mode === 'proforma'))
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('enhanced', 'true')
    addCostScope(params)
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

  // Build last month summary for per-account last month costs in data table
  const buildLastMonthSummaryUrl = () => {
    const params = new URLSearchParams()
    params.set('period', 'lastMonth')
    params.set('proforma', String(query.value.mode === 'proforma'))
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('enhanced', 'true')
    // No account filtering - get all accounts for comprehensive comparison
    return `/api/costs/summary?${params.toString()}`
  }

  const buildForecastUrl = () => {
    const params = new URLSearchParams()
    // Get forecast for remaining days of current month with daily granularity
    params.set('period', 'current-month-remainder')
    params.set('granularity', 'DAILY')
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Add account filtering
    addCostScope(params)
    return `/api/costs/forecast?${params.toString()}`
  }

  const buildExtendedForecastUrl = () => {
    const params = new URLSearchParams()
    // Get 3-month forecast for trend analysis
    params.set('period', '3-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Add account filtering - MUST match regular forecast
    addCostScope(params)
    return `/api/costs/forecast?${params.toString()}`
  }

  const buildYearEndForecastUrl = () => {
    const params = new URLSearchParams()
    // Get 12-month forecast for year-end projection (spans into next year)
    params.set('period', '12-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(query.value.mode === 'proforma'))
    // Add account filtering
    addCostScope(params)
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

  const buildLastMonthServicesSummaryUrl = () => {
    const params = new URLSearchParams()
    params.set('period', 'lastMonth')
    params.set('proforma', String(query.value.mode === 'proforma'))
    params.set('groupBy', 'SERVICE')
    params.set('enhanced', 'false')
    if (query.value.accounts.length > 0) params.set('accountIds', query.value.accounts.join(','))
    return `/api/costs/summary?${params.toString()}`
  }

  const fetchCosts = async () => {
    // Clear any pending debounce since we're fetching now
    isPending.value = false
    if (debounceTimer) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }

    // Cancel any in-flight request
    if (abortController) {
      abortController.abort()
    }
    abortController = new AbortController()
    const signal = abortController.signal
    const thisGeneration = ++fetchGeneration

    loadingPhase.value = 'core'
    isFetching.value = true
    fetchError.value = null
    fetchWarnings.value = []

    const currentTimeframe = query.value.timeframe
    const currentMode = query.value.mode
    const currentAccounts = [...query.value.accounts]
    const currentCostScopeAccounts = [...getCostScopeAccounts()]
    const isHistorical = ['last7days', 'last30days', 'last90days', 'lastMonth', 'lastQuarter', 'lastYear', 'last12months'].includes(currentTimeframe)

    // Check client-side cache before making network requests
    const cached = getCachedDataset(currentCostScopeAccounts, currentTimeframe, currentMode)
    if (cached) {
      dataset.value = accountsList?.value
        ? { ...cached, accountsList: accountsList.value }
        : cached
      isFetching.value = false
      loadingPhase.value = 'complete'
      return
    }

    try {
      // ── Fire ALL requests at t=0 ──
      // Browser handles connection pooling (6 conn limit for HTTP/1.1,
      // multiplexed for HTTP/2). Core requests are queued first so they
      // get priority. Deferred requests start filling connections as
      // core requests complete, eliminating the idle gap between phases.

      // Core batch (awaited first for immediate UI) — retried on transient errors
      const summaryP = retryWithBackoff(() => $fetch(buildSummaryUrl(), { signal }))
      const historicalP = retryWithBackoff(() => $fetch(buildHistoricalUrl(), { signal }))
      const analysisP = retryWithBackoff(() => $fetch(buildAnalysisUrl(), { signal }))
      const servicesP = retryWithBackoff(() => $fetch(buildServicesSummaryUrl(), { signal }))

      // Deferred wave 1: chart-critical (forecast + org-wide historical)
      // Fired now, awaited after core renders
      const warnOnFail = (label: string) => (err: any) => {
        if (err?.name !== 'AbortError') {
          fetchWarnings.value.push(`${label} data unavailable`)
        }
        return null
      }
      const wave1: Record<string, Promise<any>> = {}
      if (!isHistorical) {
        wave1.forecast = $fetch(buildForecastUrl(), { signal }).catch(warnOnFail('Forecast'))
        wave1.extendedForecast = $fetch(buildExtendedForecastUrl(), { signal }).catch(warnOnFail('Extended forecast'))
        wave1.yearEndForecast = $fetch(buildYearEndForecastUrl(), { signal }).catch(warnOnFail('Year-end forecast'))
      }
      wave1.orgWideHistorical = $fetch(buildOrgWideHistoricalUrl(), { signal }).catch(warnOnFail('Org-wide historical'))

      // Deferred wave 2: data-table supplements
      // Fired now, awaited after wave 1 patches the dataset
      const wave2: Record<string, Promise<any>> = {}
      wave2.ytdSummary = $fetch(buildYtdSummaryUrl(), { signal }).catch(warnOnFail('YTD summary'))
      // Skip duplicate requests — reuse core summaryRes when URLs would match
      if (currentTimeframe !== 'lastMonth') {
        wave2.lastMonthSummary = $fetch(buildLastMonthSummaryUrl(), { signal }).catch(warnOnFail('Last month summary'))
      }
      if (!isHistorical && !(currentTimeframe === 'thisMonth' && currentCostScopeAccounts.length === 0)) {
        wave2.currentMonthOrgWide = $fetch(buildCurrentMonthOrgWideSummaryUrl(), { signal }).catch(warnOnFail('Current month org-wide'))
      }
      wave2.lastMonthServices = $fetch(buildLastMonthServicesSummaryUrl(), { signal }).catch(warnOnFail('Last month services'))

      // ── Phase 1: Await core batch for immediate UI rendering ──
      const [summaryRes, historicalRes, analysisRes, servicesRes] = await Promise.all([
        summaryP, historicalP, analysisP, servicesP
      ])

      if (thisGeneration !== fetchGeneration) return

      dataset.value = {
        accounts: currentAccounts,
        costScopeAccounts: currentCostScopeAccounts,
        accountsList: accountsList?.value,
        mode: currentMode,
        timeframe: currentTimeframe,
        summary: summaryRes as any,
        historical: historicalRes as any,
        orgWideHistorical: null,
        ytdSummary: null,
        lastMonthSummary: null,
        currentMonthOrgWide: null,
        forecast: null,
        extendedForecast: null,
        yearEndForecast: null,
        analysis: analysisRes as any,
        services: servicesRes as any,
        lastMonthServices: null
      }

      isFetching.value = false
      loadingPhase.value = 'wave1'
      isDeferredLoading.value = true

      // ── Phase 2: Await wave 1 (already in-flight since t=0) ──
      const wave1Keys = Object.keys(wave1)
      const wave1Results = await Promise.all(Object.values(wave1))

      if (thisGeneration === fetchGeneration && dataset.value && dataset.value.timeframe === currentTimeframe && dataset.value.mode === currentMode) {
        const patch: Record<string, any> = {}
        wave1Keys.forEach((key, i) => { patch[key] = wave1Results[i] })
        dataset.value = { ...dataset.value, ...patch }
      }
      loadingPhase.value = 'wave2'

      if (thisGeneration !== fetchGeneration) {
        isDeferredLoading.value = false
        return
      }

      // ── Phase 3: Await wave 2 (already in-flight since t=0) ──
      const wave2Keys = Object.keys(wave2)
      const wave2Results = await Promise.all(Object.values(wave2))

      if (thisGeneration === fetchGeneration && dataset.value && dataset.value.timeframe === currentTimeframe && dataset.value.mode === currentMode) {
        const patch: Record<string, any> = {}
        wave2Keys.forEach((key, i) => { patch[key] = wave2Results[i] })
        // Apply duplicate reuse from core summaryRes
        if (currentTimeframe === 'lastMonth') {
          patch.lastMonthSummary = summaryRes
        }
        if (!isHistorical && currentTimeframe === 'thisMonth' && currentCostScopeAccounts.length === 0) {
          patch.currentMonthOrgWide = summaryRes
        }
        dataset.value = { ...dataset.value, ...patch }
      }

      isDeferredLoading.value = false
      loadingPhase.value = 'complete'

      // Store completed dataset in client-side cache
      if (thisGeneration === fetchGeneration && dataset.value) {
        setCachedDataset(currentCostScopeAccounts, currentTimeframe, currentMode, dataset.value)
      }

    } catch (e: any) {
      // Ignore abort errors - these are expected when a newer fetch supersedes
      if (e?.name === 'AbortError' || thisGeneration !== fetchGeneration) {
        isDeferredLoading.value = false
        loadingPhase.value = 'idle'
        return
      }
      fetchError.value = getUserFriendlyMessage(e)
      isFetching.value = false
      isDeferredLoading.value = false
      loadingPhase.value = 'idle'
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
    if (!initialized.value) return
    debouncedFetch()
  }, { deep: true })

  if (defaultAccountScope) {
    watch(defaultAccountScope, () => {
      if (!initialized.value || selectedAccounts.value.length > 0) return
      debouncedFetch()
    }, { deep: true })
  }

  // Watch for accountsList changes to update dataset without refetching
  // This fixes a race condition where costs APIs return before accounts list
  if (accountsList) {
    watch(accountsList, (newList) => {
      if (dataset.value && newList && newList.length > 0) {
        dataset.value = {
          ...dataset.value,
          accountsList: newList
        }
      }
    }, { deep: true })
  }

  // Server caches are source-keyed; a mode change only invalidates local snapshots.
  watch(mode, (newMode, oldMode) => {
    if (!initialized.value) return
    if (oldMode !== undefined && newMode !== oldMode) {
      invalidateByMode(oldMode)
      invalidateByMode(newMode)
    }
  })

  // Watch for changes to timeframe and mode without debouncing
  // NOT immediate -- initial fetch is triggered explicitly by the page's onMounted
  watch([selectedTimeframe, mode], () => {
    if (!initialized.value) return
    void fetchCosts()
  })

  // Watch for tag groupBy changes - re-fetch when the active tag key changes
  if (groupByTag) {
    watch(groupByTag, () => {
      if (!initialized.value) return
      void fetchCosts()
    })
  }

  // Cleanup on unmount
  onUnmounted(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer)
    }
    if (abortController) {
      abortController.abort()
    }
  })

  return { mode, isFetching, isDeferredLoading, isPending, loadingPhase, fetchError, fetchWarnings, dataset, fetchCosts, initialized }
}
