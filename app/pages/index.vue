<template>
  <div class="space-y-6 p-6">
    <!-- Enhanced Welcome Card -->
    <UCard class="overflow-hidden relative border-gray-200 dark:border-gray-800">
      <!-- Gradient Background -->
      <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent pointer-events-none" />

      <template #header>
        <div class="relative z-10">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <ClientOnly>
                <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">{{ currentGreeting }}</p>
                <template #fallback>
                  <p class="text-sm text-gray-600 dark:text-gray-400 mb-1">Hello</p>
                </template>
              </ClientOnly>
              <h1 class="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {{ user?.claims?.given_name || 'User' }}
              </h1>
              <ClientOnly>
                <p class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ currentDate }}
                </p>
                <template #fallback>
                  <p class="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                    Loading...
                  </p>
                </template>
              </ClientOnly>
            </div>

            <!-- Quick Stats Summary - User's Personal Stats -->
            <ClientOnly>
              <div v-if="userAccountCount > 0" class="flex items-center gap-3">
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">My Accounts</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ userAccountCount }}</p>
                </div>
                  <div class="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">My MTD Cost</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(userTotalCost, 0) }}</p>
                </div>
              </div>
              <!-- Fallback to org stats if user has no accounts -->
              <div v-else class="flex items-center gap-3">
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Org Accounts</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ activeAccounts }}</p>
                </div>
                  <div class="w-px h-12 bg-gray-200 dark:bg-gray-700"></div>
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Org MTD</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ formatCurrency(mtdTotal, 0) }}</p>
                </div>
              </div>
              <template #fallback>
                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Loading...</p>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">--</p>
                  </div>
                </div>
              </template>
            </ClientOnly>
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center gap-2 mt-4 pt-4 border-t border-gray-200 dark:border-gray-800">
            <NuxtLink to="/account/explorer">
              <UButton icon="i-heroicons-magnifying-glass" size="sm" variant="soft" color="blue">
                Search Accounts
              </UButton>
            </NuxtLink>
            <NuxtLink to="/account/costs">
              <UButton icon="i-heroicons-chart-bar" size="sm" variant="soft" color="purple">
                Cost Reports
              </UButton>
            </NuxtLink>
            <NuxtLink to="/account/user">
              <UButton icon="i-heroicons-users" size="sm" variant="soft" color="emerald">
                User Access
              </UButton>
            </NuxtLink>
            <NuxtLink to="/support/docs">
              <UButton icon="i-heroicons-book-open" size="sm" variant="ghost">
                Support
              </UButton>
            </NuxtLink>

            <!-- FUTURE: Notifications Bell (when notification system is implemented)
            <div class="ml-auto">
              <UButton icon="i-heroicons-bell" size="sm" variant="ghost">
                <UBadge color="red" size="xs" class="absolute -top-1 -right-1">3</UBadge>
              </UButton>
            </div>
            -->
          </div>
        </div>
      </template>
    </UCard>

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

    <!-- Quick Start Card for New Users -->
    <QuickStartCard />

    <!-- FUTURE: Recent Activity Feed
         When implementing notifications/activity tracking:
         1. Create a new component: ActivityFeed.vue
         2. Display recent events like:
            - New accounts created
            - Budget threshold alerts
            - Cost anomaly detections
            - Account status changes
         3. Store events in DynamoDB with timestamp, type, severity
         4. Add API endpoint: /api/activity/recent.get.ts
         5. Show max 5 items with "View All" link to dedicated activity page
         6. Color code by severity (info=blue, warning=yellow, critical=red)
    -->


    <!-- Metric Displays -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">

      <!-- Month to Date -->
      <UCard class="relative overflow-hidden p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 border-blue-500">
        <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent pointer-events-none" />
        <div class="relative z-10">
          <div class="flex justify-between">
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Month to Date Cost</p>
            <UTooltip v-if="monthToDateTrend !== null" text="Comparison to same days last month">
              <div :class="`flex gap-1 items-center ${monthToDateTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
                <UIcon
                  :name="`${monthToDateTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                  class="w-5 h-5" />
                <p>{{ formatNumber(monthToDateTrend, 1) }}%</p>
              </div>
            </UTooltip>
          </div>

          <p class="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            {{ formatCurrency(mtdTotal, 0) }}
          </p>

          <!-- Progress bar for month elapsed -->
          <ClientOnly>
            <div class="space-y-1">
              <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div
                  class="bg-blue-500 h-1.5 rounded-full transition-all"
                  :style="{ width: `${monthProgressPercent}%` }"
                />
              </div>
              <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                <span>Day {{ currentDayOfMonth }}</span>
                <span>{{ monthProgressPercent }}% of month</span>
              </div>
            </div>
          </ClientOnly>
        </div>
      </UCard>

      <!-- Projected Spend -->
      <UCard :class="`relative overflow-hidden p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 ${
        projectedSpend > budgetHealth.totalBudget && budgetHealth.totalBudget > 0 ? 'border-red-500' :
        projectedSpend > budgetHealth.totalBudget * 0.9 && budgetHealth.totalBudget > 0 ? 'border-yellow-500' :
        'border-purple-500'
      }`">
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent pointer-events-none" />
        <div class="relative z-10">
          <div class="flex justify-between">
            <UTooltip text="AWS Cost Explorer ML forecast">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Forecasted Cost</p>
            </UTooltip>
            <UTooltip v-if="projectedSpend !== 0 && projectedSpendTrend !== null" text="Comparison to previous month spend">
              <div
                :class="`flex gap-1 items-center ${projectedSpendTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
                <UIcon
                  :name="`${projectedSpendTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                  class="w-5 h-5" />
                <p>{{ formatNumber(projectedSpendTrend, 1) }}%</p>
              </div>
            </UTooltip>
          </div>

          <p v-if="projectedSpend !== 0" class="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            {{ formatCurrency(projectedSpend, 0) }}
          </p>
          <p v-else class="text-lg font-semibold mb-2 text-gray-900 dark:text-white">Not enough data</p>

          <!-- Budget comparison if available -->
          <div v-if="budgetHealth.totalBudget > 0 && projectedSpend > 0" class="text-xs space-y-0.5">
            <div class="flex justify-between">
              <span class="text-gray-600 dark:text-gray-400">vs Budget:</span>
              <span :class="`font-medium ${projectedSpend > budgetHealth.totalBudget ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`">
                {{ projectedSpend > budgetHealth.totalBudget ? '+' : '' }}{{ formatCurrency(projectedSpend - budgetHealth.totalBudget, 0) }}
              </span>
            </div>
            <div class="flex justify-between">
              <span class="text-gray-600 dark:text-gray-400">Remaining days:</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ daysRemainingInMonth }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Previous Month -->
      <UCard class="relative overflow-hidden p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 border-gray-500">
        <div class="absolute inset-0 bg-gradient-to-br from-slate-500/10 via-slate-500/5 to-transparent pointer-events-none" />
        <div class="relative z-10">
          <div class="flex justify-between items-start">
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Previous Month</p>
            <UTooltip text="Full month actual cost">
              <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-gray-500" />
            </UTooltip>
          </div>

          <p class="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
            {{ formatCurrency(previousMonthSpend, 0) }}
          </p>

          <!-- Show difference vs 2 months ago if we're tracking positive -->
          <div v-if="mtdTotal > 0" class="text-xs space-y-0.5">
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Avg/day:</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ formatCurrency(previousMonthSpend / previousMonthDays, 0) }}</span>
            </div>
            <div v-if="currentPaceVsPrevious !== null" class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Current pace:</span>
              <span :class="`font-medium ${currentPaceVsPrevious > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`">
                {{ currentPaceVsPrevious > 0 ? '+' : '' }}{{ formatNumber(currentPaceVsPrevious, 1) }}%
              </span>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Active Accounts -->
      <UCard class="relative overflow-hidden p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 border-emerald-500">
        <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent pointer-events-none" />
        <div class="relative z-10">
          <div class="flex justify-between items-start">
            <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Active Accounts</p>
            <UTooltip :text="`${budgetHealth.accountsWithBudget} with budgets`">
              <UBadge color="blue" variant="soft" size="xs">
                {{ budgetHealth.accountsWithBudget }}
              </UBadge>
            </UTooltip>
          </div>

          <div class="flex items-baseline gap-2 mb-2">
            <p class="text-lg font-semibold text-gray-900 dark:text-white">
              {{ activeAccounts }}
            </p>
            <UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-blue-500 dark:text-blue-400" />
          </div>

          <!-- Cost per account metric -->
          <div v-if="mtdTotal > 0 && activeAccounts > 0" class="text-xs">
            <div class="flex justify-between text-gray-600 dark:text-gray-400">
              <span>Avg cost/account:</span>
              <span class="font-medium text-gray-900 dark:text-white">{{ formatCurrency(mtdTotal / activeAccounts, 0) }}</span>
            </div>
          </div>
        </div>
      </UCard>

      <!-- Budget Health -->
      <UCard :class="`relative overflow-hidden p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 ${
        !hasBudgetData ? 'border-gray-500' :
        budgetHealth.burnRateVsBudget > 10 ? 'border-red-500' :
        budgetHealth.burnRateVsBudget > 0 ? 'border-yellow-500' :
        'border-green-500'
      }`">
        <div class="absolute inset-0 bg-gradient-to-br from-emerald-500/8 via-amber-500/5 to-transparent pointer-events-none" />
        <div class="relative z-10">
          <div class="flex justify-between items-start mb-2">
            <UTooltip text="Daily burn rate vs budget (excludes day 1 savings plan charges)">
              <p class="text-sm font-medium text-gray-600 dark:text-gray-400">Budget Health</p>
            </UTooltip>
            <UTooltip
              v-if="hasBudgetData && budgetHealth.accountsOverBudget > 0"
              :text="`${budgetHealth.accountsOverBudget} of ${budgetHealth.accountsWithBudget} accounts over budget`">
              <UBadge color="red" variant="soft" size="xs">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 mr-1" />
                {{ budgetHealth.accountsOverBudget }}
              </UBadge>
            </UTooltip>
          </div>

          <template v-if="hasBudgetData">
            <!-- Burn Rate Comparison -->
            <div class="flex items-baseline gap-2 mb-1">
              <p :class="`text-2xl font-bold ${
                budgetHealth.burnRateVsBudget > 10 ? 'text-red-600 dark:text-red-400' :
                budgetHealth.burnRateVsBudget > 0 ? 'text-yellow-600 dark:text-yellow-400' :
                'text-green-600 dark:text-green-400'
              }`">
                {{ budgetHealth.burnRateVsBudget > 0 ? '+' : '' }}{{ formatNumber(budgetHealth.burnRateVsBudget, 1) }}%
              </p>
              <UIcon
                :name="`${budgetHealth.burnRateVsBudget > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                :class="`w-5 h-5 ${budgetHealth.burnRateVsBudget > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`" />
            </div>

            <!-- Daily Rates -->
            <div class="text-xs space-y-0.5 mb-2">
              <div class="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Actual:</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ formatCurrency(budgetHealth.actualDailyBurnRate, 0) }}/day</span>
              </div>
              <div class="flex justify-between text-gray-600 dark:text-gray-400">
                <span>Budget:</span>
                <span class="font-medium text-gray-900 dark:text-white">{{ formatCurrency(budgetHealth.expectedDailyBudgetRate, 0) }}/day</span>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-2">No budget data available</p>
            <p class="text-xs text-gray-500">Configure account budgets in the Account Details page</p>
          </template>

          <!-- View Details Link -->
          <NuxtLink
            to="/account/costs?chartTab=budget-health"
            class="block text-center text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium mt-2 pt-2 border-t border-gray-200 dark:border-gray-700"
          >
            View Budget Health Details →
          </NuxtLink>
        </div>
      </UCard>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <UserEnclaves v-if="userAccountCount > 0" :loading="loading" class="xl:col-span-2" />

      <!-- Account insights (tall) -->
      <AccountInsights :top-accounts="topAccounts" :loading="loading || accountsLoading"
        @toggle-proforma="handleProformaToggle"
        class="xl:row-span-2" />
      
      <!-- Organization cost trends -->
      <CostTrendChart title="Organization Cost Trends"
        :time-series-billable="last14DaysSpend" :loading="loading" class="xl:col-span-2" />

      <!-- Resource usage under cost trends -->
      <!-- <ResourceUsage class="col-span-2" /> -->
    </div>

    <!-- <UButton class="mr-2" @click="() => logout()">Logout</UButton> -->
    <!-- <UButton @click="clear">Clear Stores</UButton> -->
  </div>
</template>

<script setup lang="ts">

const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()
const { getPreference, setPreference, initialized: prefsInitialized, load: loadPrefs } = useUserPreferences()

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
  date: string; // e.g. "2025-09-26"
  cost: number;
}

