<template>
  <div class="space-y-6 lg:space-y-8 p-6 max-w-[1600px] mx-auto">
    <!-- Welcome Header Card -->
    <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <ClientOnly>
            <p class="text-sm text-gray-500 dark:text-gray-400 mb-0.5">{{ currentGreeting }}</p>
            <template #fallback>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-0.5">Hello</p>
            </template>
          </ClientOnly>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ user?.claims?.given_name || 'User' }}
          </h1>
        </div>

        <!-- Personal summary stats -->
        <ClientOnly>
          <div class="flex items-center gap-5">
            <div v-if="userAccountCount > 0" class="text-right">
              <p class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">My Accounts</p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">{{ userAccountCount }}</p>
            </div>
            <div v-if="userAccountCount > 0" class="w-px h-10 bg-gray-200 dark:bg-gray-700" />
            <div class="text-right">
              <p class="text-[11px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {{ userAccountCount > 0 ? 'My MTD Cost' : 'Org MTD Cost' }}
              </p>
              <p class="text-xl font-bold text-gray-900 dark:text-white">
                {{ formatCurrency(userAccountCount > 0 ? userTotalCost : mtdTotal, 0) }}
              </p>
            </div>
          </div>
          <template #fallback>
            <div class="flex items-center gap-5">
              <div class="text-right animate-pulse">
                <div class="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-1.5 ml-auto" />
                <div class="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded ml-auto" />
              </div>
            </div>
          </template>
        </ClientOnly>
      </div>

      <!-- Quick Actions + Scope/Timeframe Controls -->
      <div class="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
        <NuxtLink to="/account/explorer">
          <UButton icon="i-heroicons-magnifying-glass" size="xs" variant="soft" color="blue">
            Search Accounts
          </UButton>
        </NuxtLink>
        <NuxtLink to="/account/costs">
          <UButton icon="i-heroicons-chart-bar" size="xs" variant="soft" color="purple">
            Cost Reports
          </UButton>
        </NuxtLink>
        <NuxtLink to="/account/user">
          <UButton icon="i-heroicons-users" size="xs" variant="soft" color="emerald">
            User Access
          </UButton>
        </NuxtLink>
        <NuxtLink to="/support/docs">
          <UButton icon="i-heroicons-book-open" size="xs" variant="ghost">
            Support
          </UButton>
        </NuxtLink>
        <div class="flex-1" />

        <!-- Scope & Timeframe selectors -->
        <ClientOnly>
          <div class="flex items-center gap-2">
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                v-for="option in dashboardScopeOptions"
                :key="option.value"
                @click="handleScopeChange(option.value)"
                class="px-2 py-1 text-[11px] font-medium rounded-md transition-all duration-150"
                :class="dashboardScope === option.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              >
                {{ option.label }}
              </button>
            </div>
            <div class="w-px h-5 bg-gray-200 dark:bg-gray-700" />
            <div class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              <button
                v-for="option in dashboardDateRangeOptions"
                :key="option.value"
                @click="handleDateRangeChange(option.value)"
                class="px-2 py-1 text-[11px] font-medium rounded-md transition-all duration-150"
                :class="dashboardDateRange === option.value
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              >
                {{ option.label }}
              </button>
            </div>
          </div>
          <template #fallback>
            <div class="flex items-center gap-2">
              <div class="h-7 w-36 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
              <div class="h-7 w-28 bg-gray-100 dark:bg-gray-800 rounded-lg animate-pulse" />
            </div>
          </template>
        </ClientOnly>

        <UPopover v-model:open="showSpotlight" :popper="{ placement: 'bottom-end' }" :disabled="customizeDashboardSeen">
          <UTooltip text="Customize dashboard">
            <div class="relative" @click.capture="handleCustomizeClick">
              <UButton
                icon="i-heroicons-cog-6-tooth"
                size="xs"
                variant="ghost"
                color="gray"
              />
              <span v-if="!customizeDashboardSeen"
                class="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-75" />
                <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary-500" />
              </span>
            </div>
          </UTooltip>
          <template #panel>
            <div class="p-3 max-w-xs">
              <p class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Customize Your Dashboard</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Reorder, show, or hide sections to match your workflow. New cards like Favorites and Recent Accounts are available!
              </p>
              <div class="flex gap-2">
                <UButton size="xs" color="primary" @click="handleSpotlightTryIt">Try it</UButton>
                <UButton size="xs" variant="ghost" color="gray" @click="handleSpotlightDismiss">Dismiss</UButton>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
    </div>

    <ClientOnly>
      <DashboardMcpOfferingBanner />
    </ClientOnly>

    <!-- Error Alert -->
    <UAlert v-if="fetchError" color="red" icon="i-heroicons-exclamation-triangle" variant="soft">
      <template #title>{{ fetchError }}</template>
      <template #description>
        <UButton @click="fetchOverview()" size="sm" color="red" variant="outline" class="mt-2">
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4 mr-1" />
          Retry
        </UButton>
      </template>
    </UAlert>

    <!-- Dynamic Sections (ordered by user preference, client-only to avoid hydration mismatch from localStorage-based layout) -->
    <ClientOnly>
      <div class="grid grid-cols-12 gap-6 lg:gap-8">
        <template v-for="section in visibleSections" :key="section.id">
          <div class="grid min-w-0 overflow-hidden" :class="sectionColSpan(section.displayStyle)">
            <QuickStartCard v-if="section.id === 'quickStart'" :display-style="section.displayStyle || 'full'" />

            <DashboardBudgetAlerts
              v-else-if="section.id === 'budgetAlerts'"
              :loading="dashboardAlertsLoading || loading"
              :total="dashboardAlertsTotal"
              :by-severity="dashboardAlertsBySeverity"
            />

            <DashboardMetricCards
              v-else-if="section.id === 'metricCards'"
              :loading="loading"
              :mtd-total="mtdTotal"
              :projected-spend="projectedSpend"
              :previous-month-spend="previousMonthSpend"
              :active-accounts="activeAccounts"
              :month-to-date-trend="monthToDateTrend"
              :projected-spend-trend="projectedSpendTrend"
              :current-pace-vs-previous="currentPaceVsPrevious"
              :month-progress-percent="monthProgressPercent"
              :current-day-of-month="currentDayOfMonth"
              :days-remaining-in-month="daysRemainingInMonth"
              :previous-month-days="previousMonthDays"
              :budget-health="budgetHealth"
              :has-budget-data="hasBudgetData"
              :visible-cards="layoutConfig.metricCards"
              :visible-count="visibleMetricCardCount"
              :user-mtd-total="userTotalCost"
              :user-active-accounts="userActiveAccountCount"
            />

            <DashboardMyAccounts
              v-else-if="section.id === 'myAccounts'"
              :loading="loading"
              :user-account-count="userAccountCount"
              :display-style="section.displayStyle || 'full'"
            />

            <DashboardAdminSection
              v-else-if="section.id === 'adminOverview'"
              :is-admin="isAdminUser"
            />

            <DashboardAlertsCard
              v-else-if="section.id === 'adminAlerts'"
            />

            <DashboardPipelineCard
              v-else-if="section.id === 'adminPipeline'"
            />

            <DashboardFeedbackCard
              v-else-if="section.id === 'adminFeedback'"
            />

            <DashboardCostTrend
              v-else-if="section.id === 'costTrend'"
              :active-cost-trend="activeCostTrend"
              :loading="loading || scopeCostLoading"
            />

            <DashboardTopAccounts
              v-else-if="section.id === 'topAccounts'"
              :top-accounts="topAccounts"
              :loading="loading || accountsLoading"
              @toggle-proforma="handleProformaToggle"
            />

            <DashboardFavoriteAccounts
              v-else-if="section.id === 'favoriteAccounts'"
              :all-account-costs="orgOverview?.data?.allAccountCosts"
              :loading="loading"
              :display-style="section.displayStyle || 'full'"
            />

            <DashboardRecentlyViewed
              v-else-if="section.id === 'recentlyViewed'"
              :display-style="section.displayStyle || 'full'"
            />

            <DashboardMyAccountCosts
              v-else-if="section.id === 'myAccountCosts'"
              :all-account-costs="orgOverview?.data?.allAccountCosts"
              :loading="loading"
              :display-style="section.displayStyle || 'full'"
            />

            <DashboardNewAccounts
              v-else-if="section.id === 'newAccounts'"
              :display-style="section.displayStyle || 'full'"
            />

            <DashboardOperationsGlance
              v-else-if="section.id === 'operationsGlance'"
              :display-style="section.displayStyle || 'full'"
              :budget-alert-count="dashboardAlertsTotal"
              :active-accounts="activeAccounts"
              :loading="loading"
            />

            <DashboardMyActivity
              v-else-if="section.id === 'myActivity'"
              :display-style="section.displayStyle || 'full'"
            />

            <DashboardSecuritySnapshot
              v-else-if="section.id === 'securitySnapshot'"
              :display-style="section.displayStyle || 'full'"
            />

            <AiInsightCard
              v-else-if="section.id === 'aiBriefing'"
              type="dashboard-briefing"
              title="AI Briefing"
              icon="i-heroicons-sparkles"
              :context="aiBriefingContext"
            />

            <DashboardCommandPalette
              v-else-if="section.id === 'commandPalette'"
              :display-style="section.displayStyle || 'third'"
            />

            <DashboardAchievements
              v-else-if="section.id === 'achievements'"
              :display-style="section.displayStyle || 'third'"
            />
          </div>
        </template>
      </div>

      <!-- Non-admin personalized section (when user has no accounts) -->
      <div v-if="!isAdminUser && userAccountCount === 0 && !loading" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 text-center">
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
          <UIcon name="i-heroicons-user-plus" class="w-6 h-6 text-blue-500" />
        </div>
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-1">Get Started with GHOST</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
          You don't have any AWS accounts assigned yet. Browse the organization's accounts or contact your administrator for access.
        </p>
        <div class="flex items-center justify-center gap-2">
          <NuxtLink to="/account/explorer">
            <UButton icon="i-heroicons-magnifying-glass" size="sm" variant="soft" color="blue">Browse Accounts</UButton>
          </NuxtLink>
          <NuxtLink to="/account/org-chart">
            <UButton icon="i-heroicons-building-office" size="sm" variant="soft" color="purple">Org Chart</UButton>
          </NuxtLink>
          <NuxtLink to="/support/docs">
            <UButton icon="i-heroicons-book-open" size="sm" variant="ghost">Documentation</UButton>
          </NuxtLink>
        </div>
      </div>

      <template #fallback>
        <div class="space-y-6">
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
            <div class="h-4 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div v-for="n in 3" :key="n" class="h-24 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            </div>
          </div>
          <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 animate-pulse">
            <div class="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded mb-4" />
            <div class="h-48 bg-gray-100 dark:bg-gray-800 rounded-lg" />
          </div>
        </div>
      </template>
    </ClientOnly>

    <!-- Customize Panel -->
    <DashboardCustomizePanel v-model="showCustomizePanel" />
  </div>
