<template>
  <div class="historical-trends">
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-400">Loading historical data...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-lg p-4">
      <div class="text-red-400">{{ error }}</div>
    </div>

    <!-- Empty State -->
    <div v-else-if="monthlyPoints.length === 0" class="text-center py-12 text-gray-500 dark:text-gray-400">
      No historical cost data is available for this selection.
    </div>

    <!-- Historical Charts -->
    <div v-else class="space-y-6">
      <!-- 2-Year Trend -->
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-gray-200 mb-4">{{ scopeLabel }} 2-Year Cost Trend</h3>
        <v-chart ref="orgTrendChartRef" :option="orgTrendChart" :autoresize="true" style="height: 400px" />
      </div>

      <!-- Year-over-Year Comparison -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">Year-over-Year Comparison</h3>
          <v-chart ref="yoyComparisonChartRef" :option="yoyComparisonChart" :autoresize="true" style="height: 350px" />
        </div>
        
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">Monthly Growth Rate</h3>
          <v-chart ref="growthRateChartRef" :option="growthRateChart" :autoresize="true" style="height: 350px" />
        </div>
      </div>

      <!-- Quarterly Breakdown -->
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-gray-200 mb-4">Quarterly Spending Analysis</h3>
        <v-chart ref="quarterlyChartRef" :option="quarterlyChart" :autoresize="true" style="height: 350px" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import VChart from 'vue-echarts'
import { chartAnimationDefaults } from '~/utils/chartAnimationDefaults'
import { useChartGroup } from '~/composables/useChartGroup'

const logger = createLogger('HistoricalTrends')

const props = withDefaults(defineProps<{
  selectedAccounts?: string[]
  dataMode?: 'billable' | 'proforma'
}>(), {
  selectedAccounts: () => [],
  dataMode: 'proforma'
})

// Chart group for crosshair linking across cost page charts
const { registerChart, unregisterAll } = useChartGroup('costCharts')

// Template refs for v-chart instances
const orgTrendChartRef = ref<InstanceType<typeof VChart> | null>(null)
const yoyComparisonChartRef = ref<InstanceType<typeof VChart> | null>(null)
const growthRateChartRef = ref<InstanceType<typeof VChart> | null>(null)
const quarterlyChartRef = ref<InstanceType<typeof VChart> | null>(null)

onUnmounted(() => {
  unregisterAll()
})

// State
const loading = ref(true)
const error = ref<string | null>(null)
const historicalData = ref<{ monthlyBreakdown?: Array<{ month: string; cost: number }> } | null>(null)
let fetchGeneration = 0

const monthlyPoints = computed(() => {
  return (historicalData.value?.monthlyBreakdown || [])
    .filter(point => /^\d{4}-\d{2}$/.test(point.month) && Number.isFinite(Number(point.cost)))
    .map(point => ({ month: point.month, cost: Number(point.cost) }))
    .sort((a, b) => a.month.localeCompare(b.month))
})

const scopeLabel = computed(() => {
  if (props.selectedAccounts.length === 1) return `Account ${props.selectedAccounts[0]}`
  if (props.selectedAccounts.length > 1) return `${props.selectedAccounts.length} Accounts`
  return 'Organization-Wide'
})

const formatMonth = (month: string, includeYear = true) => {
  const date = new Date(`${month}-01T00:00:00`)
  return date.toLocaleDateString('en-US', includeYear
    ? { month: 'short', year: '2-digit' }
    : { month: 'short' })
}

// Fetch historical data
const fetchHistoricalData = async () => {
  const generation = ++fetchGeneration
  loading.value = true
  error.value = null
  
  try {
    // Fetch 2 years of historical data
    const params: Record<string, string> = {
      period: 'last24months',
      granularity: 'MONTHLY',
      groupBy: 'LINKED_ACCOUNT',
      proforma: String(props.dataMode === 'proforma')
    }
    if (props.selectedAccounts.length > 0) {
      params.accountIds = props.selectedAccounts.join(',')
    }

    const response = await $fetch('/api/costs/historical', {
      params
    })

    if (generation !== fetchGeneration) return

    const payload = (response as any).data || response || {}
    historicalData.value = props.dataMode === 'proforma'
      ? (payload.proforma || payload.billable || payload)
      : (payload.billable || payload)
    logger.info('Historical data loaded:', historicalData.value)
  } catch (err: any) {
    if (generation !== fetchGeneration) return
    logger.error('Error fetching historical data:', err)
    error.value = err.message || 'Failed to load historical data'
  } finally {
    if (generation === fetchGeneration) loading.value = false
  }
}

// Helper to format currency compactly without prefix (for chart axis labels where $ is prepended separately)
const formatCurrencyCompact = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  return value.toFixed(2)
}

