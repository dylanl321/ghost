<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold">Organization Pipeline Trends</div>
        <UBadge color="gray" variant="soft" size="sm">
          {{ dateRangeLabel }}
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!dailyMetrics || dailyMetrics.length === 0" class="text-center py-8 text-gray-400">
      No pipeline data available for the selected time period
    </div>
    <div v-else class="min-h-80">
      <VChart v-if="dailyMetrics.length > 0" :option="chartOptions" class="h-80" autoresize />

      <!-- Summary metrics -->
      <div class="border-t border-gray-700 mt-4 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <div class="text-gray-400 text-sm">Total Runs</div>
          <div class="text-white text-lg font-semibold">{{ totalRuns }}</div>
        </div>
        <div>
          <div class="text-gray-400 text-sm">Success Rate</div>
          <div class="text-green-400 text-lg font-semibold">
            {{ successRate }}%
          </div>
        </div>
        <div>
          <div class="text-gray-400 text-sm">Failure Rate</div>
          <div class="text-red-400 text-lg font-semibold">
            {{ failureRate }}%
          </div>
        </div>
        <div>
          <div class="text-gray-400 text-sm">Avg Daily Runs</div>
          <div class="text-blue-400 text-lg font-semibold">{{ avgDailyRuns }}</div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components'

// Register required ECharts modules
echarts.use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
])

interface DailyMetric {
  date: string
  total: number
  successful: number
  failed: number
}

const props = defineProps<{
  dailyMetrics: DailyMetric[]
  loading: boolean
}>()

const dateRangeLabel = computed(() => {
  if (!props.dailyMetrics?.length) return 'No data'
  const sortedMetrics = [...props.dailyMetrics].sort((a, b) => a.date.localeCompare(b.date))
  const start = new Date(sortedMetrics[0].date)
  const end = new Date(sortedMetrics[sortedMetrics.length - 1].date)
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(start)} - ${fmt(end)}`
})

// Summary metrics
const totalRuns = computed(() =>
  props.dailyMetrics.reduce((sum, m) => sum + (m.total || 0), 0)
)

const successfulRuns = computed(() =>
  props.dailyMetrics.reduce((sum, m) => sum + (m.successful || 0), 0)
)

const failedRuns = computed(() =>
  props.dailyMetrics.reduce((sum, m) => sum + (m.failed || 0), 0)
)

const successRate = computed(() => {
  if (totalRuns.value === 0) return 0
  return Math.round((successfulRuns.value / totalRuns.value) * 100)
})

const failureRate = computed(() => {
  if (totalRuns.value === 0) return 0
  return Math.round((failedRuns.value / totalRuns.value) * 100)
})

const avgDailyRuns = computed(() => {
  if (!props.dailyMetrics.length) return 0
  return Math.round(totalRuns.value / props.dailyMetrics.length)
})

const chartOptions = computed(() => {
  // Sort by date ascending
  const sortedMetrics = [...props.dailyMetrics].sort((a, b) => a.date.localeCompare(b.date))
  const dates = sortedMetrics.map(m => m.date)
  const totalData = sortedMetrics.map(m => m.total || 0)
  const successData = sortedMetrics.map(m => m.successful || 0)
  const failedData = sortedMetrics.map(m => m.failed || 0)

  // Calculate success rate for each day
  const successRateData = sortedMetrics.map(m => {
    if (m.total === 0) return 0
    return Math.round((m.successful / m.total) * 100)
  })

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const date = new Date(params[0].axisValue)
        const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

        let result = `<strong>${dateLabel}</strong><br/>`
        params.forEach((p: any) => {
          const value = p.seriesName.includes('Rate') ? `${p.data}%` : p.data
          result += `${p.marker} ${p.seriesName}: ${value}<br/>`
        })

        return result
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9ca3af' }
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        formatter: (value: string) => {
          const d = new Date(value)
          return `${d.getMonth() + 1}/${d.getDate()}`
        },
        color: '#9ca3af'
      }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Run Count',
        nameTextStyle: { color: '#9ca3af' },
        axisLabel: {
          formatter: (val: number) => val.toString(),
          color: '#9ca3af'
        },
        splitLine: { lineStyle: { color: '#374151' } }
      },
      {
        type: 'value',
        name: 'Success Rate (%)',
        nameTextStyle: { color: '#9ca3af' },
        min: 0,
        max: 100,
        axisLabel: {
          formatter: (val: number) => `${val}%`,
          color: '#9ca3af'
        },
        splitLine: { show: false }
      }
    ],
    grid: { left: '8%', right: '8%', bottom: '20%', top: '5%' },
    series: [
      {
        name: 'Total Runs',
        type: 'line',
        data: totalData,
        lineStyle: { color: '#3b82f6', width: 2 },
        itemStyle: { color: '#3b82f6' },
        smooth: true,
        yAxisIndex: 0
      },
      {
        name: 'Successful',
        type: 'line',
        data: successData,
        lineStyle: { color: '#10b981', width: 2 },
        itemStyle: { color: '#10b981' },
        smooth: true,
        yAxisIndex: 0
      },
      {
        name: 'Failed',
        type: 'line',
        data: failedData,
        lineStyle: { color: '#ef4444', width: 2 },
        itemStyle: { color: '#ef4444' },
        smooth: true,
        yAxisIndex: 0
      },
      {
        name: 'Success Rate',
        type: 'line',
        data: successRateData,
        lineStyle: { color: '#f59e0b', width: 3, type: 'dashed' },
        itemStyle: { color: '#f59e0b' },
        smooth: true,
        yAxisIndex: 1
      }
    ]
  }
})
</script>