</template>

<script setup lang="ts">

const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()
const { getPreference, setPreference, initialized: prefsInitialized, loading: prefsLoading, load: loadPrefs } = useUserPreferences()
const { isAdmin } = useUserRoles()
const { favoriteIds } = useFavoriteAccounts()
const { visibleSections, visibleMetricCardCount, sectionColSpan, setSectionStyle, layout: layoutConfig, ensureOrgDefault } = useDashboardLayout()
const {
  scope: dashboardScope,
  dateRange: dashboardDateRange,
  scopeOptions: dashboardScopeOptions,
  dateRangeOptions: dashboardDateRangeOptions,
  dateRangeDays,
  setScope,
  setDateRange,
  init: initDashboardScope,
} = useDashboardScope()

const showCustomizePanel = ref(false)
const showSpotlight = ref(false)

const customizeDashboardSeen = computed(() => getPreference<boolean>('customizeDashboardSeen', false))

// Fallback admin check in case useUserRoles hasn't evaluated yet
const isAdminUser = computed(() => isAdmin.value || userGroupStore.allEntraGroups.includes('AWS-Product-Team'))

interface OverviewResponse {
  success: boolean;
  data: DashboardData;
}
interface DashboardData {
  activeAccounts: number;
  suspendedAccounts: number;
  monthToDateTotal: number;
  forecastedTotal: number;
  previousMonthTotal: number;
  previousMonthToDateTotal: number;
  topAccounts: TopAccount[];
  allAccountCosts?: Record<string, number>;
  rolling14Daily: DailyCost[];
  budgetHealth: BudgetHealth;
}
interface BudgetHealth {
  totalBudget: number;
  accountsOverBudget: number;
  actualDailyBurnRate: number;
  expectedDailyBudgetRate: number;
  burnRateVsBudget: number;
  projectedMonthlySpend: number;
  accountsWithBudget: number;
}
interface TopAccount {
  accountId: string;
  cost: number;
}
interface DailyCost {
  date: string;
  cost: number;
}