// Two-year trend chart
const orgTrendChart = computed(() => {
  const months = monthlyPoints.value.map(point => formatMonth(point.month))
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        return `${params[0].axisValue}<br/>Total Spend: $${formatCurrencyCompact(params[0].value)}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      backgroundColor: 'rgba(0,0,0,0.05)'
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { 
        color: '#9ca3af',
        interval: 2
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (value: number) => `$${formatCurrencyCompact(value)}`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' }
      }
    },
    series: [{
      name: 'Total Spend',
      type: 'line',
      data: monthlyPoints.value.map(point => point.cost),
      smooth: true,
      lineStyle: {
        width: 3,
        color: '#3b82f6'
      },
      itemStyle: { color: '#3b82f6' },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
          ]
        }
      }
    }]
  }
})

// Year-over-Year comparison chart
const yoyComparisonChart = computed(() => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const years = [...new Set(monthlyPoints.value.map(point => point.month.substring(0, 4)))].slice(-2)
  const costsByMonth = new Map(monthlyPoints.value.map(point => [point.month, point.cost]))
  const series = years.map((year, index) => ({
    name: year,
    type: 'bar',
    data: months.map((_, monthIndex) => costsByMonth.get(`${year}-${String(monthIndex + 1).padStart(2, '0')}`) ?? null),
    itemStyle: { color: index === years.length - 1 ? '#3b82f6' : 'rgba(107, 114, 128, 0.8)' }
  }))
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let result = params[0].axisValue + '<br/>'
        params.forEach((item: any) => {
          result += `${item.marker} ${item.seriesName}: $${formatCurrencyCompact(item.value)}<br/>`
        })
        return result
      }
    },
    legend: {
      data: years,
      textStyle: { color: '#9ca3af' },
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { color: '#9ca3af' },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (value: number) => `$${formatCurrencyCompact(value)}`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' }
      }
    },
    series
  }
})

// Monthly growth rate chart
const growthRateChart = computed(() => {
  const points = monthlyPoints.value.slice(-13)
  const months = points.slice(1).map(point => formatMonth(point.month))
  const growthRates = points.slice(1).map((point, index) => {
    const previous = points[index]?.cost || 0
    return previous === 0 ? 0 : ((point.cost - previous) / previous) * 100
  })
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const value = params[0].value
        const color = value >= 0 ? '#10b981' : '#ef4444'
        return `${params[0].axisValue}<br/>Growth: <span style="color:${color}">${value > 0 ? '+' : ''}${value.toFixed(1)}%</span>`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { color: '#9ca3af' },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (value: number) => `${value.toFixed(1)}%`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' }
      },
      splitArea: {
        show: true,
        areaStyle: {
          color: ['rgba(250, 250, 250, 0)', 'rgba(250, 250, 250, 0)']
        }
      }
    },
    series: [{
      type: 'bar',
      data: growthRates.map(rate => ({
        value: rate,
        itemStyle: {
          color: rate >= 0 ? '#10b981' : '#ef4444'
        }
      })),
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => `${params.value.toFixed(1)}%`,
        color: '#9ca3af',
        fontSize: 10
      }
    }]
  }
})

// Quarterly breakdown chart
const quarterlyChart = computed(() => {
  const totals = new Map<string, number>()
  monthlyPoints.value.forEach((point) => {
    const year = point.month.substring(0, 4)
    const month = Number(point.month.substring(5, 7))
    const key = `${year}-Q${Math.floor((month - 1) / 3) + 1}`
    totals.set(key, (totals.get(key) || 0) + point.cost)
  })
  const quarterEntries = [...totals.entries()].sort(([a], [b]) => a.localeCompare(b))
  const quarters = quarterEntries.map(([key]) => {
    const [year, quarter] = key.split('-')
    return `${quarter} ${year}`
  })
  const quarterlyData = quarterEntries.map(([, cost]) => cost)
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        return `${params[0].name}<br/>Total: $${formatCurrencyCompact(params[0].value)}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: quarters,
      axisLabel: { 
        color: '#9ca3af',
        rotate: 45
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#9ca3af',
        formatter: (value: number) => `$${formatCurrencyCompact(value)}`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' }
      }
    },
    series: [{
      type: 'bar',
      data: quarterlyData.map((value, i) => ({
        value,
        itemStyle: {
          color: i >= Math.max(0, quarterlyData.length - 4) ? '#3b82f6' : 'rgba(107, 114, 128, 0.6)'
        }
      })),
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => `$${formatCurrencyCompact(params.value)}`,
        color: '#9ca3af',
        fontSize: 10
      }
    }]
  }
})

// Load data on mount, then register charts for crosshair linking
onMounted(async () => {
  await fetchHistoricalData()
  await nextTick()
  registerChart(orgTrendChartRef.value)
  registerChart(yoyComparisonChartRef.value)
  registerChart(growthRateChartRef.value)
  registerChart(quarterlyChartRef.value)
})

watch(
  () => [props.dataMode, ...props.selectedAccounts],
  () => fetchHistoricalData()
)
</script>
