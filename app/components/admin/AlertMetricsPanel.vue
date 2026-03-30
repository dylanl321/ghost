<template>
  <div>
    <!-- Period Selector -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Alert Metrics</h2>
      <div class="flex gap-2">
        <UButton
          v-for="p in periods"
          :key="p.value"
          :color="period === p.value ? 'primary' : 'gray'"
          :variant="period === p.value ? 'solid' : 'soft'"
          size="sm"
          @click="period = p.value; loadData()"
        >
          {{ p.label }}
        </UButton>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-64">
      <UIcon name="i-heroicons-arrow-path" class="w-8 h-8 animate-spin text-primary-500" />
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex items-center justify-center h-64">
      <UCard>
        <div class="text-center p-6">
          <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Error Loading Metrics</h3>
          <p class="text-gray-600 dark:text-gray-400 mb-4">{{ error }}</p>
          <UButton color="primary" @click="loadData">
            <UIcon name="i-heroicons-arrow-path" class="mr-2" />
            Retry
          </UButton>
        </div>
      </UCard>
    </div>

    <!-- Metrics Content -->
    <div v-else>
      <!-- Summary Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <!-- Total Alerts -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Total Alerts</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ formatNumber(summaryStats.total) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ summaryStats.productionCount }} production
              </p>
            </div>
            <div class="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
              <UIcon name="i-heroicons-bell" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </UCard>

        <!-- Average Per Day -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Avg/Day</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ summaryStats.avgPerDay.toFixed(1) }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                over {{ periodDays }} days
              </p>
            </div>
            <div class="p-3 bg-green-100 dark:bg-green-900/30 rounded-full">
              <UIcon name="i-heroicons-calendar-days" class="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </UCard>

        <!-- Peak Day -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Peak Day</p>
              <p class="text-2xl font-bold text-gray-900 dark:text-white">
                {{ summaryStats.peakCount }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ summaryStats.peakDate || 'N/A' }}
              </p>
            </div>
            <div class="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full">
              <UIcon name="i-heroicons-arrow-trending-up" class="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
        </UCard>

        <!-- Most Common Level -->
        <UCard>
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-gray-600 dark:text-gray-400">Most Common Level</p>
              <p class="text-2xl font-bold" :class="getLevelTextColor(summaryStats.mostCommonLevel)">
                {{ summaryStats.mostCommonLevel || 'N/A' }}
              </p>
              <p class="text-xs text-gray-500 mt-1">
                {{ summaryStats.mostCommonLevelCount }} alerts
              </p>
            </div>
            <div class="p-3 rounded-full" :class="getLevelBgColor(summaryStats.mostCommonLevel)">
              <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6" :class="getLevelIconColor(summaryStats.mostCommonLevel)" />
            </div>
          </div>
        </UCard>
      </div>

      <!-- Volume Trends Chart -->
      <UCard class="mb-6">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Alert Volume Trends</h3>
            <UBadge color="gray" variant="soft" size="sm">
              {{ dateRangeLabel }}
            </UBadge>
          </div>
        </template>
        <div v-if="chartData.length === 0" class="flex items-center justify-center h-64 text-gray-500">
          No alert data available for this period
        </div>
        <VChart v-else :option="volumeChartOptions" class="h-80" autoresize />
      </UCard>

      <!-- Top Accounts Bar Chart -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Top Accounts by Alert Count</h3>
            <UBadge color="gray">{{ topAccounts.length }}</UBadge>
          </div>
        </template>
        <div v-if="topAccounts.length === 0" class="text-center py-8 text-gray-500 dark:text-gray-400">
          No account data available
        </div>
        <div v-else class="space-y-3">
          <div
            v-for="(account, idx) in topAccounts"
            :key="account.accountId"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div class="flex items-center gap-3 flex-1 min-w-0">
              <span class="text-sm font-semibold text-gray-500 w-6">{{ idx + 1 }}</span>
              <div class="min-w-0 flex-1">
                <NuxtLink
                  :to="`/account/${account.accountId}`"
                  class="text-sm font-medium text-blue-400 hover:text-blue-300 hover:underline truncate block"
                >
                  {{ account.accountName || account.accountId }}
                </NuxtLink>
                <p class="text-xs text-gray-500">
                  {{ account.alertCount }} alerts
                </p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  class="h-2 rounded-full"
                  :class="getLevelBarColor(account.predominantLevel)"
                  :style="{ width: `${(account.alertCount / (topAccounts[0]?.alertCount || 1)) * 100}%` }"
                ></div>
              </div>
              <UBadge :color="getLevelBadgeColor(account.predominantLevel)" variant="subtle" size="xs">
                {{ account.predominantLevel }}
              </UBadge>
            </div>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { BudgetAlert, BudgetAlertLevel } from '#shared/types/budget-alerts'

