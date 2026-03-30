<template>
  <div class="w-full">
    <VChart :option="chartOptions" class="h-48" autoresize />
    <!-- Legend with counts -->
    <div class="flex flex-wrap justify-center gap-3 mt-2">
      <div v-for="item in legendItems" :key="item.name" class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: item.color }" />
        <span class="text-xs text-gray-600 dark:text-gray-400">{{ item.name }}</span>
        <span class="text-xs font-semibold text-gray-900 dark:text-white">{{ item.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  severityBreakdown: Record<string, number>
}>()

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#ef4444',
  HIGH: '#f97316',
  MEDIUM: '#eab308',
  LOW: '#22c55e',
  INFORMATIONAL: '#3b82f6'
}

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFORMATIONAL']

const legendItems = computed(() =>
  SEVERITY_ORDER.map(name => ({
    name,
    value: props.severityBreakdown[name] ?? 0,
    color: SEVERITY_COLORS[name]!
  }))
)

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const chartOptions = computed(() => {
  const data = SEVERITY_ORDER
    .map(name => ({ name, value: props.severityBreakdown[name] ?? 0 }))
    .filter(d => d.value > 0)

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['45%', '70%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: { label: { show: false } },
        data: data.map(d => ({
          ...d,
          itemStyle: { color: SEVERITY_COLORS[d.name] }
        }))
      }
    ],
    backgroundColor: 'transparent'
  }
})
</script>
