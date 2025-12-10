<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="font-semibold">Account Performance</h3>
        <USelectMenu
          v-model="sortBy"
          :options="sortOptions"
          value-attribute="value"
          option-attribute="label"
          class="w-40"
        />
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!accountBreakdown || accountBreakdown.length === 0" class="text-center py-8 text-gray-400">
      No account data available
    </div>
    <div v-else class="min-h-96">
      <VChart v-if="displayedAccounts.length > 0" :option="chartOptions" class="h-96" autoresize />

      <!-- Account summary -->
      <div class="border-t border-gray-700 mt-4 pt-4">
        <div class="text-sm text-gray-400 mb-2">Showing top {{ displayedAccounts.length }} accounts</div>
        <div class="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div class="text-gray-400">Avg Success Rate</div>
            <div class="text-white font-semibold">{{ avgSuccessRate }}%</div>
          </div>
          <div>
            <div class="text-gray-400">Total Activity</div>
            <div class="text-white font-semibold">{{ totalRuns }} runs</div>
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components'
import { getShortAccountName, parseAccountName } from '~/utils/account-name-parser'

// Register required ECharts modules
echarts.use([
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
])

interface AccountBreakdownItem {
  account_id: string
  account_name: string
  total_runs: number
  successful_runs: number
  success_rate: number
  last_run: string
}

const props = defineProps<{
  accountBreakdown: AccountBreakdownItem[]
  loading: boolean
}>()

const sortBy = ref('total_runs')
const sortOptions = [
  { label: 'Total Runs', value: 'total_runs' },
  { label: 'Success Rate', value: 'success_rate' }
]

// Sort and limit accounts
const displayedAccounts = computed(() => {
  if (!props.accountBreakdown?.length) return []

  const sorted = [...props.accountBreakdown].sort((a, b) => {
    if (sortBy.value === 'success_rate') {
      return b.success_rate - a.success_rate
    }
    return b.total_runs - a.total_runs
  })

  return sorted.slice(0, 10) // Top 10 accounts
})

// Calculate averages
const avgSuccessRate = computed(() => {
  if (!displayedAccounts.value.length) return 0
  const sum = displayedAccounts.value.reduce((acc, a) => acc + (a.success_rate || 0), 0)
  return Math.round(sum / displayedAccounts.value.length)
})

const totalRuns = computed(() => {
  if (!displayedAccounts.value.length) return 0
  return displayedAccounts.value.reduce((acc, a) => acc + (a.total_runs || 0), 0)
})

const chartOptions = computed(() => {
  const accounts = displayedAccounts.value
  // Parse and shorten account names for display
  const accountNames = accounts.map(a => getShortAccountName(a.account_name || a.account_id, 25))
  // Keep full names for tooltips
  const fullAccountNames = accounts.map(a => a.account_name || a.account_id)
  const totalRunsData = accounts.map(a => a.total_runs || 0)
  const successRateData = accounts.map(a => a.success_rate || 0)

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'shadow'
      },
      formatter: (params: any) => {
        // Get the index to find the full account name
        const index = params[0]?.dataIndex ?? 0
        const fullAccountName = fullAccountNames[index] || params[0].axisValue
        let result = `<strong>${fullAccountName}</strong><br/>`
        params.forEach((p: any) => {
          const value = p.seriesName === 'Success Rate' ? `${p.data}%` : p.data
          result += `${p.marker} ${p.seriesName}: ${value}<br/>`
        })
        return result
      }
    },
    legend: {
      bottom: 0,
      textStyle: { color: '#9ca3af' }
    },
    grid: {
      left: '15%',
      right: '10%',
      bottom: '15%',
      top: '5%',
      containLabel: false
    },
    xAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af'
      },
      splitLine: {
        lineStyle: { color: '#374151' }
      }
    },
    yAxis: {
      type: 'category',
      data: accountNames,
      axisLabel: {
        color: '#9ca3af'
      },
      inverse: true // Top to bottom
    },
    series: [
      {
        name: 'Total Runs',
        type: 'bar',
        data: totalRunsData,
        itemStyle: {
          color: '#3b82f6'
        },
        label: {
          show: true,
          position: 'right',
          color: '#9ca3af',
          formatter: (params: any) => params.data
        }
      }
    ]
  }
})
</script>