const logger = createLogger('AlertMetricsPanel')

// Register required ECharts modules
echarts.use([
  LineChart,
  BarChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  CanvasRenderer
])

const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// State
const period = ref<'7d' | '30d' | '90d'>('30d')
const loading = ref(true)
const error = ref<string | null>(null)
const alerts = ref<BudgetAlert[]>([])

const periods = [
  { label: '7 Days', value: '7d' as const },
  { label: '30 Days', value: '30d' as const },
  { label: '90 Days', value: '90d' as const }
]

// Computed: number of days in selected period
const periodDays = computed(() => {
  switch (period.value) {
    case '7d': return 7
    case '30d': return 30
    case '90d': return 90
    default: return 30
  }
})

// Computed: date range for query
const dateRange = computed(() => {
  const end = new Date()
  const start = new Date()
  start.setDate(start.getDate() - periodDays.value)
  return { start, end }
})

// Computed: date range label for display
const dateRangeLabel = computed(() => {
  const { start, end } = dateRange.value
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`
  return `${fmt(start)} - ${fmt(end)}`
})

// Aggregated chart data by date
interface DailyData {
  date: string
  INFO: number
  WARNING: number
  CRITICAL: number
  ESCALATION: number
  total: number
  [key: string]: string | number // Allow string indexing for dynamic level access
}

const chartData = computed<DailyData[]>(() => {
  // Create a map of all dates in the range
  const dateMap = new Map<string, DailyData>()
  const { start, end } = dateRange.value

  // Initialize all dates with zeros
  const current = new Date(start)
  while (current <= end) {
    const dateStr = current.toISOString().split('T')[0] as string
    dateMap.set(dateStr!, {
      date: dateStr,
      INFO: 0,
      WARNING: 0,
      CRITICAL: 0,
      ESCALATION: 0,
      total: 0
    })
    current.setDate(current.getDate() + 1)
  }

  // Aggregate alerts by date
  for (const alert of alerts.value) {
    const dateStr = alert.created_at.split('T')[0] as string
    const data = dateMap.get(dateStr)
    if (data) {
      const level = alert.alert_level as BudgetAlertLevel
      ;(data[level] as number)++
      data.total++
    }
  }

  // Convert to sorted array
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date))
})

// Summary statistics
const summaryStats = computed(() => {
  const total = alerts.value.length
  const productionCount = alerts.value.filter(a => !a.dry_run).length
  const avgPerDay = total / Math.max(periodDays.value, 1)

  // Find peak day
  let peakCount = 0
  let peakDate = ''
  for (const day of chartData.value) {
    if (day.total > peakCount) {
      peakCount = day.total
      peakDate = formatShortDate(day.date as string)
    }
  }

  // Find most common level
  const levelCounts: Record<BudgetAlertLevel, number> = {
    INFO: 0,
    WARNING: 0,
    CRITICAL: 0,
    ESCALATION: 0
  }
  for (const alert of alerts.value) {
    levelCounts[alert.alert_level as BudgetAlertLevel]++
  }

  let mostCommonLevel: BudgetAlertLevel | null = null
  let mostCommonLevelCount = 0
  for (const [level, count] of Object.entries(levelCounts) as [BudgetAlertLevel, number][]) {
    if (count > mostCommonLevelCount) {
      mostCommonLevel = level
      mostCommonLevelCount = count
    }
  }

  return {
    total,
    productionCount,
    avgPerDay,
    peakCount,
    peakDate,
    mostCommonLevel,
    mostCommonLevelCount
  }
})

// Top accounts by alert count
interface AccountSummary {
  accountId: string
  accountName: string
  alertCount: number
  predominantLevel: BudgetAlertLevel
  levelCounts: Record<BudgetAlertLevel, number>
}

const topAccounts = computed<AccountSummary[]>(() => {
  const accountMap = new Map<string, AccountSummary>()

  for (const alert of alerts.value) {
    let account = accountMap.get(alert.account_id)
    if (!account) {
      account = {
        accountId: alert.account_id,
        accountName: alert.account_name || alert.account_id,
        alertCount: 0,
        predominantLevel: 'INFO',
        levelCounts: { INFO: 0, WARNING: 0, CRITICAL: 0, ESCALATION: 0 }
      }
      accountMap.set(alert.account_id, account)
    }
    account.alertCount++
    account.levelCounts[alert.alert_level as BudgetAlertLevel]++

    // Update account name if we get a better one
    if (alert.account_name && !account.accountName.includes(alert.account_name)) {
      account.accountName = alert.account_name
    }
  }

  // Determine predominant level for each account
  for (const account of accountMap.values()) {
    let maxCount = 0
    for (const [level, count] of Object.entries(account.levelCounts) as [BudgetAlertLevel, number][]) {
      if (count > maxCount) {
        maxCount = count
        account.predominantLevel = level
      }
    }
  }

  return Array.from(accountMap.values())
    .sort((a, b) => b.alertCount - a.alertCount)
    .slice(0, 10)
})

// Weekend mark areas for chart
function getWeekendMarkAreas(data: DailyData[]) {
  const weekendAreas: { xAxis: string; name?: string }[][] = []

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

// ECharts options for volume trends
const volumeChartOptions = computed(() => {
  const dates = chartData.value.map(d => d.date)
  const levelColors = {
    INFO: '#3b82f6',      // blue
    WARNING: '#eab308',   // yellow
    CRITICAL: '#ef4444',  // red
    ESCALATION: '#a855f7' // purple
  }

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const date = new Date(params[0].axisValue)
        const dateLabel = `${months[date.getUTCMonth()]} ${date.getUTCDate()}`

        let result = `<strong>${dateLabel}</strong><br/>`
        let total = 0
        for (const p of params) {
          if (p.value > 0) {
            result += `${p.marker} ${p.seriesName}: ${p.value}<br/>`
            total += p.value
          }
        }
        result += `<strong>Total: ${total}</strong>`
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
          const month = d.getUTCMonth() + 1
          const day = d.getUTCDate()
          const weekday = weekdays[d.getUTCDay()]
          return `${month}-${day}\n${weekday}`
        },
        interval: period.value === '90d' ? 6 : period.value === '30d' ? 2 : 0,
        color: '#9ca3af'
      },
      axisLine: { lineStyle: { color: '#4b5563' } }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        formatter: (val: number) => val.toFixed(0),
        color: '#9ca3af'
      },
      splitLine: { lineStyle: { color: '#374151' } }
    },
    grid: { left: '3%', right: '3%', bottom: '15%', top: '5%', containLabel: true },
    series: [
      {
        name: 'INFO',
        type: 'line',
        stack: 'Total',
        smooth: true,
        data: chartData.value.map(d => d.INFO),
        lineStyle: { color: levelColors.INFO },
        itemStyle: { color: levelColors.INFO },
        areaStyle: { color: 'rgba(59, 130, 246, 0.3)' },
        markArea: {
          itemStyle: { color: 'rgba(156, 163, 175, 0.1)' },
          label: {
            show: false
          },
          data: getWeekendMarkAreas(chartData.value)
        }
      },
      {
        name: 'WARNING',
        type: 'line',
        stack: 'Total',
        smooth: true,
        data: chartData.value.map(d => d.WARNING),
        lineStyle: { color: levelColors.WARNING },
        itemStyle: { color: levelColors.WARNING },
        areaStyle: { color: 'rgba(234, 179, 8, 0.3)' }
      },
      {
        name: 'CRITICAL',
        type: 'line',
        stack: 'Total',
        smooth: true,
        data: chartData.value.map(d => d.CRITICAL),
        lineStyle: { color: levelColors.CRITICAL },
        itemStyle: { color: levelColors.CRITICAL },
        areaStyle: { color: 'rgba(239, 68, 68, 0.3)' }
      },
      {
        name: 'ESCALATION',
        type: 'line',
        stack: 'Total',
        smooth: true,
        data: chartData.value.map(d => d.ESCALATION),
        lineStyle: { color: levelColors.ESCALATION },
        itemStyle: { color: levelColors.ESCALATION },
        areaStyle: { color: 'rgba(168, 85, 247, 0.3)' }
      }
    ]
  }
})

// Level color helpers
function getLevelBadgeColor(level: BudgetAlertLevel | null): string {
  switch (level) {
    case 'INFO': return 'blue'
    case 'WARNING': return 'yellow'
    case 'CRITICAL': return 'red'
    case 'ESCALATION': return 'purple'
    default: return 'gray'
  }
}

function getLevelBarColor(level: BudgetAlertLevel): string {
  switch (level) {
    case 'INFO': return 'bg-blue-500'
    case 'WARNING': return 'bg-yellow-500'
    case 'CRITICAL': return 'bg-red-500'
    case 'ESCALATION': return 'bg-purple-500'
    default: return 'bg-gray-500'
  }
}

function getLevelTextColor(level: BudgetAlertLevel | null): string {
  switch (level) {
    case 'INFO': return 'text-blue-400'
    case 'WARNING': return 'text-yellow-400'
    case 'CRITICAL': return 'text-red-400'
    case 'ESCALATION': return 'text-purple-400'
    default: return 'text-gray-400'
  }
}

function getLevelBgColor(level: BudgetAlertLevel | null): string {
  switch (level) {
    case 'INFO': return 'bg-blue-100 dark:bg-blue-900/30'
    case 'WARNING': return 'bg-yellow-100 dark:bg-yellow-900/30'
    case 'CRITICAL': return 'bg-red-100 dark:bg-red-900/30'
    case 'ESCALATION': return 'bg-purple-100 dark:bg-purple-900/30'
    default: return 'bg-gray-100 dark:bg-gray-900/30'
  }
}

function getLevelIconColor(level: BudgetAlertLevel | null): string {
  switch (level) {
    case 'INFO': return 'text-blue-600 dark:text-blue-400'
    case 'WARNING': return 'text-yellow-600 dark:text-yellow-400'
    case 'CRITICAL': return 'text-red-600 dark:text-red-400'
    case 'ESCALATION': return 'text-purple-600 dark:text-purple-400'
    default: return 'text-gray-600 dark:text-gray-400'
  }
}

// Formatting helpers
const formatNumber = (num: number) => new Intl.NumberFormat().format(num)

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr)
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}`
}

// Data loading
const loadData = async () => {
  try {
    loading.value = true
    error.value = null

    // Calculate month(s) to query based on period
    // For efficiency, we query by month using the GSI
    const monthsToQuery = new Set<string>()
    const { start, end } = dateRange.value

    const current = new Date(start)
    while (current <= end) {
      const monthStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
      monthsToQuery.add(monthStr)
      current.setMonth(current.getMonth() + 1)
    }

    // Fetch alerts for each month
    const allAlerts: BudgetAlert[] = []

    for (const month of monthsToQuery) {
      const res = await $fetch<{ success: boolean; data: BudgetAlert[] }>('/api/alerts/list', {
        query: {
          month,
          limit: '200'
        }
      })

      if (res.success && res.data) {
        allAlerts.push(...res.data)
      }
    }

    // Filter to exact date range and deduplicate
    const startDate = dateRange.value.start.toISOString()
    const endDate = dateRange.value.end.toISOString()
    const seenIds = new Set<string>()

    alerts.value = allAlerts
      .filter(a => {
        // Deduplicate by alert_id
        if (seenIds.has(a.alert_id)) return false
        seenIds.add(a.alert_id)
        // Filter to date range
        return a.created_at >= startDate && a.created_at <= endDate
      })
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

  } catch (err: any) {
    logger.error('Error loading alert metrics:', err)
    error.value = err.message || 'Failed to load alert metrics'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>
