<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">Error Distribution</div>
        <UBadge v-if="totalErrors > 0" color="red" variant="soft" size="sm">
          {{ totalErrors }} {{ totalErrors === 1 ? 'Error' : 'Errors' }}
        </UBadge>
        <UBadge v-else color="green" variant="soft" size="sm">
          No Errors
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!errorBreakdown || errorBreakdown.length === 0" class="text-center py-12">
      <UIcon name="i-heroicons-check-circle" class="w-16 h-16 text-green-500 mx-auto mb-3" />
      <div class="text-lg font-semibold text-green-400">No Errors</div>
      <div class="text-sm text-gray-400 mt-1">All pipelines completed successfully</div>
    </div>
    <div v-else>
      <VChart :option="chartOptions" class="h-80" autoresize />

      <!-- Error category list -->
      <div class="border-t border-gray-700 mt-4 pt-4">
        <div class="text-sm text-gray-400 mb-3">Error Categories</div>
        <div class="space-y-2">
          <div
            v-for="error in sortedErrors"
            :key="error.category"
            class="flex justify-between items-center py-2 px-3 bg-gray-800/50 rounded"
          >
            <div class="flex items-center gap-2">
              <div :style="{ backgroundColor: getCategoryColor(error.category) }" class="w-3 h-3 rounded-full" />
              <span class="text-sm text-white">{{ formatCategory(error.category) }}</span>
            </div>
            <span class="text-sm font-semibold text-gray-300">{{ error.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent
} from 'echarts/components'

// Register required ECharts modules
echarts.use([
  PieChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent
])

interface ErrorBreakdown {
  category: string
  count: number
}

const props = defineProps<{
  errorBreakdown: ErrorBreakdown[]
  loading: boolean
}>()

const totalErrors = computed(() =>
  props.errorBreakdown.reduce((sum, e) => sum + e.count, 0)
)

const sortedErrors = computed(() =>
  [...props.errorBreakdown].sort((a, b) => b.count - a.count)
)

// Color mapping for error categories
const categoryColors: Record<string, string> = {
  provider_error: '#ef4444', // red
  permission_denied: '#f59e0b', // amber
  timeout: '#8b5cf6', // purple
  state_lock: '#ec4899', // pink
  resource_error: '#f97316', // orange
  network_error: '#6366f1', // indigo
  validation_error: '#eab308', // yellow
  unknown: '#6b7280' // gray
}

function getCategoryColor(category: string): string {
  return categoryColors[category] || '#6b7280'
}

function formatCategory(category: string): string {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const chartOptions = computed(() => {
  const data = props.errorBreakdown.map(e => ({
    name: formatCategory(e.category),
    value: e.count,
    itemStyle: { color: getCategoryColor(e.category) }
  }))

  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} ({d}%)'
    },
    legend: {
      show: false // We'll show the list below instead
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 8,
          borderColor: '#1f2937',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{d}%',
          color: '#fff',
          fontSize: 12
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 14,
            fontWeight: 'bold'
          },
          itemStyle: {
            shadowBlur: 10,
            shadowOffsetX: 0,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
          }
        },
        data
      }
    ]
  }
})
</script>
