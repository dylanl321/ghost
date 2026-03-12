<template>
  <div class="space-y-6 p-6">
    <!-- Welcome Header Card -->
    <div class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
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

      <!-- Quick Actions -->
      <div class="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
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
      </div>
    </div>

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

    <!-- Budget Alerts Strip -->
    <div v-if="!dashboardAlertsLoading && !loading && dashboardAlertsTotal > 0" class="flex items-center gap-2.5 px-1 -mb-3">
      <Icon name="i-heroicons-bell-alert" class="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
      <span class="text-[11px] text-gray-500 dark:text-gray-400">
        {{ dashboardAlertsTotal }} budget alert{{ dashboardAlertsTotal !== 1 ? 's' : '' }} this month
      </span>
      <span class="text-[11px] text-gray-400 dark:text-gray-500">&middot;</span>
      <span v-if="dashboardAlertsBySeverity.critical > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span class="w-1.5 h-1.5 rounded-full bg-red-500" />{{ dashboardAlertsBySeverity.critical }} critical
      </span>
      <span v-if="dashboardAlertsBySeverity.escalation > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span class="w-1.5 h-1.5 rounded-full bg-red-400" />{{ dashboardAlertsBySeverity.escalation }} escalation
      </span>
      <span v-if="dashboardAlertsBySeverity.warning > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span class="w-1.5 h-1.5 rounded-full bg-yellow-500" />{{ dashboardAlertsBySeverity.warning }} warning{{ dashboardAlertsBySeverity.warning !== 1 ? 's' : '' }}
      </span>
      <span v-if="dashboardAlertsBySeverity.info > 0" class="flex items-center gap-1 text-[11px] text-gray-500 dark:text-gray-400">
        <span class="w-1.5 h-1.5 rounded-full bg-blue-400" />{{ dashboardAlertsBySeverity.info }} info
      </span>
      <NuxtLink
        to="/account/costs?chartTab=budget-health"
        class="text-[11px] text-blue-500 hover:text-blue-400 transition-colors"
      >
        View &rarr;
      </NuxtLink>
    </div>

    <!-- Metric Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <!-- Month to Date -->
      <div class="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-blue-500" />
        <template v-if="loading">
          <div class="animate-pulse space-y-2">
            <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full" />
          </div>
        </template>
        <template v-else>
          <div class="flex justify-between items-start mb-1">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Month to Date</p>
            <UTooltip v-if="monthToDateTrend !== null" text="vs same period last month">
              <span class="text-xs font-semibold" :class="monthToDateTrend > 0 ? 'text-red-500' : 'text-green-500'">
                {{ monthToDateTrend > 0 ? '+' : '' }}{{ formatNumber(monthToDateTrend, 1) }}%
              </span>
            </UTooltip>
          </div>
          <p class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ formatCurrency(mtdTotal, 0) }}</p>
          <ClientOnly>
            <div class="space-y-1">
              <div class="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500" :style="{ width: `${monthProgressPercent}%` }" />
              </div>
              <div class="flex justify-between text-[10px] text-gray-400 dark:text-gray-500">
                <span>Day {{ currentDayOfMonth }}</span>
                <span>{{ monthProgressPercent }}% of month</span>
              </div>
            </div>
          </ClientOnly>
        </template>
      </div>

      <!-- Forecasted Cost -->
      <div class="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full" :class="
          projectedSpend > budgetHealth.totalBudget && budgetHealth.totalBudget > 0 ? 'bg-red-500' :
          projectedSpend > budgetHealth.totalBudget * 0.9 && budgetHealth.totalBudget > 0 ? 'bg-yellow-500' :
          'bg-purple-500'" />
        <template v-if="loading">
          <div class="animate-pulse space-y-2">
            <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </template>
        <template v-else>
          <div class="flex justify-between items-start mb-1">
            <UTooltip text="AWS Cost Explorer ML forecast">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Forecast</p>
            </UTooltip>
            <UTooltip v-if="projectedSpend !== 0 && projectedSpendTrend !== null" text="vs last month total">
              <span class="text-xs font-semibold" :class="projectedSpendTrend > 0 ? 'text-red-500' : 'text-green-500'">
                {{ projectedSpendTrend > 0 ? '+' : '' }}{{ formatNumber(projectedSpendTrend, 1) }}%
              </span>
            </UTooltip>
          </div>
          <p v-if="projectedSpend !== 0" class="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {{ formatCurrency(projectedSpend, 0) }}
          </p>
          <p v-else class="text-sm text-gray-400 dark:text-gray-500 mb-2">Not enough data</p>
          <div v-if="budgetHealth.totalBudget > 0 && projectedSpend > 0" class="space-y-0.5">
            <div class="flex justify-between text-[10px]">
              <span class="text-gray-400 dark:text-gray-500">vs Budget</span>
              <span class="font-medium" :class="projectedSpend > budgetHealth.totalBudget ? 'text-red-500' : 'text-green-500'">
                {{ projectedSpend > budgetHealth.totalBudget ? '+' : '' }}{{ formatCurrency(projectedSpend - budgetHealth.totalBudget, 0) }}
              </span>
            </div>
            <div class="flex justify-between text-[10px]">
              <span class="text-gray-400 dark:text-gray-500">Days left</span>
              <span class="font-medium text-gray-600 dark:text-gray-300">{{ daysRemainingInMonth }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- Previous Month -->
      <div class="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-gray-400" />
        <template v-if="loading">
          <div class="animate-pulse space-y-2">
            <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-6 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </template>
        <template v-else>
          <div class="flex justify-between items-start mb-1">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Previous Month</p>
          </div>
          <p class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ formatCurrency(previousMonthSpend, 0) }}</p>
          <div v-if="mtdTotal > 0" class="space-y-0.5">
            <div class="flex justify-between text-[10px]">
              <span class="text-gray-400 dark:text-gray-500">Avg/day</span>
              <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(previousMonthSpend / previousMonthDays, 0) }}</span>
            </div>
            <div v-if="currentPaceVsPrevious !== null" class="flex justify-between text-[10px]">
              <span class="text-gray-400 dark:text-gray-500">Current pace</span>
              <span class="font-medium" :class="currentPaceVsPrevious > 0 ? 'text-red-500' : 'text-green-500'">
                {{ currentPaceVsPrevious > 0 ? '+' : '' }}{{ formatNumber(currentPaceVsPrevious, 1) }}%
              </span>
            </div>
          </div>
        </template>
      </div>

      <!-- Active Accounts -->
      <div class="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
        <template v-if="loading">
          <div class="animate-pulse space-y-2">
            <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-6 w-12 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </template>
        <template v-else>
          <div class="flex justify-between items-start mb-1">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Active Accounts</p>
            <UTooltip :text="`${budgetHealth.accountsWithBudget} with budgets`">
              <UBadge color="blue" variant="soft" size="xs">{{ budgetHealth.accountsWithBudget }}</UBadge>
            </UTooltip>
          </div>
          <p class="text-xl font-bold text-gray-900 dark:text-white mb-2">{{ activeAccounts }}</p>
          <div v-if="mtdTotal > 0 && activeAccounts > 0" class="flex justify-between text-[10px]">
            <span class="text-gray-400 dark:text-gray-500">Avg cost/acct</span>
            <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(mtdTotal / activeAccounts, 0) }}</span>
          </div>
        </template>
      </div>

      <!-- Budget Health -->
      <div class="relative rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 overflow-hidden">
        <div class="absolute top-0 left-0 w-1 h-full" :class="
          !hasBudgetData ? 'bg-gray-400' :
          budgetHealth.burnRateVsBudget > 10 ? 'bg-red-500' :
          budgetHealth.burnRateVsBudget > 0 ? 'bg-yellow-500' :
          'bg-green-500'" />
        <template v-if="loading">
          <div class="animate-pulse space-y-2">
            <div class="h-3 w-24 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-6 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
            <div class="h-3 w-28 bg-gray-200 dark:bg-gray-700 rounded" />
          </div>
        </template>
        <template v-else>
          <div class="flex justify-between items-start mb-1">
            <UTooltip text="Burn rate vs budget (excl. day 1 savings plan)">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Budget Health</p>
            </UTooltip>
            <UTooltip
              v-if="hasBudgetData && budgetHealth.accountsOverBudget > 0"
              :text="`${budgetHealth.accountsOverBudget} of ${budgetHealth.accountsWithBudget} over budget`">
              <UBadge color="red" variant="soft" size="xs">{{ budgetHealth.accountsOverBudget }} over</UBadge>
            </UTooltip>
          </div>

          <template v-if="hasBudgetData">
            <p class="text-xl font-bold mb-2" :class="
              budgetHealth.burnRateVsBudget > 10 ? 'text-red-500' :
              budgetHealth.burnRateVsBudget > 0 ? 'text-yellow-500' :
              'text-green-500'">
              {{ budgetHealth.burnRateVsBudget > 0 ? '+' : '' }}{{ formatNumber(budgetHealth.burnRateVsBudget, 1) }}%
            </p>
            <div class="space-y-0.5">
              <div class="flex justify-between text-[10px]">
                <span class="text-gray-400 dark:text-gray-500">Actual</span>
                <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(budgetHealth.actualDailyBurnRate, 0) }}/day</span>
              </div>
              <div class="flex justify-between text-[10px]">
                <span class="text-gray-400 dark:text-gray-500">Budget</span>
                <span class="font-medium text-gray-600 dark:text-gray-300">{{ formatCurrency(budgetHealth.expectedDailyBudgetRate, 0) }}/day</span>
              </div>
            </div>
          </template>
          <template v-else>
            <p class="text-sm text-gray-400 dark:text-gray-500 mb-1">No budget data</p>
            <p class="text-[10px] text-gray-400 dark:text-gray-500">Set budgets in Account Details</p>
          </template>

          <NuxtLink
            v-if="hasBudgetData"
            to="/account/costs?chartTab=budget-health"
            class="block text-[10px] text-blue-500 hover:text-blue-400 font-medium mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 transition-colors"
          >
            View Details →
          </NuxtLink>
        </template>
      </div>
    </div>

    <!-- My Accounts - Full Width (store state only available client-side) -->
    <ClientOnly>
      <UserEnclaves v-if="userAccountCount > 0" :loading="loading" />
    </ClientOnly>

    <!-- Admin Section - placed prominently (store state only available client-side) -->
    <ClientOnly>
      <template v-if="isAdminUser">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-shield-check" class="w-4 h-4 text-amber-500" />
          <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Admin Overview</h2>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <DashboardAlertsCard />
          <DashboardPipelineCard />
          <DashboardFeedbackCard />
        </div>
      </template>
    </ClientOnly>

    <!-- Cost Trends + Top Accounts -->
    <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <CostTrendChart
        title="Cost Trends"
        :time-series-billable="activeCostTrend"
        :loading="loading || scopeCostLoading"
        :scope="costScope"
        :scope-options="costScopeOptions"
        class="xl:col-span-2"
        @update:scope="handleCostScopeChange"
      />

      <AccountInsights
        :top-accounts="topAccounts"
        :loading="loading || accountsLoading"
        @toggle-proforma="handleProformaToggle"
      />
    </div>

    <!-- Non-admin personalized section (when user has no accounts) -->
    <div v-if="!isAdminUser && userAccountCount === 0 && !loading" class="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 text-center">
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
  </div>
