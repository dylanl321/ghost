<template>
  <div class="grid grid-cols-1 xl:grid-cols-3 gap-6">
    <CostTrendChart
      title="Cost Trends"
      :time-series-billable="activeCostTrend"
      :loading="loading"
      :scope="scope"
      :scope-options="scopeOptions"
      :date-range="dateRange"
      :date-range-options="dateRangeOptions"
      class="xl:col-span-2"
      @update:scope="$emit('update:scope', $event)"
      @update:date-range="$emit('update:dateRange', $event)"
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
  scope: string
  scopeOptions: { label: string; value: string }[]
  dateRange: number
  dateRangeOptions: { label: string; value: number }[]
  topAccounts: { accountId: string; cost: number; name: string; percentOfTotal: number }[]
}>()

defineEmits<{
  'update:scope': [scope: string]
  'update:dateRange': [days: number]
  'toggleProforma': [value: boolean]
}>()
</script>
