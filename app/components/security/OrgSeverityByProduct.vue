<template>
  <UCard>
    <template #header>
      <div class="text-base font-semibold text-gray-900 dark:text-white">Severity by Product</div>
    </template>
    <div v-if="!data || data.length === 0" class="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500">
      No data available
    </div>
    <VChart v-else :option="chartOptions" :style="{ height: chartHeight + 'px' }" autoresize />
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { SeverityByProductEntry } from '#shared/types/security-dashboard'

echarts.use([BarChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

const SEVERITY_COLORS: Record<string, string> = {
  Critical: '#EF4444',
  High: '#F97316',
  Medium: '#EAB308',
  Low: '#22C55E',
  Informational: '#3B82F6',
}

const props = defineProps<{
  data: SeverityByProductEntry[]
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const splitLineColor = computed(() => isDark.value ? '#374151' : '#e5e7eb')

// Top 10 products, reversed for horizontal bar (highest at top)
const topProducts = computed(() => (props.data || []).slice(0, 10).reverse())
const chartHeight = computed(() => Math.max(240, topProducts.value.length * 36 + 60))

const chartOptions = computed(() => {
  const products = topProducts.value.map(p => p.product.length > 22 ? p.product.slice(0, 20) + '...' : p.product)
  const severities = ['Critical', 'High', 'Medium', 'Low', 'Informational'] as const
  const sevKeys = ['critical', 'high', 'medium', 'low', 'informational'] as const

  const series = severities.map((sev, i) => ({
    name: sev,
    type: 'bar' as const,
    stack: 'total',
    data: topProducts.value.map(p => p[sevKeys[i]]),
    itemStyle: { color: SEVERITY_COLORS[sev] },
    barMaxWidth: 20,
  }))

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    legend: {
      bottom: 0,
      textStyle: { color: axisLabelColor.value, fontSize: 11 },
    },
    grid: { left: '2%', right: '6%', top: '2%', bottom: '14%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor.value } },
    },
    yAxis: {
      type: 'category',
      data: products,
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
    },
    series,
  }
})
</script>
