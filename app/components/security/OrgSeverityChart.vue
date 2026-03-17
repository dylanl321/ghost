<template>
  <UCard>
    <template #header>
      <div class="text-base font-semibold text-gray-900 dark:text-white">Findings by Severity</div>
    </template>
    <VChart :option="chartOptions" class="h-64" autoresize />
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: '#EF4444',
  HIGH: '#F97316',
  MEDIUM: '#EAB308',
  LOW: '#22C55E',
  INFORMATIONAL: '#3B82F6',
}

const props = defineProps<{
  severityBreakdown: Record<string, number>
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const legendColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')

const chartOptions = computed(() => {
  const data = Object.entries(props.severityBreakdown || {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      itemStyle: { color: SEVERITY_COLORS[name] || '#6B7280' },
    }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)',
    },
    legend: {
      orient: 'vertical',
      right: '5%',
      top: 'center',
      textStyle: { color: legendColor.value, fontSize: 12 },
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['35%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 13, fontWeight: 'bold' },
        },
        data,
      },
    ],
  }
})
</script>
