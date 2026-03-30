<template>
  <CostTrendChart
    title="Cost Trends"
    :time-series-billable="activeCostTrend"
    :loading="loading"
  />
</template>

<script setup lang="ts">
defineProps<{
  activeCostTrend: { date: string; cost: number }[]
  loading: boolean
}>()
</script>
