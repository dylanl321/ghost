<template>
  <div class="space-y-4">
    <!-- Stacked bar chart -->
    <ClientOnly>
      <VChart v-if="topGroups.length > 0" :option="chartOptions" :style="{ height: chartHeight }" autoresize />
      <template #fallback>
        <div class="h-48 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
      </template>
    </ClientOnly>

    <!-- Table -->
    <UTable :rows="groups" :columns="columns" :ui="{ td: { base: 'text-xs' }, th: { base: 'text-xs' } }">
      <template #resource_id-data="{ row }">
        <UTooltip :text="row.resourceId">
          <span class="font-mono text-xs truncate max-w-[200px] block">
            {{ truncateResourceId(row.resourceId) }}
          </span>
        </UTooltip>
      </template>
      <template #critical-data="{ row }">
        <UBadge v-if="row.critical > 0" color="red" variant="soft" size="xs">{{ row.critical }}</UBadge>
        <span v-else class="text-gray-400">0</span>
      </template>
      <template #high-data="{ row }">
        <UBadge v-if="row.high > 0" color="orange" variant="soft" size="xs">{{ row.high }}</UBadge>
        <span v-else class="text-gray-400">0</span>
      </template>
      <template #medium-data="{ row }">
        <UBadge v-if="row.medium > 0" color="yellow" variant="soft" size="xs">{{ row.medium }}</UBadge>
        <span v-else class="text-gray-400">0</span>
      </template>
      <template #low-data="{ row }">
        <span class="text-gray-500">{{ row.low }}</span>
      </template>
    </UTable>

    <div v-if="groups.length === 0" class="flex flex-col items-center justify-center py-10 gap-2">
      <UIcon name="i-heroicons-server-stack" class="w-10 h-10 text-gray-300" />
      <p class="text-sm text-gray-500">No resource-level findings data available</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { TooltipComponent, GridComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { ResourceFindingGroup } from '../../../../shared/types/security-dashboard'

echarts.use([BarChart, TooltipComponent, GridComponent, LegendComponent, CanvasRenderer])

const props = defineProps<{
  groups: ResourceFindingGroup[]
}>()

const topGroups = computed(() => props.groups.slice(0, 15))

const chartHeight = computed(() => {
  const items = Math.max(3, topGroups.value.length)
  return `${items * 32 + 60}px`
})

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const splitLineColor = computed(() => isDark.value ? '#374151' : '#e5e7eb')

const chartOptions = computed(() => {
  const resources = topGroups.value.map(g => truncateResourceId(g.resourceId))

  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: {
      data: ['Critical', 'High', 'Medium', 'Low'],
      textStyle: { color: axisLabelColor.value, fontSize: 11 },
      bottom: 0,
    },
    grid: { left: '2%', right: '4%', top: '3%', bottom: '14%', containLabel: true },
    xAxis: {
      type: 'value',
      axisLabel: { color: axisLabelColor.value, fontSize: 11 },
      splitLine: { lineStyle: { color: splitLineColor.value } },
    },
    yAxis: {
      type: 'category',
      data: resources,
      inverse: true,
      axisLabel: { color: axisLabelColor.value, fontSize: 10, width: 160, overflow: 'truncate' },
    },
    series: [
      { name: 'Critical', type: 'bar', stack: 'total', data: topGroups.value.map(g => g.critical), itemStyle: { color: '#ef4444' }, barMaxWidth: 24 },
      { name: 'High', type: 'bar', stack: 'total', data: topGroups.value.map(g => g.high), itemStyle: { color: '#f97316' }, barMaxWidth: 24 },
      { name: 'Medium', type: 'bar', stack: 'total', data: topGroups.value.map(g => g.medium), itemStyle: { color: '#eab308' }, barMaxWidth: 24 },
      { name: 'Low', type: 'bar', stack: 'total', data: topGroups.value.map(g => g.low), itemStyle: { color: '#6b7280' }, barMaxWidth: 24 },
    ],
    backgroundColor: 'transparent',
  }
})

const columns = [
  { key: 'resource_id', label: 'Resource ID' },
  { key: 'totalFindings', label: 'Total', sortable: true },
  { key: 'critical', label: 'Critical', sortable: true },
  { key: 'high', label: 'High', sortable: true },
  { key: 'medium', label: 'Medium', sortable: true },
  { key: 'low', label: 'Low', sortable: true },
]

function truncateResourceId(id: string): string {
  if (id.length <= 40) return id
  // For ARNs, show the last meaningful segment
  const parts = id.split('/')
  if (parts.length > 1) return '.../' + parts.slice(-1)[0]
  const colonParts = id.split(':')
  if (colonParts.length > 1) return '...:' + colonParts.slice(-1)[0]
  return id.slice(0, 18) + '...' + id.slice(-18)
}
</script>