const orgOverview = ref<OverviewResponse | null>(null)
const loading = ref(true)
const accountsLoading = ref(false)
const useProforma = ref(true)
const fetchError = ref<string | null>(null)

const mtdTotal = computed(() => orgOverview.value?.data?.monthToDateTotal || 0)
const previousMTDTotal = computed(() => orgOverview.value?.data?.previousMonthToDateTotal || 0)
const projectedSpend = computed(() => orgOverview.value?.data?.forecastedTotal || 0)
const previousMonthSpend = computed(() => orgOverview.value?.data?.previousMonthTotal || 0)
const activeAccounts = computed(() => orgOverview.value?.data?.activeAccounts || 0)
const last14DaysSpend = computed(() => orgOverview.value?.data?.rolling14Daily || [])
const budgetHealth = computed(() => orgOverview.value?.data?.budgetHealth || {
  totalBudget: 0,
  accountsOverBudget: 0,
  actualDailyBurnRate: 0,
  expectedDailyBudgetRate: 0,
  burnRateVsBudget: 0,
  projectedMonthlySpend: 0,
  accountsWithBudget: 0,
})

const hasBudgetData = computed(() => {
  const bh = budgetHealth.value
  return bh.accountsWithBudget > 0 && bh.totalBudget > 0
})

const monthToDateTrend = computed(() => {
  if (!previousMTDTotal.value || previousMTDTotal.value === 0) return null
  const trend = ((mtdTotal.value - previousMTDTotal.value) / previousMTDTotal.value) * 100
  if (!isFinite(trend)) return null
  return trend
})

