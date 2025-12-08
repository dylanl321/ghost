<template>
  <div class="space-y-6 p-6">
    <!-- Enhanced Welcome Card -->
    <UCard class="overflow-hidden relative border-gray-800">
      <!-- Gradient Background -->
      <div class="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent pointer-events-none" />

      <template #header>
        <div class="relative z-10">
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <ClientOnly>
                <p class="text-sm text-gray-400 mb-1">{{ currentGreeting }}</p>
                <template #fallback>
                  <p class="text-sm text-gray-400 mb-1">Hello</p>
                </template>
              </ClientOnly>
              <h1 class="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                {{ user?.claims?.given_name || 'User' }}
              </h1>
              <ClientOnly>
                <p class="text-sm text-gray-400 flex items-center gap-2">
                  <UIcon name="i-heroicons-calendar" class="w-4 h-4" />
                  {{ currentDate }}
                </p>
                <template #fallback>
                  <p class="text-sm text-gray-400 flex items-center gap-2">
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
                  <p class="text-2xl font-bold text-white">{{ userAccountCount }}</p>
                </div>
                <div class="w-px h-12 bg-gray-700"></div>
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">My MTD Cost</p>
                  <p class="text-2xl font-bold text-white">{{ formatCurrency(userTotalCost, 0) }}</p>
                </div>
              </div>
              <!-- Fallback to org stats if user has no accounts -->
              <div v-else class="flex items-center gap-3">
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Org Accounts</p>
                  <p class="text-2xl font-bold text-white">{{ activeAccounts }}</p>
                </div>
                <div class="w-px h-12 bg-gray-700"></div>
                <div class="text-right">
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Org MTD</p>
                  <p class="text-2xl font-bold text-white">{{ formatCurrency(mtdTotal, 0) }}</p>
                </div>
              </div>
              <template #fallback>
                <div class="flex items-center gap-3">
                  <div class="text-right">
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Loading...</p>
                    <p class="text-2xl font-bold text-white">--</p>
                  </div>
                </div>
              </template>
            </ClientOnly>
          </div>

          <!-- Quick Actions -->
          <div class="flex items-center gap-2 mt-4 pt-4 border-t border-gray-800">
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
      <UCard class="p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 border-blue-500">
        <div class="flex justify-between">
          <p class="text-sm font-medium text-gray-400">Month to Date Cost</p>
          <UTooltip v-if="monthToDateTrend !== 0" text="Comparison to same days last month">
            <div :class="`flex gap-1 items-center ${monthToDateTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
              <UIcon
                :name="`${monthToDateTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                class="w-5 h-5" />
              <p>{{ formatNumber(monthToDateTrend, 1) }}%</p>
            </div>
          </UTooltip>
        </div>

        <p class="text-lg font-semibold mb-2">
          {{ formatCurrency(mtdTotal, 0) }}
        </p>

        <!-- Progress bar for month elapsed -->
        <ClientOnly>
          <div class="space-y-1">
            <div class="w-full bg-gray-700 rounded-full h-1.5">
              <div
                class="bg-blue-500 h-1.5 rounded-full transition-all"
                :style="{ width: `${monthProgressPercent}%` }"
              />
            </div>
            <div class="flex justify-between text-xs text-gray-400">
              <span>Day {{ currentDayOfMonth }}</span>
              <span>{{ monthProgressPercent }}% of month</span>
            </div>
          </div>
        </ClientOnly>
      </UCard>

      <!-- Projected Spend -->
      <UCard :class="`p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 ${
        projectedSpend > budgetHealth.totalBudget && budgetHealth.totalBudget > 0 ? 'border-red-500' :
        projectedSpend > budgetHealth.totalBudget * 0.9 && budgetHealth.totalBudget > 0 ? 'border-yellow-500' :
        'border-purple-500'
      }`">
        <div class="flex justify-between">
          <UTooltip text="AWS Cost Explorer ML forecast">
            <p class="text-sm font-medium text-gray-400">Forecasted Cost</p>
          </UTooltip>
          <UTooltip v-if="projectedSpend !== 0 && projectedSpendTrend !== 0" text="Comparison to previous month spend">
            <div
              :class="`flex gap-1 items-center ${projectedSpendTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
              <UIcon
                :name="`${projectedSpendTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                class="w-5 h-5" />
              <p>{{ formatNumber(projectedSpendTrend, 1) }}%</p>
            </div>
          </UTooltip>
        </div>

        <p v-if="projectedSpend !== 0" class="text-lg font-semibold mb-2">
          {{ formatCurrency(projectedSpend, 0) }}
        </p>
        <p v-else class="text-lg font-semibold mb-2">Not enough data</p>

        <!-- Budget comparison if available -->
        <div v-if="budgetHealth.totalBudget > 0 && projectedSpend > 0" class="text-xs space-y-0.5">
          <div class="flex justify-between">
            <span class="text-gray-400">vs Budget:</span>
            <span :class="`font-medium ${projectedSpend > budgetHealth.totalBudget ? 'text-red-400' : 'text-green-400'}`">
              {{ projectedSpend > budgetHealth.totalBudget ? '+' : '' }}{{ formatCurrency(projectedSpend - budgetHealth.totalBudget, 0) }}
            </span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-400">Remaining days:</span>
            <span class="font-medium text-white">{{ daysRemainingInMonth }}</span>
          </div>
        </div>
      </UCard>

      <!-- Previous Month -->
      <UCard class="p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 border-gray-500">
        <div class="flex justify-between items-start">
          <p class="text-sm font-medium text-gray-400">Previous Month</p>
          <UTooltip text="Full month actual cost">
            <UIcon name="i-heroicons-calendar-days" class="w-4 h-4 text-gray-500" />
          </UTooltip>
        </div>

        <p class="text-lg font-semibold mb-2">
          {{ formatCurrency(previousMonthSpend, 0) }}
        </p>

        <!-- Show difference vs 2 months ago if we're tracking positive -->
        <div v-if="mtdTotal > 0" class="text-xs space-y-0.5">
          <div class="flex justify-between text-gray-400">
            <span>Avg/day:</span>
            <span class="font-medium text-white">{{ formatCurrency(previousMonthSpend / previousMonthDays, 0) }}</span>
          </div>
          <div class="flex justify-between text-gray-400">
            <span>Current pace:</span>
            <span :class="`font-medium ${currentPaceVsPrevious > 0 ? 'text-red-400' : 'text-green-400'}`">
              {{ currentPaceVsPrevious > 0 ? '+' : '' }}{{ formatNumber(currentPaceVsPrevious, 1) }}%
            </span>
          </div>
        </div>
      </UCard>

      <!-- Active Accounts -->
      <UCard class="p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 border-emerald-500">
        <div class="flex justify-between items-start">
          <p class="text-sm font-medium text-gray-400">Active Accounts</p>
          <UTooltip :text="`${budgetHealth.accountsWithBudget} with budgets`">
            <UBadge color="blue" variant="soft" size="xs">
              {{ budgetHealth.accountsWithBudget }}
            </UBadge>
          </UTooltip>
        </div>

        <div class="flex items-baseline gap-2 mb-2">
          <p class="text-lg font-semibold">
            {{ activeAccounts }}
          </p>
          <UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-blue-400" />
        </div>

        <!-- Cost per account metric -->
        <div v-if="mtdTotal > 0 && activeAccounts > 0" class="text-xs">
          <div class="flex justify-between text-gray-400">
            <span>Avg cost/account:</span>
            <span class="font-medium text-white">{{ formatCurrency(mtdTotal / activeAccounts, 0) }}</span>
          </div>
        </div>
      </UCard>

      <!-- Budget Health -->
      <UCard :class="`p-2 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 border-l-4 ${
        budgetHealth.burnRateVsBudget > 10 ? 'border-red-500' :
        budgetHealth.burnRateVsBudget > 0 ? 'border-yellow-500' :
        'border-green-500'
      }`">
        <div class="flex justify-between items-start mb-2">
          <UTooltip text="Daily burn rate vs budget (excludes day 1 savings plan charges)">
            <p class="text-sm font-medium text-gray-400">Budget Health</p>
          </UTooltip>
          <UTooltip
            v-if="budgetHealth.accountsOverBudget > 0"
            :text="`${budgetHealth.accountsOverBudget} of ${budgetHealth.accountsWithBudget} accounts over budget`">
            <UBadge color="red" variant="soft" size="xs">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-3 h-3 mr-1" />
              {{ budgetHealth.accountsOverBudget }}
            </UBadge>
          </UTooltip>
        </div>

        <!-- Burn Rate Comparison -->
        <div class="flex items-baseline gap-2 mb-1">
          <p :class="`text-2xl font-bold ${
            budgetHealth.burnRateVsBudget > 10 ? 'text-red-400' :
            budgetHealth.burnRateVsBudget > 0 ? 'text-yellow-400' :
            'text-green-400'
          }`">
            {{ budgetHealth.burnRateVsBudget > 0 ? '+' : '' }}{{ formatNumber(budgetHealth.burnRateVsBudget, 1) }}%
          </p>
          <UIcon
            :name="`${budgetHealth.burnRateVsBudget > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
            :class="`w-5 h-5 ${budgetHealth.burnRateVsBudget > 0 ? 'text-red-400' : 'text-green-400'}`" />
        </div>

        <!-- Daily Rates -->
        <div class="text-xs space-y-0.5 mb-2">
          <div class="flex justify-between text-gray-400">
            <span>Actual:</span>
            <span class="font-medium text-white">{{ formatCurrency(budgetHealth.actualDailyBurnRate, 0) }}/day</span>
          </div>
          <div class="flex justify-between text-gray-400">
            <span>Budget:</span>
            <span class="font-medium">{{ formatCurrency(budgetHealth.expectedDailyBudgetRate, 0) }}/day</span>
          </div>
        </div>

        <!-- View Details Link -->
        <NuxtLink
          to="/account/costs?chartTab=budget-health"
          class="block text-center text-xs text-blue-400 hover:text-blue-300 font-medium mt-2 pt-2 border-t border-gray-700"
        >
          View Budget Health Details →
        </NuxtLink>
      </UCard>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <UserEnclaves :loading="loading" class="xl:col-span-2" />

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

const monthToDateTrend = computed(() => {
  if (!previousMTDTotal.value) return 0
  return ((mtdTotal.value - previousMTDTotal.value) / previousMTDTotal.value) * 100
})

const projectedSpendTrend = computed(() => {
  if (!previousMonthSpend.value) return 0
  return ((projectedSpend.value - previousMonthSpend.value) / previousMonthSpend.value) * 100
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
  if (!previousMonthSpend.value || !mtdTotal.value || currentDayOfMonth.value === 0) return 0
  const currentDailyRate = mtdTotal.value / currentDayOfMonth.value
  const previousDailyRate = previousMonthSpend.value / previousMonthDays.value
  return ((currentDailyRate - previousDailyRate) / previousDailyRate) * 100
})

const topAccounts = computed(() => {
  if (!orgOverview.value?.data?.topAccounts) return []
  return orgOverview.value.data.topAccounts.map((acct) => ({
    accountId: acct.accountId,
    cost: acct.cost,
    name: enclaveStore.enclaves[acct.accountId]?.projectName || "Unknown Name",
    percentOfTotal: (acct.cost / mtdTotal.value) * 100
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
  if (!orgOverview.value?.data?.topAccounts) return 0

  const userAccountIds = Object.keys(userGroupStore.myEnclaves)
  const userAccounts = orgOverview.value.data.topAccounts.filter(acct =>
    userAccountIds.includes(acct.accountId)
  )

  return userAccounts.reduce((sum, acct) => sum + acct.cost, 0)
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
  } catch (err) {
    console.error('Failed to fetch overview:', err)
    // Ensure orgOverview has a valid structure even on error
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
  fetchOverview(true) // Only show loading on accounts card
}

onMounted(async () => {
  await fetchOverview()
})

</script>