const orgOverview = ref<OverviewResponse | null>(null)
const loading = ref(true)
const accountsLoading = ref(false)
const useProforma = ref(true) // Default to proforma
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

// Previous month days
const previousMonthDays = computed(() => {
  const now = new Date()
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0).getDate()
})

// Current pace vs previous month
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
  // Guard against uninitialized enclave store - show account ID as fallback
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

// Dynamic greeting based on time of day
const currentGreeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
})

// Formatted current date
const currentDate = computed(() => {
  const now = new Date()
  return now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

// User's personal account stats
const userAccountCount = computed(() => {
  return Object.keys(userGroupStore.myEnclaves).length
})

const userTotalCost = computed(() => {
  const costs = orgOverview.value?.data?.allAccountCosts
  if (!costs) return 0
  const userAccountIds = Object.keys(userGroupStore.myEnclaves)
  return userAccountIds.reduce((sum, id) => sum + (costs[id] || 0), 0)
})

async function fetchOverview(onlyAccounts = false) {
  if (onlyAccounts) {
    accountsLoading.value = true
  } else {
    loading.value = true
  }

  try {
    const url = `/api/organization/overview-simplified?proforma=${useProforma.value}`
    const response = await fetch(url)

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error || 'Failed to fetch overview')
    }

    orgOverview.value = result
    fetchError.value = null
  } catch (err) {
    console.error('Failed to fetch overview:', err)
    fetchError.value = 'Unable to load dashboard data. Please try again.'
    orgOverview.value = null
  } finally {
    if (onlyAccounts) {
      accountsLoading.value = false
    } else {
      loading.value = false
    }
  }
}

function handleProformaToggle(value: boolean) {
  useProforma.value = value
  setPreference('dashboardProforma', value)
  fetchOverview(true) // Only show loading on accounts card
}

onMounted(async () => {
  // Load user preference for proforma toggle
  if (!prefsInitialized.value) await loadPrefs()
  useProforma.value = getPreference('dashboardProforma', true)
  await fetchOverview()
})

</script>
