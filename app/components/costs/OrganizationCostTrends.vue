<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Organization Cost Trends</div>
    </template>
    <VChart :option="chartOptions" class="h-80" autoresize />
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
    grid: { left: '8%', right: '8%', bottom: '10%', top: '5%' },
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
