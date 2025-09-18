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
        <p class="text-sm font-medium text-gray-400">Month to Date Spend</p>
        <p class="text-lg font-semibold">
          {{ formatCurrencyNoDecimal(overview?.costs.budgetAnalysis.actualSpend || 0) }}
        </p>
      </UCard>

      <!-- Projected Spend -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Projected Spend</p>
        <p class="text-lg font-semibold">
          {{ formatCurrencyNoDecimal(overview?.costs.budgetAnalysis.projectedSpend || 0) }}
        </p>
      </UCard>

      <!-- Previous Month -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Previous Month</p>
        <p class="text-lg font-semibold">
          $0
        </p>
      </UCard>

      <!-- Active Accounts -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Active Accounts</p>
        <p class="text-lg font-semibold">
          {{ overview?.summary.activeAccounts || 0 }}
        </p>
      </UCard>
    </div>

    <UserEnclaves :loading="loading" />

    <div class="grid grid-cols-3 gap-4">
      <OrganizationCostTrends :time-series="overview?.costs.timeSeries.slice(-14) || []" :loading="loading"
        class="col-span-2" />

      <AccountInsights :top-accounts="overview?.costs.topAccounts || []" :loading="loading"
        class="col-span-1" />
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

const overview = ref<OverviewResponse | null>(null)
const loading = ref(true)

const clear = () => {
  enclaveStore.clear()
  userGroupStore.clear()
}

onMounted(async () => {
  try {
    const response = await fetch('/api/organization/overview')
    const json = await response.json();
    overview.value = json.data
  } catch (err) {
    console.error('Failed to fetch overview:', err)
  } finally {
    loading.value = false
  }

  console.log('my enclaves', userGroupStore.myEnclaves)
  console.log('all enclaves', enclaveStore.enclaves)
})

</script>
