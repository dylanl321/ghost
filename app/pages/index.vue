<template>
  <div class="p-6">
    <h1 class="text-3xl mb-8">Overview</h1>
    <UserEnclaves class="mb-4"/>

    <div v-if="loading" class="text-gray-400">Loading...</div>

    <div v-else class="grid grid-cols-3 gap-4">
      <OrganizationCostTrends
        v-if="overview?.costs.timeSeries"
        :time-series="overview.costs.timeSeries.slice(-14)"
        class="mb-6 col-span-2"
      />

      <AccountInsights
        v-if="overview?.costs.topAccounts"
        :top-accounts="overview.costs.topAccounts"
        class="mb-6 col-span-1"
      />
    </div>

    <UButton class="mt-4 mr-2" @click="() => logout()">Logout</UButton>
    <UButton class="mt-4" @click="clear">Clear Stores</UButton>
  </div>
</template>

<script setup lang="ts">
const { logout } = useOidcAuth()
const userGroupStore = useUserGroupStore()
const enclaveStore = useEnclaveStore()

interface OverviewResponse {
  costs: Costs;
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
})

</script>