const projectedSpendTrend = computed(() => {
  if (!previousMonthSpend.value || previousMonthSpend.value === 0) return null
  const trend = ((projectedSpend.value - previousMonthSpend.value) / previousMonthSpend.value) * 100
  if (!isFinite(trend)) return null
  return trend
})

// Date calculations
const currentDayOfMonth = computed(() => new Date().getDate())
const daysInMonth = computed(() => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
})
const daysRemainingInMonth = computed(() => daysInMonth.value - currentDayOfMonth.value)
const monthProgressPercent = computed(() =>
  Math.round((currentDayOfMonth.value / daysInMonth.value) * 100)
)

const previousMonthDays = computed(() => {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()
})

const currentPaceVsPrevious = computed(() => {
  if (!previousMonthSpend.value || !mtdTotal.value || currentDayOfMonth.value === 0) return null
  const currentDailyRate = mtdTotal.value / currentDayOfMonth.value
  const previousDailyRate = previousMonthSpend.value / previousMonthDays.value
  if (previousDailyRate === 0) return null
  const pace = ((currentDailyRate - previousDailyRate) / previousDailyRate) * 100
  if (!isFinite(pace)) return null
  return pace
})

const topAccounts = computed(() => {
  if (!orgOverview.value?.data?.topAccounts) return []
  const hasEnclaves = enclaveStore.enclaves && Object.keys(enclaveStore.enclaves).length > 0
  return orgOverview.value.data.topAccounts.map((acct) => ({
    accountId: acct.accountId,
    cost: acct.cost,
    name: hasEnclaves
      ? (enclaveStore.enclaves[acct.accountId]?.projectName || acct.accountId)
      : acct.accountId,
    percentOfTotal: mtdTotal.value > 0 ? (acct.cost / mtdTotal.value) * 100 : 0
  }))
})

const currentGreeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

const userAccountCount = computed(() => {
  return Object.keys(userGroupStore.myEnclaves).length
})

const userTotalCost = computed(() => {
  const costs = orgOverview.value?.data?.allAccountCosts
  if (!costs) return 0
  const userAccountIds = Object.keys(userGroupStore.myEnclaves)
  return userAccountIds.reduce((sum, id) => sum + (costs[id] || 0), 0)
})

// AI Briefing context — only populated once overview data loads
const aiBriefingContext = computed(() => {
  if (!orgOverview.value?.data) return {}
  return {
    mtdTotal: mtdTotal.value,
    projectedSpend: projectedSpend.value,
    previousMonthSpend: previousMonthSpend.value,
    activeAccounts: activeAccounts.value,
    budgetHealth: budgetHealth.value,
    alertsBySeverity: dashboardAlertsBySeverity.value,
    topAccounts: topAccounts.value.slice(0, 5),
    userAccountCount: userAccountCount.value,
    userMtdCost: userTotalCost.value,
  }
})

const userActiveAccountCount = computed(() =>
  Object.keys(userGroupStore.myEnclaves).filter(id =>
    enclaveStore.enclaves[id]?.accountStatus === 'ACTIVE'
  ).length
)


// Spotlight handlers
async function handleCustomizeClick(e: Event) {
  e.stopPropagation()
  showSpotlight.value = false
  showCustomizePanel.value = true
  if (!customizeDashboardSeen.value) {
    await setPreference('customizeDashboardSeen', true)
  }
}
async function handleSpotlightTryIt() {
  showSpotlight.value = false
  showCustomizePanel.value = true
  await setPreference('customizeDashboardSeen', true)
}
async function handleSpotlightDismiss() {
  showSpotlight.value = false
  await setPreference('customizeDashboardSeen', true)
}

// Budget alerts for the Budget Health card
import type { BudgetAlert } from '#shared/types/budget-alerts'

const logger = createLogger('Index')
const dashboardAlerts = ref<BudgetAlert[]>([])
const dashboardAlertsLoading = ref(true)

const dashboardAlertsTotal = computed(() => dashboardAlerts.value.length)
const dashboardAlertsBySeverity = computed(() => {
  const counts = { critical: 0, warning: 0, info: 0, escalation: 0 }
  for (const alert of dashboardAlerts.value) {
    const level = alert.alert_level?.toUpperCase()
    if (level === 'CRITICAL') counts.critical++
    else if (level === 'WARNING') counts.warning++
    else if (level === 'INFO') counts.info++
    else if (level === 'ESCALATION') counts.escalation++
  }
  return counts
})

async function fetchDashboardAlerts() {
  try {
    dashboardAlertsLoading.value = true
    const now = new Date()
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const res = await $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
      query: { month, limit: 100 }
    })
    dashboardAlerts.value = res.success && res.data ? res.data : []
  } catch {
    dashboardAlerts.value = []
  } finally {
    dashboardAlertsLoading.value = false
  }
}

// Scoped cost data (for non-org scope)
const scopedCostData = ref<{ date: string; cost: number }[] | null>(null)
const scopeCostLoading = ref(false)

const activeCostTrend = computed(() => {
  if (dashboardScope.value === 'org' || !scopedCostData.value) {
    return last14DaysSpend.value
  }
  return scopedCostData.value
})

