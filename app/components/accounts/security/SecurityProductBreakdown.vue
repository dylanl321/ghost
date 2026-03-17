<template>
  <div class="w-full">
    <VChart :option="chartOptions" :style="{ height: chartHeight }" autoresize />
  </div>
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

// Sort products descending by count
const sortedProducts = computed(() =>
  Object.entries(props.findingsByProduct)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10) // cap at top 10
)

const chartHeight = computed(() => {
  const items = Math.max(3, sortedProducts.value.length)
  return `${items * 40 + 20}px`
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const splitLineColor = computed(() => isDark.value ? '#374151' : '#e5e7eb')

const chartOptions = computed(() => {
  const products = sortedProducts.value.map(([name]) => name)
  const counts = sortedProducts.value.map(([, count]) => count)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    grid: { left: '2%', right: '8%', top: '5%', bottom: '5%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor.value } }
    },
    yAxis: {
      type: 'category',
      data: products,
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
      inverse: true
    },
    series: [
      {
        type: 'bar',
        data: counts,
        barMaxWidth: 28,
        itemStyle: { color: '#3b82f6', borderRadius: [0, 4, 4, 0] },
        label: {
          show: true,
          position: 'right',
          color: axisLabelColor.value,
          fontSize: 11
        }
      }
    ],
    backgroundColor: 'transparent'
  }
})
</script>
