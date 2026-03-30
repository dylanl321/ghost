<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="text-base font-semibold text-gray-900 dark:text-white">Findings Trend (Last 90 Days)</div>
        <div class="flex gap-2">
          <UButton
            v-for="mode in displayModes" :key="mode.value"
            :color="activeMode === mode.value ? 'primary' : 'gray'"
            :variant="activeMode === mode.value ? 'soft' : 'ghost'"
            size="xs"
            @click="activeMode = mode.value"
          >
            {{ mode.label }}
          </UButton>
        </div>
      </div>
    </template>
    <div v-if="!trend || trend.length === 0" class="flex items-center justify-center h-64 text-gray-400 dark:text-gray-500">
      No trend data available
    </div>
    <VChart v-else :option="chartOptions" class="h-72" autoresize />
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { FindingsTrendPoint } from '#shared/types/security-dashboard'

echarts.use([LineChart, BarChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#EF4444',
  high: '#F97316',
  medium: '#EAB308',
  low: '#22C55E',
  informational: '#3B82F6',
}

const displayModes = [
  { value: 'stacked', label: 'Stacked' },
  { value: 'line', label: 'Lines' },
  { value: 'total', label: 'Total' },
] as const

type DisplayMode = typeof displayModes[number]['value']

const props = defineProps<{
  trend: FindingsTrendPoint[]
}>()

const activeMode = ref<DisplayMode>('stacked')
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const splitLineColor = computed(() => isDark.value ? '#374151' : '#e5e7eb')

const chartOptions = computed(() => {
  const data = props.trend || []
  const weeks = data.map(d => {
    const date = new Date(d.week)
    return `${date.getMonth() + 1}/${date.getDate()}`
  })

  const severities = ['critical', 'high', 'medium', 'low', 'informational'] as const

  if (activeMode.value === 'total') {
    return {
      tooltip: { trigger: 'axis' },
      legend: { show: false },
      grid: { left: '2%', right: '4%', top: '8%', bottom: '4%', containLabel: true },
      xAxis: { type: 'category', data: weeks, axisLabel: { color: axisLabelColor.value, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: axisLabelColor.value }, splitLine: { lineStyle: { color: splitLineColor.value } } },
      series: [{
        type: 'line',
        data: data.map(d => d.total),
        smooth: true,
        areaStyle: { opacity: 0.15 },
        lineStyle: { width: 2.5 },
        itemStyle: { color: '#6366F1' },
      }],
    }
  }

  const series = severities.map(sev => ({
    name: sev.charAt(0).toUpperCase() + sev.slice(1),
    type: activeMode.value === 'stacked' ? 'bar' as const : 'line' as const,
    stack: activeMode.value === 'stacked' ? 'severity' : undefined,
    data: data.map(d => d[sev]),
    itemStyle: { color: SEVERITY_COLORS[sev] },
    ...(activeMode.value === 'line' ? { smooth: true, lineStyle: { width: 2 }, symbol: 'circle', symbolSize: 4 } : {}),
    ...(activeMode.value === 'stacked' ? { barMaxWidth: 24 } : {}),
  }))

  return {
    tooltip: { trigger: 'axis' },
    legend: {
      bottom: 0,
      textStyle: { color: axisLabelColor.value, fontSize: 11 },
    },
    grid: { left: '2%', right: '4%', top: '8%', bottom: '14%', containLabel: true },
    xAxis: { type: 'category', data: weeks, axisLabel: { color: axisLabelColor.value, fontSize: 11 } },
    yAxis: { type: 'value', axisLabel: { color: axisLabelColor.value }, splitLine: { lineStyle: { color: splitLineColor.value } } },
    series,
  }
})
</script>
