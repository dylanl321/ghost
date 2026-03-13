<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <div class="text-lg font-semibold text-gray-900 dark:text-white">{{ title }}</div>
        <div class="flex items-center gap-2">
          <!-- Scope selector -->
          <div v-if="scopeOptions.length > 1" class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              v-for="option in scopeOptions"
              :key="option.value"
              @click="$emit('update:scope', option.value)"
              class="px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150"
              :class="scope === option.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              {{ option.label }}
            </button>
          </div>
          <!-- Date range selector -->
          <div v-if="dateRangeOptions && dateRangeOptions.length > 1" class="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            <button
              v-for="option in dateRangeOptions"
              :key="option.value"
              @click="$emit('update:dateRange', option.value)"
              class="px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-150"
              :class="dateRange === option.value
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
            >
              {{ option.label }}
            </button>
          </div>
          <UBadge color="gray" variant="soft" size="sm">
            {{ dateRangeLabel }}
          </UBadge>
        </div>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="props.loading" />
    <div v-else>
      <VChart :option="chartOptions" class="h-80" autoresize />

      <!-- Summary metrics -->
      <div class="border-t border-gray-200 dark:border-gray-700 mt-4 pt-4 flex">
        <div class="w-1/3 text-left">
          <div class="text-gray-600 dark:text-gray-400 text-sm">Total Cost (Last {{ props.dateRange }} Days)</div>
          <div :class="`${totalCostProforma ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-gray-900 dark:text-white'} text-lg font-semibold`">
            {{ formatCurrency(totalCostBillable, 0) }}
          </div>
          <div v-if="totalCostProforma" class="text-green-400/80 text-lg font-semibold">
            {{ formatCurrency(totalCostProforma, 0) }}
          </div>
        </div>
        <div class="w-1/3 text-left">
          <div class="text-gray-600 dark:text-gray-400 text-sm">Average Daily</div>
          <div :class="`${totalCostProforma ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-gray-900 dark:text-white'} text-lg font-semibold`">
            {{ formatCurrency(avgCostBillable, 0) }}
          </div>
          <div v-if="avgCostProforma" class="text-green-400/80 text-lg font-semibold">
            {{ formatCurrency(avgCostProforma, 0) }}
          </div>
        </div>
        <div class="w-1/3 text-left">
          <div class="text-gray-600 dark:text-gray-400 text-sm">Peak Cost</div>
          <div :class="`${totalCostProforma ? 'text-blue-600/80 dark:text-blue-400/80' : 'text-gray-900 dark:text-white'} text-lg font-semibold`">
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

interface ScopeOption {
  label: string
  value: string
}

interface DateRangeOption {
  label: string
  value: number
}

const props = withDefaults(defineProps<{
  title: string
  loading: boolean
  timeSeriesBillable: TimePoint[] // Billable
  timeSeriesProforma?: TimePoint[] // Pro Forma
  scope?: string
  scopeOptions?: ScopeOption[]
  dateRange?: number
  dateRangeOptions?: DateRangeOption[]
}>(), {
  scope: 'org',
  scopeOptions: () => [],
  dateRange: 14,
  dateRangeOptions: () => []
})

defineEmits<{
  'update:scope': [value: string]
  'update:dateRange': [value: number]
}>()

// Theme-aware chart colors
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')
const splitLineColor = computed(() => isDark.value ? '#4b5563' : '#e5e7eb')
const axisLabelColor = computed(() => isDark.value ? '#9ca3af' : '#6b7280')
const weekendLabelColor = computed(() => isDark.value ? '#4b5563' : '#9ca3af')
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
          // For ranges > 30 days, skip weekday to reduce clutter
          if (props.dateRange > 30) {
            return `${month}/${day}`
          }
          const weekday = weekdays[d.getUTCDay()]
          return `${month}-${day}\n${weekday}`
        }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => `$${val.toLocaleString()}`,
        color: axisLabelColor.value
      },
      splitLine: { lineStyle: { color: splitLineColor.value } }
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
            color: weekendLabelColor.value,
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
