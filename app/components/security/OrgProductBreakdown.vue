<template>
  <UCard>
    <template #header>
      <div class="text-base font-semibold text-gray-900 dark:text-white">Findings by Product</div>
    </template>
    <VChart :option="chartOptions" class="h-64" autoresize />
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

echarts.use([BarChart, TooltipComponent, GridComponent, CanvasRenderer])

const props = defineProps<{
  findingsByProduct: Record<string, number>
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const splitLineColor = computed(() => isDark.value ? '#374151' : '#e5e7eb')

const chartOptions = computed(() => {
  // Sort descending by count, take top 10
  const sorted = Object.entries(props.findingsByProduct || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .reverse() // Reverse so highest value is at top of horizontal bar chart

  const categories = sorted.map(([name]) => name)
  const values = sorted.map(([, count]) => count)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
    },
    grid: { left: '2%', right: '8%', top: '2%', bottom: '2%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor.value } },
    },
    yAxis: {
      type: 'category',
      data: categories,
      axisLabel: {
        color: axisLabelColor.value,
        fontSize: 11,
        // Truncate long product names
        formatter: (val: string) => val.length > 20 ? val.slice(0, 18) + '…' : val,
      },
    },
    series: [
      {
        type: 'bar',
        data: values,
        itemStyle: { color: '#3B82F6', borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: axisLabelColor.value,
          fontSize: 11,
        },
      },
    ],
  }
})
</script>
