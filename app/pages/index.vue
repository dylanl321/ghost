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
          <UTooltip v-if="monthToDateTrend !== 0" text="Comparison to same days last month">
            <div :class="`flex gap-1 items-center ${monthToDateTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
              <UIcon
                :name="`${monthToDateTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                class="w-5 h-5" />
              <p>{{ formatNumber(monthToDateTrend, 1) }}%</p>
            </div>
          </UTooltip>
        </div>

        <p class="text-lg font-semibold">
          {{ formatCurrency(mtdTotal, 0) }}
        </p>
      </UCard>

      <!-- Projected Spend -->
      <UCard class="p-2">
        <div class="flex justify-between">
          <p class="text-sm font-medium text-gray-400">Projected Spend</p>
          <UTooltip v-if="projectedSpendTrend !== 0" text="Comparison to previous month spend">
            <div
              :class="`flex gap-1 items-center ${projectedSpendTrend > 0 ? 'text-red-500' : 'text-green-500'}`">
              <UIcon
                :name="`${projectedSpendTrend > 0 ? 'i-heroicons-arrow-trending-up' : 'i-heroicons-arrow-trending-down'}`"
                class="w-5 h-5" />
              <p>{{ formatNumber(projectedSpendTrend, 1) }}%</p>
            </div>
          </UTooltip>
        </div>

        <p class="text-lg font-semibold">
          {{ formatCurrency(projectedSpend, 0) }}
        </p>
      </UCard>

      <!-- Previous Month -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Previous Month</p>
        <p class="text-lg font-semibold">
          {{ formatCurrency(previousMonthSpend, 0) }}
        </p>
      </UCard>

      <!-- Active Accounts -->
      <UCard class="p-2">
        <p class="text-sm font-medium text-gray-400">Active Accounts</p>
        <p class="text-lg font-semibold">
          {{ activeAccounts }}
        </p>
      </UCard>
    </div>

    <div class="grid grid-cols-3 gap-4 auto-rows-fr">
      <UserEnclaves :loading="loading" class="col-span-2" />

      <!-- Account insights (tall) -->
      <AccountInsights :top-accounts="topAccounts" :loading="loading"
        class="col-span-1 row-span-2" />
      
      <!-- Organization cost trends -->
      <CostTrendChart title="Organization Cost Trends"
        :time-series-billable="dailySpend" :loading="loading" class="col-span-2" />

      <!-- Resource usage under cost trends -->
      <!-- <ResourceUsage class="col-span-2" /> -->
    </div>

    <!-- <UButton class="mr-2" @click="() => logout()">Logout</UButton> -->
    <!-- <UButton @click="clear">Clear Stores</UButton> -->
  </div>
</template>

<script setup lang="ts">

const { user } = useOidcAuth()
// const userGroupStore = useUserGroupStore()
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
  daily: DailyCost[];
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

const mtdTotal = computed(() => orgOverview.value?.data.monthToDateTotal || 0)
const previousMTDTotal = computed(() => orgOverview.value?.data.previousMonthToDateTotal || 0)
const projectedSpend = computed(() => orgOverview.value?.data.forecastedTotal || 0)
const previousMonthSpend = computed(() => orgOverview.value?.data.previousMonthTotal || 0)
const activeAccounts = computed(() => orgOverview.value?.data.activeAccounts || 0)
const dailySpend = computed(() => orgOverview.value?.data.daily.slice(-15, -1) || [])

const monthToDateTrend = computed(() => {
  if (!previousMTDTotal.value) return 0
  return ((mtdTotal.value - previousMTDTotal.value) / previousMTDTotal.value) * 100
})

const projectedSpendTrend = computed(() => {
  if (!previousMonthSpend.value) return 0
  return ((projectedSpend.value - previousMonthSpend.value) / previousMonthSpend.value) * 100
})

const topAccounts = computed(() => {
  if (!orgOverview.value) return []
  return orgOverview.value?.data.topAccounts.map((acct) => ({
    accountId: acct.accountId,
    cost: acct.cost,
    name: enclaveStore.enclaves[acct.accountId]?.projectName || "Unknown Name",
    percentOfTotal: (acct.cost / mtdTotal.value) * 100
  }))
})

onMounted(async () => {
  try {
    const response = await fetch('/api/organization/overview-simplified')
    orgOverview.value = await response.json();
  } catch (err) {
    console.error('Failed to fetch overview:', err)
  } finally {
    loading.value = false
  }
})

</script>
