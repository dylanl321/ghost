<template>
  <div class="space-y-6 p-6">
    <UCard>
      <template #header>
        <div>
          <h1 class="text-2xl font-bold mb-1">Welcome, {{ user?.claims?.given_name }}</h1>
          <p class="text-sm text-gray-400">
            Organization Cloud Dashboard
          </p>
        </div>
      </template>
    </UCard>

    <!-- Metric Displays -->
    <div class="grid grid-cols-4 gap-4">

      <!-- Month to Date -->
      <UCard class="p-2">
        <div class="flex justify-between">
          <p class="text-sm font-medium text-gray-400">Month to Date Spend</p>
          <div v-if="monthToDateTrend !== 0"
            :class="`flex gap-1 items-center ${monthToDateTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
            <UIcon :name="`${monthToDateTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`" class="w-5 h-5" /> 
            <p>{{ formatNumber(monthToDateTrend, 1) }}%</p>
          </div>
        </div>

        <p class="text-lg font-semibold">
          {{ formatCurrency(overviewThisMonth?.costs.budgetAnalysis.actualSpend || 0, 0) }}
        </p>
      </UCard>

      <!-- Projected Spend -->
      <UCard class="p-2">
        <div class="flex justify-between">
          <p class="text-sm font-medium text-gray-400">Projected Spend</p>
          <div v-if="projectedSpendTrend !== 0"
            :class="`flex gap-1 items-center ${projectedSpendTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
            <UIcon :name="`${projectedSpendTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`" class="w-5 h-5" /> 
            <p>{{ formatNumber(projectedSpendTrend, 1) }}%</p>
          </div>
        </div>

        <p class="text-lg font-semibold">
          {{ formatCurrency(overviewThisMonth?.costs.budgetAnalysis.projectedSpend || 0, 0) }}
        </p>
      </UCard>

      <!-- Previous Month -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Previous Month</p>
        <p class="text-lg font-semibold">
          {{ formatCurrency(overviewLastMonth?.costs.budgetAnalysis.actualSpend || 0, 0) }}
        </p>
      </UCard>

      <!-- Active Accounts -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Active Accounts</p>
        <p class="text-lg font-semibold">
          {{ overviewThisMonth?.summary.activeAccounts || 0 }}
        </p>
      </UCard>
    </div>

    <UserEnclaves :loading="loading" />

    <div class="grid grid-cols-3 gap-4 auto-rows-fr">
      <!-- Organization cost trends -->
      <OrganizationCostTrends :time-series="overviewThisMonth?.costs.timeSeries.slice(-14) || []" :loading="loading"
        class="col-span-2" />

      <!-- Account insights (tall) -->
      <AccountInsights :top-accounts="overviewThisMonth?.costs.topAccounts || []" :loading="loading"
        class="col-span-1 row-span-2" />

      <!-- Resource usage under cost trends -->
      <ResourceUsage class="col-span-2" />
    </div>

    <UButton class="mr-2" @click="() => logout()">Logout</UButton>
    <UButton @click="clear">Clear Stores</UButton>
  </div>
</template>

<script setup lang="ts">

const { user, logout } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()

interface OverviewResponse {
  summary: Summary;
  costs: Costs;
}
interface Summary {
  totalAccounts: number,
  activeAccounts: number,
  totalCostCurrent: number,
  totalCostPrevious: number,
  costGrowthPercent: number,
  lastUpdated: string, // ex. "2025-09-17T23:40:58.560Z"
}
interface Costs {
  timeSeries: TimeSeries[];
  topAccounts: TopAccount[];
  topServices: TopService[];
  budgetAnalysis: BudgetAnalysis;
}
interface TimeSeries {
  date: string;
  cost: number;
}
interface TopAccount {
  accountId: string;
  name: string;
  cost: number;
  trend: string;
  percentOfTotal: number;
}
interface TopService {
  service: string;
  cost: number;
  accountsUsing: number;
  trend: string;
}
interface BudgetAnalysis {
  analysisPeriod: string;
  totalBudget: number;
  actualSpend: number;
  projectedSpend: number;
  budgetUtilization: number;
  projectedUtilization: number;
  riskLevel: string;
  periodStatus: string;
  daysElapsed: number;
  daysRemaining: number;
}

const overviewThisMonth = ref<OverviewResponse | null>(null)
const overviewLastMonth = ref<OverviewResponse | null>(null)
const loading = ref(true)

const costSameDaysLastMonth = computed(() => {
  if (!overviewLastMonth.value) return 0

  const today = new Date(overviewThisMonth.value?.summary.lastUpdated || new Date())
  const dayOfMonth = today.getUTCDate()

  // Filter last month's time series up to same day #
  const lastMonthSeries = overviewLastMonth.value.costs.timeSeries
    .filter(entry => {
      const d = new Date(entry.date)
      return d.getUTCDate() <= dayOfMonth
    })

  return lastMonthSeries.reduce((sum, entry) => sum + entry.cost, 0)
})

const monthToDateTrend = computed(() => {
  if (costSameDaysLastMonth.value === 0 || !overviewThisMonth.value) return 0
  return ((overviewThisMonth.value.costs.budgetAnalysis.actualSpend - costSameDaysLastMonth.value) / costSameDaysLastMonth.value) * 100
})

const projectedSpendTrend = computed(() => {
  if (!overviewThisMonth.value || !overviewLastMonth.value) return 0
  return (overviewThisMonth.value?.costs.budgetAnalysis.actualSpend - overviewLastMonth.value.costs.budgetAnalysis.actualSpend) / overviewLastMonth.value.costs.budgetAnalysis.actualSpend
})

const clear = () => {
  enclaveStore.clear()
  userGroupStore.clear()
}

onMounted(async () => {
  try {
    const response = await fetch('/api/organization/overview')
    const json = await response.json();
    overviewThisMonth.value = json.data

    const response2 = await fetch('/api/organization/overview?analysisTimeframe=previous-month')
    const json2 = await response2.json();
    overviewLastMonth.value = json2.data
  } catch (err) {
    console.error('Failed to fetch overview:', err)
  } finally {
    loading.value = false
  }

  console.log('my enclaves', userGroupStore.myEnclaves)
})

</script>