async function fetchScopedCosts(scope: string) {
  if (scope === 'org') {
    scopedCostData.value = null
    return
  }

  const accountIds = scope === 'favorites'
    ? favoriteIds.value
    : Object.keys(userGroupStore.myEnclaves)

  if (accountIds.length === 0) {
    scopedCostData.value = []
    return
  }

  scopeCostLoading.value = true
  try {
    const now = new Date()
    const end = now.toISOString().split('T')[0]
    const start = new Date(now.getTime() - dateRangeDays.value * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

    const params = new URLSearchParams({
      startDate: start,
      endDate: end,
      granularity: 'DAILY',
      groupBy: 'NONE',
      proforma: String(useProforma.value),
      accountIds: accountIds.join(',')
    })

    const result = await $fetch<{ success: boolean; data: any }>(`/api/costs/summary?${params}`)
    if (result.success && result.data) {
      const rawResults = result.data.billable?.resultsByTime
        || result.data.proforma?.resultsByTime
        || result.data.resultsByTime
        || []

      scopedCostData.value = rawResults.map((item: any) => ({
        date: item.TimePeriod?.Start || item.timePeriod?.start || item.date || '',
        cost: parseFloat(
          item.Total?.UnblendedCost?.Amount
          || item.total?.UnblendedCost?.Amount
          || item.total?.amount
          || item.total
          || '0'
        )
      })).filter((d: any) => d.date)
    }
  } catch (err) {
    logger.error('Failed to fetch scoped costs:', err)
    scopedCostData.value = null
  } finally {
    scopeCostLoading.value = false
  }
}

function handleScopeChange(value: string) {
  setScope(value as 'org' | 'mine' | 'favorites')
  if (value === 'org') {
    scopedCostData.value = null
  } else {
    fetchScopedCosts(value)
  }
}

function handleDateRangeChange(days: typeof dashboardDateRange.value) {
  setDateRange(days)
  if (dashboardScope.value === 'org') {
    fetchOverview(false, true)
  } else {
    fetchScopedCosts(dashboardScope.value)
  }
}

async function fetchOverview(onlyAccounts = false, onlyCostTrend = false) {
  if (onlyCostTrend) {
    scopeCostLoading.value = true
  } else if (onlyAccounts) {
    accountsLoading.value = true
  } else {
    loading.value = true
  }

  try {
    const url = `/api/organization/overview-simplified?proforma=${useProforma.value}&days=${dateRangeDays.value}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(apiErrorMessage(result, 'Failed to fetch overview'))
    }

    orgOverview.value = result
    fetchError.value = null
  } catch (err) {
    logger.error('Failed to fetch overview:', err)
    fetchError.value = 'Unable to load dashboard data. Please try again.'
    orgOverview.value = null
  } finally {
    if (onlyCostTrend) {
      scopeCostLoading.value = false
    } else if (onlyAccounts) {
      accountsLoading.value = false
    } else {
      loading.value = false
    }
  }
}

function handleProformaToggle(value: boolean) {
  useProforma.value = value
  setPreference('dashboardProforma', value)
  fetchOverview(true)
}

async function ensureDashboardPreferences() {
  if (prefsInitialized.value) return
  if (!prefsLoading.value) {
    await loadPrefs()
    return
  }

  await new Promise<void>((resolve) => {
    const stop = watch([prefsInitialized, prefsLoading], ([ready, stillLoading]) => {
      if (ready || !stillLoading) {
        stop()
        resolve()
      }
    }, { immediate: true })
  })
}

onMounted(async () => {
  // Load user prefs and org default in parallel so layout renders correctly
  await Promise.all([
    ensureDashboardPreferences(),
    ensureOrgDefault(),
  ])
  useProforma.value = getPreference('dashboardProforma', true)
  initDashboardScope()
  // Show spotlight if user hasn't seen it yet
  if (!getPreference<boolean>('customizeDashboardSeen', false)) {
    showSpotlight.value = true
  }
  await Promise.all([fetchOverview(), fetchDashboardAlerts()])
  // If scope was restored to non-org, fetch scoped costs after overview loads
  if (dashboardScope.value !== 'org') {
    fetchScopedCosts(dashboardScope.value)
  }
})

</script>
