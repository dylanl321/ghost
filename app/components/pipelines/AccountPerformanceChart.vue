<template>
  <UCard>
    <template #header>
      <div class="flex justify-between items-center">
        <h3 class="font-semibold">Account Performance</h3>
        <div class="flex items-center gap-2">
          <UButton
            size="xs"
            :color="viewMode === 'table' ? 'primary' : 'gray'"
            variant="ghost"
            icon="i-heroicons-table-cells"
            @click="viewMode = viewMode === 'table' ? 'chart' : 'table'"
          >
            {{ viewMode === 'table' ? 'Chart View' : 'Table View' }}
          </UButton>
          <USelectMenu
            v-model="sortBy"
            :options="sortOptions"
            value-attribute="value"
            option-attribute="label"
            class="w-40"
          />
        </div>
      </div>
    </template>

    <CenteredLoadingSpinner v-if="loading" />
    <div v-else-if="!accountBreakdown || accountBreakdown.length === 0" class="text-center py-8 text-gray-400">
      No account data available
    </div>
    <div v-else class="min-h-96">
      <!-- Chart view (top 10) -->
      <div v-if="viewMode === 'chart'">
        <VChart v-if="chartAccounts.length > 0" :option="chartOptions" class="h-96" autoresize />
      </div>

      <!-- Table view (all, paginated) -->
      <div v-else>
        <UTable
          :rows="paginatedAccounts"
          :columns="accountTableColumns"
        >
          <template #success_rate-data="{ row }">
            <div class="flex items-center gap-2">
              <div class="w-16 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-green-500 rounded-full" :style="{ width: `${row.success_rate || 0}%` }" />
              </div>
              <span class="text-sm">{{ Math.round(row.success_rate || 0) }}%</span>
            </div>
          </template>
        </UTable>
        <div v-if="allSortedAccounts.length > accountPageSize" class="flex justify-between items-center mt-3">
          <div class="text-sm text-gray-400">
            Showing {{ accountTableStart }}-{{ accountTableEnd }} of {{ allSortedAccounts.length }} accounts
          </div>
          <UPagination
            v-model="accountPage"
            :page-count="accountPageSize"
            :total="allSortedAccounts.length"
          />
        </div>
      </div>

      <!-- Account summary -->
      <div class="border-t border-gray-700 mt-4 pt-4">
        <div class="text-sm text-gray-400 mb-2">
          {{ viewMode === 'chart' ? `Showing top ${chartAccounts.length} accounts` : `${allSortedAccounts.length} accounts total` }}
        </div>
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
const viewMode = ref<'chart' | 'table'>('chart')
const accountPage = ref(1)
const accountPageSize = 20

const sortOptions = [
  { label: 'Total Runs', value: 'total_runs' },
  { label: 'Success Rate', value: 'success_rate' }
]

const accountTableColumns = [
  { key: 'account_name', label: 'Account' },
  { key: 'account_id', label: 'Account ID' },
  { key: 'total_runs', label: 'Total Runs', sortable: true },
  { key: 'successful_runs', label: 'Successful', sortable: true },
  { key: 'success_rate', label: 'Success Rate', sortable: true }
]

// All accounts sorted (no limit)
const allSortedAccounts = computed(() => {
  if (!props.accountBreakdown?.length) return []

  return [...props.accountBreakdown].sort((a, b) => {
    if (sortBy.value === 'success_rate') {
      return b.success_rate - a.success_rate
    }
    return b.total_runs - a.total_runs
  })
})

// Chart uses top 10
const chartAccounts = computed(() => allSortedAccounts.value.slice(0, 10))

// Paginated for table view
const paginatedAccounts = computed(() => {
  const start = (accountPage.value - 1) * accountPageSize
  return allSortedAccounts.value.slice(start, start + accountPageSize)
})

const accountTableStart = computed(() => allSortedAccounts.value.length === 0 ? 0 : (accountPage.value - 1) * accountPageSize + 1)
const accountTableEnd = computed(() => Math.min(accountPage.value * accountPageSize, allSortedAccounts.value.length))

// Calculate averages (from all accounts, not just displayed)
const avgSuccessRate = computed(() => {
  if (!allSortedAccounts.value.length) return 0
  const sum = allSortedAccounts.value.reduce((acc, a) => acc + (a.success_rate || 0), 0)
  return Math.round(sum / allSortedAccounts.value.length)
})

const totalRuns = computed(() => {
  if (!allSortedAccounts.value.length) return 0
  return allSortedAccounts.value.reduce((acc, a) => acc + (a.total_runs || 0), 0)
})

const chartOptions = computed(() => {
  const accounts = chartAccounts.value
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
