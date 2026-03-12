<template>
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
    <!-- Over Budget Card -->
    <div class="bg-red-900/20 border border-red-800 rounded-lg p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="p-2 bg-red-900/40 rounded-lg">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-5 h-5 text-red-400" />
        </div>
        <span class="text-sm font-medium text-red-300">Over Budget</span>
      </div>
      <div class="text-2xl font-bold text-red-400">{{ overBudgetCount }}</div>
      <div class="text-xs text-red-400/70 mt-1">
        {{ formatCurrency(totalOverBudgetAmount) }} over
      </div>
    </div>

    <!-- Healthy Card -->
    <div class="bg-green-900/20 border border-green-800 rounded-lg p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="p-2 bg-green-900/40 rounded-lg">
          <UIcon name="i-heroicons-check-circle" class="w-5 h-5 text-green-400" />
        </div>
        <span class="text-sm font-medium text-green-300">Healthy</span>
      </div>
      <div class="text-2xl font-bold text-green-400">{{ healthyCount }}</div>
      <div class="text-xs text-green-400/70 mt-1">
        50-100% utilization
      </div>
    </div>

    <!-- Underutilized Card -->
    <div class="bg-blue-900/20 border border-blue-800 rounded-lg p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="p-2 bg-blue-900/40 rounded-lg">
          <UIcon name="i-heroicons-arrow-trending-down" class="w-5 h-5 text-blue-400" />
        </div>
        <span class="text-sm font-medium text-blue-300">Underutilized</span>
      </div>
      <div class="text-2xl font-bold text-blue-400">{{ underutilizedCount }}</div>
      <div class="text-xs text-blue-400/70 mt-1">
        {{ formatCurrency(totalUnutilizedAmount) }} unused
      </div>
    </div>

    <!-- Average Utilization Card -->
    <div class="bg-purple-900/20 border border-purple-800 rounded-lg p-4">
      <div class="flex items-center gap-2 mb-2">
        <div class="p-2 bg-purple-900/40 rounded-lg">
          <UIcon name="i-heroicons-chart-bar" class="w-5 h-5 text-purple-400" />
        </div>
        <span class="text-sm font-medium text-purple-300">Avg Utilization</span>
      </div>
      <div class="text-2xl font-bold text-purple-400">{{ averageUtilization.toFixed(1) }}%</div>
      <div class="text-xs text-purple-400/70 mt-1">
        {{ totalAccountsWithBudget }} accounts with budget
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { NormalizedDataset } from '~/types/costs'

const props = defineProps<{
  dataset: NormalizedDataset | null
  dataMode?: 'billable' | 'proforma'
}>()

// Helper to extract analysis data
const extractAnalysisData = (dataset: NormalizedDataset | null, dataMode: string = 'billable') => {
  if (!dataset?.analysis) return null

  const analysisData = dataset.analysis as any
  const actualData = analysisData?.data || analysisData

  const analysisSource = dataMode === 'proforma' && actualData?.proforma
    ? actualData.proforma
    : actualData

  return analysisSource
}

// Calculate summary metrics
const summaryMetrics = computed(() => {
  const analysisSource = extractAnalysisData(props.dataset, props.dataMode || 'billable')

  if (!analysisSource?.budgetAnalysis?.byAccount) {
    return {
      overBudgetCount: 0,
      totalOverBudgetAmount: 0,
      healthyCount: 0,
      underutilizedCount: 0,
      totalUnutilizedAmount: 0,
      averageUtilization: 0,
      totalAccountsWithBudget: 0
    }
  }

  const accounts = analysisSource.budgetAnalysis.byAccount
  const accountsWithBudget = accounts.filter((acc: any) => acc.budgetedCost > 0)

  // Over budget accounts
  const overBudget = accountsWithBudget.filter((acc: any) => acc.actualCost > acc.budgetedCost)
  const totalOverBudgetAmount = overBudget.reduce((sum: number, acc: any) =>
    sum + (acc.actualCost - acc.budgetedCost), 0)

  // Healthy accounts (50-100% utilization)
  const healthy = accountsWithBudget.filter((acc: any) => {
    const util = (acc.actualCost / acc.budgetedCost) * 100
    return util >= 50 && util <= 100
  })

  // Underutilized accounts (<50% utilization)
  const underutilized = accountsWithBudget.filter((acc: any) => {
    const util = (acc.actualCost / acc.budgetedCost) * 100
    return util < 50
  })
  const totalUnutilizedAmount = underutilized.reduce((sum: number, acc: any) =>
    sum + (acc.budgetedCost - acc.actualCost), 0)

  // Average utilization
  const totalUtilization = accountsWithBudget.reduce((sum: number, acc: any) => {
    return sum + ((acc.actualCost / acc.budgetedCost) * 100)
  }, 0)
  const averageUtilization = accountsWithBudget.length > 0
    ? totalUtilization / accountsWithBudget.length
    : 0

  return {
    overBudgetCount: overBudget.length,
    totalOverBudgetAmount,
    healthyCount: healthy.length,
    underutilizedCount: underutilized.length,
    totalUnutilizedAmount,
    averageUtilization,
    totalAccountsWithBudget: accountsWithBudget.length
  }
})

// Expose computed values
const overBudgetCount = computed(() => summaryMetrics.value.overBudgetCount)
const totalOverBudgetAmount = computed(() => summaryMetrics.value.totalOverBudgetAmount)
const healthyCount = computed(() => summaryMetrics.value.healthyCount)
const underutilizedCount = computed(() => summaryMetrics.value.underutilizedCount)
const totalUnutilizedAmount = computed(() => summaryMetrics.value.totalUnutilizedAmount)
const averageUtilization = computed(() => summaryMetrics.value.averageUtilization)
const totalAccountsWithBudget = computed(() => summaryMetrics.value.totalAccountsWithBudget)
</script>
