<template>
  <UCard>
    <template #header>
      <div class="flex justify-between">
        <div class="text-lg font-semibold">{{ title }}</div>
        <UBadge color="gray" variant="soft" size="sm">
          {{ dateRangeLabel }}
        </UBadge>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="props.loading" />
    <div v-else>
      <VChart :option="chartOptions" class="h-80" autoresize />

      <!-- Summary metrics -->
      <div class="border-t border-gray-700 mt-4 pt-4 flex">
        <div class="w-1/3 text-left">
          <div class="text-gray-400 text-sm">Total Cost (Last 14 Days)</div>
          <div :class="`${totalCostProforma ? 'text-blue-400/80' : 'text-white'} text-lg font-semibold`">
            {{ formatCurrency(totalCostBillable, 0) }}
          </div>
          <div v-if="totalCostProforma" class="text-green-400/80 text-lg font-semibold">
            {{ formatCurrency(totalCostProforma, 0) }}
          </div>
        </div>
        <div class="w-1/3 text-left">
          <div class="text-gray-400 text-sm">Average Daily</div>
          <div :class="`${totalCostProforma ? 'text-blue-400/80' : 'text-white'} text-lg font-semibold`">
            {{ formatCurrency(avgCostBillable, 0) }}
          </div>
          <div v-if="avgCostProforma" class="text-green-400/80 text-lg font-semibold">
            {{ formatCurrency(avgCostProforma, 0) }}
          </div>
        </div>
        <div class="w-1/3 text-left">
          <div class="text-gray-400 text-sm">Peak Cost</div>
          <div :class="`${totalCostProforma ? 'text-blue-400/80' : 'text-white'} text-lg font-semibold`">
            {{ formatCurrency(peakCostBillable, 0) }}
          </div>
          <div v-if="peakCostProforma" class="text-green-400/80 text-lg font-semibold">
            {{ formatCurrency(peakCostProforma, 0) }}</div>
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

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

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
  title: string
  loading: boolean
  timeSeriesBillable: TimePoint[] // Billable
  timeSeriesProforma?: TimePoint[] // Pro Forma
}>()

const dateRangeLabel = computed(() => {
  if (!props.timeSeriesBillable?.length) return 'NA'
  const start = new Date(props.timeSeriesBillable[0]!.date)
  const end = new Date(props.timeSeriesBillable[props.timeSeriesBillable.length - 1]!.date)
  const fmt = (d: Date) =>
    `${d.getUTCMonth() + 1}/${d.getUTCDate()}`
  return `${fmt(start)} - ${fmt(end)}`
})

const costsBillable = computed(() => props.timeSeriesBillable.map(d => d.cost))
const costsProforma = computed(() => props.timeSeriesProforma?.map(d => d.cost) || [])

// Summary metrics
const totalCostBillable = computed(() => costsBillable.value.reduce((sum, c) => sum + c, 0))
const avgCostBillable = computed(() => costsBillable.value.length ? totalCostBillable.value / costsBillable.value.length : 0)
const peakCostBillable = computed(() => Math.max(...costsBillable.value, 0))

const totalCostProforma = computed(() => costsProforma.value.reduce((sum, c) => sum + c, 0))
const avgCostProforma = computed(() => costsProforma.value.length ? totalCostProforma.value / costsProforma.value.length : 0)
const peakCostProforma = computed(() => Math.max(...costsProforma.value, 0))

// Create weekend mark areas
function getWeekendMarkAreas(data: TimePoint[]) {
  const weekendAreas: { xAxis: string, name?: string }[][] = []

  for (let i = 0; i < data.length; i++) {
    const dateString = data[i]?.date || '1970-01-01'
    const currentDate = new Date(dateString)

    // Check if this day is Saturday
    if (currentDate.getUTCDay() === 6) {
      const sunday = data[i + 1]

      if (sunday) {
        weekendAreas.push([
          { xAxis: dateString, name: 'Sat - Sun' },
          { xAxis: sunday.date }
        ])
      }
    }
  }

  return weekendAreas
}

const chartOptions = computed(() => {
  const dates = props.timeSeriesBillable.map(d => d.date)

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const date = new Date(params[0].axisValue)
        const dateLabel = `${months[date.getUTCMonth()]} ${date.getUTCDate()}`

        const billable = params.find((p: any) => p.seriesName === "Billable Cost")
        const proforma = params.find((p: any) => p.seriesName === "Proforma Cost")

        let result = `${dateLabel}<br/>`
        if (billable) {
          result += `Billable: ${formatCurrency(billable.data, 2)}<br/>`
        }
        if (proforma) {
          result += `Pro Forma: ${formatCurrency(proforma.data, 2)}<br/>`
        }
        if (proforma && billable) {
          result += `Δ: ${formatCurrency(proforma.data - billable.data, 2)}`
        }

        return result.trim()
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#707c8f' }, // gray-300 text
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLabel: {
        formatter: (value: string) => {
          const d = new Date(value)
          const month = d.getUTCMonth() + 1
          const day = d.getUTCDate()
          const weekday = weekdays[d.getUTCDay()] // Mon, Tue, ...
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
    grid: { left: '2%', right: '2%', bottom: '25%', top: '5%' },
    series: [
      {
        name: 'Billable Cost',
        type: 'line',
        smooth: true,
        data: costsBillable.value,
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
          data: getWeekendMarkAreas(props.timeSeriesBillable)
        }
      },
      // Make sure the Pro Forma sum is greater than 0 before displaying a line for it (this is specifically for the master account which does not have Pro Forma data)
      (props.timeSeriesProforma && costsProforma.value.length > 0 && costsProforma.value.reduce((sum, val) => sum + val, 0) > 0) && {
        name: 'Proforma Cost',
        type: 'line',
        smooth: true,
        data: costsProforma.value,
        lineStyle: { color: '#10b981' },
        itemStyle: { color: '#10b981' },
        areaStyle: { color: 'rgba(16, 185, 129, 0.1)' }
      }
    ]
  }
})
</script>
