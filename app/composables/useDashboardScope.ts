/**
 * Dashboard Scope Composable
 * Unified global scope and timeframe selector for all scope-sensitive dashboard components.
 * Singleton pattern — module-level refs shared across all consumers.
 */

type DashboardScope = 'org' | 'mine' | 'favorites'
type DateRange = 7 | 14 | 30 | 90 | 'ytd'

// Singleton state
const scope = ref<DashboardScope>('org')
const dateRange = ref<DateRange>(14)

const dateRangeOptions = [
  { label: '7D', value: 7 as DateRange },
  { label: '14D', value: 14 as DateRange },
  { label: '30D', value: 30 as DateRange },
  { label: '90D', value: 90 as DateRange },
  { label: 'YTD', value: 'ytd' as DateRange },
]

export function useDashboardScope() {
  const { getPreference, setPreference, initialized: prefsInitialized } = useUserPreferences()
  const userGroupStore = useUserGroupStore()
  const { favoriteIds } = useFavoriteAccounts()

  const scopeOptions = computed(() => {
    const options: { label: string; value: DashboardScope }[] = [
      { label: 'Organization', value: 'org' },
    ]
    if (Object.keys(userGroupStore.myEnclaves).length > 0) {
      options.push({ label: 'My Accounts', value: 'mine' })
    }
    if (favoriteIds.value.length > 0) {
      options.push({ label: 'Favorites', value: 'favorites' })
    }
    return options
  })

  const scopeLabel = computed(() => {
    switch (scope.value) {
      case 'mine': return 'My Accounts'
      case 'favorites': return 'Favorites'
      default: return 'Organization'
    }
  })

  const isScoped = computed(() => scope.value !== 'org')

  function setScope(value: DashboardScope) {
    scope.value = value
    setPreference('dashboardScope', value)
    logUserAction('dashboard.scope_change', `scope:${value}`)
    useEventBus().emit('dashboard.scope_changed', { scope: value })
  }

  function setDateRange(value: DateRange) {
    dateRange.value = value
    setPreference('costTrendDays', value)
    logUserAction('dashboard.daterange_change', `range:${value}`)
  }

  /** Restore persisted values from user preferences. Call once on mount. */
  function init() {
    if (!prefsInitialized.value) return
    const savedScope = getPreference<DashboardScope>('dashboardScope', 'org')
    // Validate the saved scope is still valid (user may have lost accounts/favorites)
    const validValues = scopeOptions.value.map(o => o.value)
    scope.value = validValues.includes(savedScope) ? savedScope : 'org'
    dateRange.value = getPreference<DateRange>('costTrendDays', 14)
  }

  /** Resolves 'ytd' to actual day count, passes numeric values through */
  const dateRangeDays = computed(() => {
    if (dateRange.value === 'ytd') {
      const now = new Date()
      const jan1 = new Date(now.getFullYear(), 0, 1)
      return Math.ceil((now.getTime() - jan1.getTime()) / (24 * 60 * 60 * 1000))
    }
    return dateRange.value
  })

  return {
    scope: readonly(scope),
    dateRange: readonly(dateRange),
    dateRangeDays,
    scopeOptions,
    dateRangeOptions,
    scopeLabel,
    isScoped,
    setScope,
    setDateRange,
    init,
  }
}