</template>

<script setup lang="ts">

const { user } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()
const { getPreference, setPreference, initialized: prefsInitialized, load: loadPrefs } = useUserPreferences()
const { isAdmin } = useUserRoles()
const { favoriteIds } = useFavoriteAccounts()

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

// Budget alerts for the Budget Health card
import type { BudgetAlert } from '@/shared/types/budget-alerts'
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
const dashboardAlertsSeverityColor = computed(() => {
  const sev = dashboardAlertsBySeverity.value
  if (sev.critical > 0 || sev.escalation > 0) return 'text-red-500'
  if (sev.warning > 0) return 'text-yellow-500'
  return 'text-blue-400'
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

// Cost scope selector
const costScope = ref('org')
const scopedCostData = ref<{ date: string; cost: number }[] | null>(null)
const scopeCostLoading = ref(false)

const costScopeOptions = computed(() => {
  const options = [{ label: 'Organization', value: 'org' }]
  if (userAccountCount.value > 0) {
    options.push({ label: 'My Accounts', value: 'mine' })
  }
  if (favoriteIds.value.length > 0) {
    options.push({ label: 'Favorites', value: 'favorites' })
  }
  return options
})

const activeCostTrend = computed(() => {
  if (costScope.value === 'org' || !scopedCostData.value) {
    return last14DaysSpend.value
  }
  return scopedCostData.value
})

async function handleCostScopeChange(scope: string) {
  costScope.value = scope

  if (scope === 'org') {
    scopedCostData.value = null
    return
  }

  // Determine which account IDs to filter by
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
    const start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

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
      // Extract resultsByTime from the correct location
      // Proforma responses nest under .billable/.proforma; non-proforma at top level
      const rawResults = result.data.billable?.resultsByTime
        || result.data.proforma?.resultsByTime
        || result.data.resultsByTime
        || []

      scopedCostData.value = rawResults.map((item: any) => ({
        // Handle both AWS uppercase (TimePeriod.Start) and normalized lowercase
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
    console.error('Failed to fetch scoped costs:', err)
    scopedCostData.value = null
  } finally {
    scopeCostLoading.value = false
  }
}

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
  fetchOverview(true)
}

onMounted(async () => {
  if (!prefsInitialized.value) await loadPrefs()
  useProforma.value = getPreference('dashboardProforma', true)
  await Promise.all([fetchOverview(), fetchDashboardAlerts()])
})

</script>
