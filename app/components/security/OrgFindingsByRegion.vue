<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-base font-semibold text-gray-900 dark:text-white">Findings by Region</div>
        <UBadge color="gray" variant="soft" size="sm">{{ regionCount }} regions</UBadge>
      </div>
    </template>
    <div v-if="regionCount === 0" class="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500">
      No region data available
    </div>
    <VChart v-else :option="chartOptions" class="h-72" autoresize />
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
  findingsByRegion: Record<string, number>
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const splitLineColor = computed(() => isDark.value ? '#374151' : '#e5e7eb')

const regionCount = computed(() => Object.keys(props.findingsByRegion || {}).length)

// Friendly region names
const REGION_SHORT: Record<string, string> = {
  'us-east-1': 'N. Virginia',
  'us-east-2': 'Ohio',
  'us-west-1': 'N. California',
  'us-west-2': 'Oregon',
  'us-gov-west-1': 'GovCloud West',
  'us-gov-east-1': 'GovCloud East',
  'eu-west-1': 'Ireland',
  'eu-central-1': 'Frankfurt',
  'ap-southeast-1': 'Singapore',
  'ap-northeast-1': 'Tokyo',
}

const chartOptions = computed(() => {
  const sorted = Object.entries(props.findingsByRegion || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)

  const categories = sorted.map(([r]) => REGION_SHORT[r] || r)
  const values = sorted.map(([, c]) => c)

  // Color gradient from high to low
  const maxVal = Math.max(...values, 1)
  const colors = values.map(v => {
    const ratio = v / maxVal
    if (ratio > 0.7) return '#EF4444'
    if (ratio > 0.4) return '#F97316'
    if (ratio > 0.15) return '#EAB308'
    return '#22C55E'
  })

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const item = params[0]
        const regionCode = sorted[item.dataIndex]?.[0] || ''
        return `<strong>${regionCode}</strong><br/>${item.value.toLocaleString()} findings`
      },
    },
    grid: { left: '2%', right: '6%', top: '4%', bottom: '4%', containLabel: true },
    xAxis: {
      type: 'category',
      data: categories,
      axisLabel: { color: axisLabelColor.value, fontSize: 10, rotate: 35 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor.value } },
    },
    series: [{
      type: 'bar',
      data: values.map((v, i) => ({ value: v, itemStyle: { color: colors[i], borderRadius: [4, 4, 0, 0] } })),
    }],
  }
})
</script>
