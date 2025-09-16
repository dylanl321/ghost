<template>
  <UCard>
    <template #header>
      <div class="text-lg font-semibold">Organization Cost Trends (30 days)</div>
    </template>
    <VChart :option="chartOptions" class="h-80" autoresize />
  </UCard>
</template>

<script setup lang="ts">
// import VChart from 'vue-echarts'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  MarkAreaComponent
} from 'echarts/components'
// import { CanvasRenderer } from 'echarts/renderers'

// Register required ECharts modules
echarts.use([
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  MarkAreaComponent,
  // CanvasRenderer
])

// Example data
const timeSeries = [
  { date: '2025-08-16', cost: 28214.42937753931 },
  { date: '2025-08-17', cost: 23457.017041753807 },
  { date: '2025-08-18', cost: 22480.050677311894 },
  // ... up to 30 days
]

// Build arrays
const dates = timeSeries.map(d => d.date)
const costs = timeSeries.map(d => d.cost)

// Create weekend mark areas
function getWeekendMarkAreas(data: { date: string }[]) {
  const areas: any[] = []
  for (let i = 0; i < data.length; i++) {
    const dt = new Date(data[i].date)
    if (dt.getDay() === 6) {
      const next = data[i + 1]
      if (next) {
        areas.push([
          { xAxis: data[i].date },
          { xAxis: next.date }
        ])
      }
    }
  }
  return areas
}

const weekendAreas = getWeekendMarkAreas(timeSeries)

const chartOptions = {
  tooltip: {
    trigger: 'axis',
    formatter: (params: any) => {
      const p = params[0]
      const date = new Date(p.axisValue)
      const dateStr = date.toLocaleDateString('en-US', {
        month: 'short',
        day: '2-digit'
      })
      return `${dateStr}<br/>Cost: $${p.data.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    }
  },
  xAxis: {
    type: 'category',
    data: dates,
    axisLabel: {
      formatter: (value: string) => {
        const d = new Date(value)
        return d.toLocaleDateString('en-US', {
          month: 'short',
          day: '2-digit'
        })
      }
    }
  },
  yAxis: {
    type: 'value',
    axisLabel: {
      formatter: (val: number) => `$${val.toLocaleString()}`
    }
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
        data: weekendAreas
      }
    }
  ]
}
</script>
