<template>
  <UCard>
    <template #header>
      <div class="flex justify-between">
      <div class="text-lg font-semibold">Organization Cost Trends</div>
      <UBadge color="gray" variant="soft" size="sm">
        {{ dateRangeLabel }}
      </UBadge>
      </div>
    </template>

    <VChart :option="chartOptions" class="h-80" autoresize />

    <!-- Summary metrics -->
    <div class="border-t border-gray-700 mt-4 pt-4 flex">
      <div class="w-1/3 text-left">
        <div class="text-gray-400 text-sm">Total Cost</div>
        <div class="text-white text-lg font-semibold">
          ${{ totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
        </div>
      </div>
      <div class="w-1/3 text-left">
        <div class="text-gray-400 text-sm">Average Daily</div>
        <div class="text-white text-lg font-semibold">
          ${{ avgCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
        </div>
      </div>
      <div class="w-1/3 text-left">
        <div class="text-gray-400 text-sm">Peak Cost</div>
        <div class="text-white text-lg font-semibold">
          ${{ peakCost.toLocaleString(undefined, { maximumFractionDigits: 2 }) }}
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
  MarkAreaComponent
} from 'echarts/components'

// Register required ECharts modules
echarts.use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  MarkAreaComponent,
])

interface TimePoint {
  date: string
  cost: number
}

const props = defineProps<{
  timeSeries: TimePoint[]
}>()

const dateRangeLabel = computed(() => {
  if (!props.timeSeries?.length) return 'NA'
  const start = new Date(props.timeSeries[0]!.date)
  const end = new Date(props.timeSeries[props.timeSeries.length - 1]!.date)
  const fmt = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(start)} - ${fmt(end)}`
})

const costs = computed(() => props.timeSeries.map(d => d.cost))

// Summary metrics
const totalCost = computed(() => costs.value.reduce((sum, c) => sum + c, 0))
const avgCost = computed(() => costs.value.length ? totalCost.value / costs.value.length : 0)
const peakCost = computed(() => Math.max(...costs.value, 0))

// Create weekend mark areas
function getWeekendMarkAreas(data: TimePoint[]) {
  const weekendAreas: { xAxis: string, name?: string }[][] = []

  for (let i = 0; i < data.length; i++) {
    const dateString = data[i]?.date || '1970-01-01'
    const currentDate = new Date(dateString)

    // Check if this day is Saturday
    if (currentDate.getDay() === 6) {
      const sunday = data[i + 1]

      if (sunday) {
        weekendAreas.push([
          { xAxis: dateString, name: "Sat - Sun" },
          { xAxis: sunday.date }
        ])
      }
    }
  }

  return weekendAreas
}

const chartOptions = computed(() => {
  const dates = props.timeSeries.map(d => d.date)
  const costs = props.timeSeries.map(d => d.cost)

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        const date = new Date(p.axisValue)
        const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: '2-digit' })
        return `${dateStr}<br/>Cost: $${p.data.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        formatter: (value: string) => {
          const d = new Date(value)
          const month = d.getMonth() + 1
          const day = d.getDate()
          const weekday = d.toLocaleDateString('en-US', { weekday: 'short' }) // Mon, Tue, ...
          return `${month}-${day}\n${weekday}`
        }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => `$${val.toLocaleString()}`
      },
      splitLine: { lineStyle: { color: '#4b5563' } }
    },
    grid: { left: '2%', right: '2%', bottom: '10%', top: '5%' },
    series: [
      {
        name: 'Cost',
        type: 'line',
        smooth: true,
        data: costs,
        lineStyle: { color: '#3b82f6' },
        itemStyle: { color: '#3b82f6' },
        areaStyle: { color: 'rgba(59, 130, 246, 0.1)' },
        markArea: {
          itemStyle: { color: 'rgba(156, 163, 175, 0.15)' },
          label: {
            show: true,
            color: '#4b5563',
            fontSize: 10,
            backgroundColor: 'transparent',
            borderColor: 'transparent'
          },
          data: getWeekendMarkAreas(props.timeSeries)
        }
      }
    ]
  }
})
</script>
