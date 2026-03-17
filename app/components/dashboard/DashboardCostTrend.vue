<template>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <CostTrendChart
      title="Cost Trends"
      :time-series-billable="activeCostTrend"
      :loading="loading"
      class="xl:col-span-2"
    />

    <AccountInsights
      :top-accounts="topAccounts"
      :loading="accountsLoading"
      @toggle-proforma="$emit('toggleProforma', $event)"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  activeCostTrend: { date: string; cost: number }[]
  loading: boolean
  accountsLoading: boolean
  topAccounts: { accountId: string; cost: number; name: string; percentOfTotal: number }[]
}>()

defineEmits<{
  'toggleProforma': [value: boolean]
}>()
</script>
