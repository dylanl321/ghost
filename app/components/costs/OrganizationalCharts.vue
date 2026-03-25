<template>
  <div class="organizational-charts">
    <!-- Loading State -->
    <div v-if="loading" class="text-center py-12">
      <div class="text-gray-400">Loading organizational data...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="bg-red-900/20 border border-red-700 rounded-lg p-4">
      <div class="text-red-400">{{ error }}</div>
    </div>

    <!-- LOB Groups -->
    <div v-else-if="lobGroups.length > 0" class="space-y-8">
      <!-- LOB Selector Buttons -->
      <div class="mb-6">
        <div class="flex items-center justify-between mb-3">
          <label class="text-gray-400 text-sm">Select Line of Business:</label>
          <button 
            v-if="selectedLob"
            @click="selectedLob = ''"
            class="text-xs text-blue-400 hover:text-blue-300"
          >
            ← Back to Overview
          </button>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            @click="selectedLob = ''"
            :class="[
              'px-3 py-1.5 text-xs rounded-full transition-all',
              !selectedLob 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
            ]"
          >
            All LOBs Overview
          </button>
          <button
            v-for="lob in lobGroups"
            :key="lob.name"
            @click="selectLob(lob.name)"
            :class="[
              'px-3 py-1.5 text-xs rounded-full transition-all',
              selectedLob === lob.name 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700'
            ]"
            :title="`${formatCurrency(lob.totalSpend)}`"
          >
            {{ getLobDisplayName(lob.name) }}
            <span class="ml-1 opacity-70">({{ lob.accounts.length }})</span>
          </button>
        </div>
      </div>

      <!-- All LOBs Overview -->
      <div v-if="!selectedLob" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <!-- LOB Comparison Bar Chart -->
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4 lg:col-span-2">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">LOB Spending Comparison</h3>
          <v-chart
            :ref="registerChartRef"
            :option="lobComparisonChart"
            :autoresize="true"
            style="height: 400px"
            @click="handleChartClick"
          />
        </div>

        <!-- LOB Distribution Pie -->
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">LOB Distribution</h3>
          <v-chart
            :ref="registerChartRef"
            :option="lobDistributionChart"
            :autoresize="true"
            style="height: 400px"
            @click="handleChartClick"
          />
        </div>

        <!-- LOB Year-over-Year Comparison -->
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4 lg:col-span-3">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">Year-over-Year LOB Comparison (2 Years)</h3>
          <v-chart :ref="registerChartRef" :option="lobYearOverYearChart" :autoresize="true" style="height: 400px" />
        </div>

        <!-- LOB Trends -->
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4 lg:col-span-3">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">2-Year LOB Spending Trends</h3>
          <v-chart :ref="registerChartRef" :option="lobTrendsChart" :autoresize="true" style="height: 400px" />
        </div>
      </div>

      <!-- Specific LOB View -->
      <div v-else class="space-y-6">
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <div class="flex justify-between items-center mb-4">
            <div>
              <h2 class="text-xl font-bold text-gray-200">{{ getLobDisplayName(selectedLob) }}</h2>
              <p v-if="lobFullNames[selectedLob] && lobFullNames[selectedLob] !== selectedLob" class="text-sm text-gray-400">
                {{ selectedLob }}
              </p>
            </div>
            <button 
              @click="selectedLob = ''"
              class="text-gray-400 hover:text-gray-300"
            >
              ← Back to Overview
            </button>
          </div>

          <!-- LOB Metrics -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-gray-800 rounded p-3">
              <div class="text-gray-400 text-sm">Total Accounts</div>
              <div class="text-2xl font-bold text-gray-200">{{ selectedLobData.accounts.length }}</div>
            </div>
            <div class="bg-gray-800 rounded p-3">
              <div class="text-gray-400 text-sm">Total Monthly Spend</div>
              <div class="text-2xl font-bold text-gray-200">{{ formatCurrency(selectedLobData.totalSpend) }}</div>
            </div>
            <div class="bg-gray-800 rounded p-3">
              <div class="text-gray-400 text-sm">Average per Account</div>
              <div class="text-2xl font-bold text-gray-200">
                {{ formatCurrency(selectedLobData.totalSpend / selectedLobData.accounts.length) }}
              </div>
            </div>
          </div>

          <!-- Budget Comparison (if available) -->
          <div v-if="selectedLobBudgetData" class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div class="bg-gray-800 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-gray-200 mb-4">Last Month Budget vs Spend</h3>
              <v-chart :ref="registerChartRef" :option="lastMonthBudgetChart" :autoresize="true" style="height: 300px" />
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-gray-200 mb-4">Current Month-to-Date</h3>
              <v-chart :ref="registerChartRef" :option="currentMtdBudgetChart" :autoresize="true" style="height: 300px" />
            </div>
          </div>

          <!-- LOB Year-over-Year Comparison -->
          <div class="bg-gray-800 rounded-lg p-4 mb-6">
            <h3 class="text-lg font-semibold text-gray-200 mb-4">Year-over-Year Comparison</h3>
            <v-chart :ref="registerChartRef" :option="selectedLobYoYChart" :autoresize="true" style="height: 350px" />
          </div>

          <!-- LOB Charts -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-800 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-gray-200 mb-4">2-Year Spending Trend</h3>
              <v-chart :ref="registerChartRef" :option="selectedLobTrendChart" :autoresize="true" style="height: 300px" />
            </div>
            <div class="bg-gray-800 rounded-lg p-4">
              <h3 class="text-lg font-semibold text-gray-200 mb-4">Top Accounts</h3>
              <v-chart :ref="registerChartRef" :option="selectedLobAccountsChart" :autoresize="true" style="height: 300px" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- No Data -->
    <div v-else class="text-center py-12">
      <div class="text-gray-500">No organizational data available</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import VChart from 'vue-echarts'
import { CHART_COLORS, CHART_THEME, getSeriesColor, getUtilizationColor } from '~/utils/chart-theme'
import { chartAnimationDefaults } from '~/utils/chartAnimationDefaults'

const logger = createLogger('OrganizationalCharts')

// Chart group for crosshair linking across cost page charts
const { registerChart, unregisterAll } = useChartGroup('costCharts')
// Ref callback used by all v-chart instances
function registerChartRef(el: any) {
  if (el) registerChart(el)
}

onUnmounted(() => {
  unregisterAll()
})

// Props — when provided, data comes from the parent's shared pipeline
const props = defineProps<{
  dataset?: any | null
  dataMode?: string
}>()

// State
const loading = ref(true)
const error = ref<string | null>(null)
const lobGroups = ref<any[]>([])
const selectedLob = ref('')
const timeframe = ref('last12months') // Changed to 12 months for long-term view
const dataFetched = ref(false) // Track if data has been fetched
const selectedLobBudgetData = ref<any>(null) // Budget data for selected LOB
const lobFullNames = ref<Record<string, string>>({}) // Map of LOB code to full name

// Fetch LOB full names from API
const fetchLobFullNames = async () => {
  try {
    const response = await $fetch('/api/accounts/lines-of-business')
    const data = (response as any).data || response || []
    
    // Build mapping of LOB code to full name
    const mapping: Record<string, string> = {}
    data.forEach((item: any) => {
      if (item.linesOfBusiness && item.linesOfBusinessFullName) {
        mapping[item.linesOfBusiness] = item.linesOfBusinessFullName
      }
    })
    lobFullNames.value = mapping
  } catch (err) {
    logger.error('Failed to fetch LOB full names:', err)
  }
}

// Build LOB groups from summary accounts + historical monthly breakdown
const buildLobGroups = (accountsWithCosts: any[], monthlyBreakdown: any[]) => {
  const lobMap = new Map()

  accountsWithCosts.forEach((account: any) => {
    const lob = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
    if (!lobMap.has(lob)) {
      lobMap.set(lob, {
        name: lob,
        accounts: [],
        totalSpend: 0,
        monthlyData: {},
        historicalMonthlyData: monthlyBreakdown
      })
    }

    const group = lobMap.get(lob)
    group.accounts.push(account)

    const cost = account.totalCost || account.estimatedMonthlyCharge || 0
    group.totalSpend += cost
  })

  const groups = Array.from(lobMap.values())
    .filter(g => g.totalSpend > 0)
    .sort((a, b) => b.totalSpend - a.totalSpend)

  // Ensure every group has the full historical monthly data
  if (monthlyBreakdown.length) {
    groups.forEach(group => {
      group.historicalMonthlyData = monthlyBreakdown
    })
  }

  return groups
}

// Process data that came from the parent dataset prop.
// Returns true if meaningful data was found, false if dataset is incomplete.
const processDatasetData = (dataset: any): boolean => {
  loading.value = true
  error.value = null

  try {
    // Extract summary accounts — try unwrapped .summary first, then fall back
    const summaryData = dataset.summary?.data || dataset.summary || {}
    const accountsWithCosts = summaryData.accounts || []

    // If we have no accounts, the dataset isn't useful for org charts
    if (accountsWithCosts.length === 0) {
      loading.value = false
      return false
    }

    // Extract historical monthly breakdown from the dataset
    // Prefer orgWideHistorical (unfiltered) over historical (which may be account-filtered)
    const historicalRaw = dataset.orgWideHistorical?.data || dataset.orgWideHistorical
      || dataset.historical?.data || dataset.historical || {}
    // Unwrap proforma/billable structure if present
    const mode = dataset.mode || 'billable'
    const historicalData = (historicalRaw.billable || historicalRaw.proforma)
      ? (historicalRaw[mode] || historicalRaw.billable || historicalRaw)
      : historicalRaw
    const monthlyBreakdown = historicalData.monthlyBreakdown || []

    lobGroups.value = buildLobGroups(accountsWithCosts, monthlyBreakdown)

    // Only mark as fetched if we got meaningful groups
    if (lobGroups.value.length > 0) {
      dataFetched.value = true
      loading.value = false
      return true
    }

    loading.value = false
    return false
  } catch (err: any) {
    logger.error('Error processing dataset for organizational charts:', err)
    error.value = err.message || 'Failed to process organizational data'
    loading.value = false
    return false
  }
}

// Fetch organizational data independently — used as fallback when no dataset prop
const fetchOrganizationalData = async () => {
  // If the parent already supplied a dataset with the key fields we need, use that
  if (props.dataset) {
    const summaryData = props.dataset.summary?.data || props.dataset.summary
    const hasAccounts = (summaryData?.accounts?.length || 0) > 0
    if (hasAccounts) {
      const success = processDatasetData(props.dataset)
      if (success) return
      // If processDatasetData didn't produce groups, fall through to independent fetch
    }
  }

  // Don't refetch if already loaded
  if (dataFetched.value) {
    return
  }
  
  loading.value = true
  error.value = null
  
  try {
    // Fetch 24 months of historical data
    const [historicalResponse, summaryResponse] = await Promise.all([
      $fetch('/api/costs/historical', {
        params: {
          period: 'last24months',
          groupBy: 'LINKED_ACCOUNT'
        }
      }),
      $fetch('/api/costs/summary', {
        params: {
          period: 'last12months',
          groupBy: 'LINKED_ACCOUNT',
          enhanced: true
        }
      })
    ])

    // If the watcher already processed dataset data while we were fetching, bail out
    if (dataFetched.value) {
      loading.value = false
      return
    }
    
    // Process the data — unwrap proforma/billable structure if present
    const historicalRaw = (historicalResponse as any).data || historicalResponse || {}
    const historicalData = (historicalRaw.billable || historicalRaw.proforma)
      ? (historicalRaw.proforma || historicalRaw.billable || historicalRaw)
      : historicalRaw
    const summaryData = (summaryResponse as any).data || summaryResponse || {}
    const accountsWithCosts = summaryData.accounts || []
    const monthlyBreakdown = historicalData.monthlyBreakdown || []

    lobGroups.value = buildLobGroups(accountsWithCosts, monthlyBreakdown)
    
    // Mark data as fetched
    dataFetched.value = true
    
  } catch (err: any) {
    logger.error('Error fetching organizational data:', err)
    error.value = err.message || 'Failed to load organizational data'
  } finally {
    loading.value = false
  }
}

// Fetch budget data for selected LOB (last month & current MTD)
const fetchLobBudgetData = async (lobName: string) => {
  try {
    // Get accounts for this LOB
    const lobData = lobGroups.value.find(g => g.name === lobName)
    if (!lobData) return
    
    const accountIds = lobData.accounts.map((a: any) => a.accountId).join(',')
    
    // Fetch last month data
    const lastMonthResponse = await $fetch('/api/costs/summary', {
      params: {
        period: 'lastMonth',
        accountIds,
        groupBy: 'LINKED_ACCOUNT',
        enhanced: true
      }
    })
    
    // Fetch current month-to-date
    const currentMtdResponse = await $fetch('/api/costs/summary', {
      params: {
        period: 'thisMonth',
        accountIds,
        groupBy: 'LINKED_ACCOUNT',
        enhanced: true
      }
    })
    
    const lastMonthData = (lastMonthResponse as any).data || {}
    const currentMtdData = (currentMtdResponse as any).data || {}
    
    selectedLobBudgetData.value = {
      lastMonth: {
        spend: lastMonthData.summary?.totalCost || 0,
        budget: lobData.accounts.reduce((sum: number, a: any) => 
          sum + (parseFloat(a.estimatedMonthlyBudget || '0')), 0)
      },
      currentMtd: {
        spend: currentMtdData.summary?.totalCost || 0,
        budget: lobData.accounts.reduce((sum: number, a: any) => 
          sum + (parseFloat(a.estimatedMonthlyBudget || '0')), 0)
      }
    }
    
  } catch (err) {
    logger.error('Error fetching LOB budget data:', err)
  }
}

// Computed data for selected LOB
const selectedLobData = computed(() => {
  if (!selectedLob.value) return null
  return lobGroups.value.find(g => g.name === selectedLob.value)
})

// Watch for LOB selection changes to fetch budget data
watch(selectedLob, async (newLob) => {
  if (newLob) {
    await fetchLobBudgetData(newLob)
  } else {
    selectedLobBudgetData.value = null
  }
})

// Re-process when the parent dataset's key fields change
// Watch specific fields instead of deep-watching the entire large dataset object
watch(
  () => [props.dataset?.summary, props.dataset?.orgWideHistorical, props.dataset?.historical],
  () => {
    if (props.dataset) {
      processDatasetData(props.dataset)
    }
  }
)

// Chart configurations - Overview charts (no budget logic, focus on spending patterns)
const lobComparisonChart = computed(() => {
  const chart: any = {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: { 
      trigger: 'axis',
      formatter: (params: any) => {
        const value = params[0].value
        const lobName = params[0].name
        const displayName = getLobDisplayName(lobName)
        return `${displayName}: ${formatCurrency(value)}<br/><small>Click to view details</small>`
      }
    },
    xAxis: {
      type: 'category',
      data: lobGroups.value.map(g => g.name),
      axisLabel: { 
        color: CHART_THEME.textColor, 
        rotate: 45,
        formatter: (value: string) => getLobDisplayName(value)
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      }
    },
    series: [{
      name: 'Total Spend',
      type: 'bar',
      data: lobGroups.value.map(g => ({
        value: g.totalSpend,
        name: g.name
      })),
      itemStyle: { 
        color: CHART_COLORS[0],
        emphasis: {
          color: '#60a5fa'
        }
      },
      emphasis: {
        itemStyle: {
          shadowBlur: 10,
          shadowColor: 'rgba(0,0,0,0.5)'
        }
      }
    }]
  }
  
  // Add click handler using onChartClick
  return chart
})

const lobDistributionChart = computed(() => ({
  ...chartAnimationDefaults,
  backgroundColor: 'transparent',
  tooltip: { trigger: 'item' },
  series: [{
    type: 'pie',
    radius: ['40%', '70%'],
    data: lobGroups.value.map(g => ({
      name: g.name,
      value: g.totalSpend
    })),
    label: { color: CHART_THEME.textColor }
  }]
}))

// Helper: extract real monthly costs for a LOB from historical data, grouped by year
const getLobMonthlyByYear = (lob: any, year: number): number[] => {
  const monthlyCosts = new Array(12).fill(0)
  const monthlyData = lob.historicalMonthlyData || []

  monthlyData.forEach((monthEntry: any) => {
    const monthStr = monthEntry.month // e.g. "2025-03"
    if (!monthStr) return
    const [y, m] = monthStr.split('-').map(Number)
    if (y === year && m >= 1 && m <= 12) {
      // Sum costs for accounts in this LOB
      const accountIds = new Set(lob.accounts.map((a: any) => a.accountId))
      const breakdown = monthEntry.accountBreakdown || []
      breakdown.forEach((entry: any) => {
        if (accountIds.has(entry.accountId)) {
          monthlyCosts[m - 1] += entry.cost || 0
        }
      })
    }
  })

  return monthlyCosts
}

// Year-over-Year LOB Comparison Chart (uses real historical data)
const lobYearOverYearChart = computed(() => {
  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1
  const twoYearsAgo = currentYear - 2
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  // Get top 3 LOBs for cleaner visualization
  const topLobs = lobGroups.value.slice(0, 3)
  
  // Create series for each LOB and year using real data
  const series: any[] = []
  const colors: Record<number, string[]> = {
    [twoYearsAgo]: ['rgba(156, 163, 175, 0.6)', 'rgba(156, 163, 175, 0.5)', 'rgba(156, 163, 175, 0.4)'],
    [lastYear]: ['rgba(59, 130, 246, 0.6)', 'rgba(16, 185, 129, 0.6)', 'rgba(245, 158, 11, 0.6)'],
    [currentYear]: [CHART_COLORS[0], CHART_COLORS[1], CHART_COLORS[2]]
  }
  
  topLobs.forEach((lob, lobIndex) => {
    const lobName = getLobDisplayName(lob.name)
    
    // Two years ago data (real)
    const twoYearsAgoData = getLobMonthlyByYear(lob, twoYearsAgo)
    series.push({
      name: `${lobName} (${twoYearsAgo})`,
      type: 'line',
      data: twoYearsAgoData,
      lineStyle: { 
        width: 1,
        type: 'dashed',
        color: colors[twoYearsAgo][lobIndex]
      },
      itemStyle: { 
        color: colors[twoYearsAgo][lobIndex],
        opacity: 0.7
      },
      symbol: 'circle',
      symbolSize: 3
    })
    
    // Last year data (real)
    const lastYearData = getLobMonthlyByYear(lob, lastYear)
    series.push({
      name: `${lobName} (${lastYear})`,
      type: 'line',
      data: lastYearData,
      lineStyle: { 
        width: 2,
        type: 'dotted',
        color: colors[lastYear][lobIndex]
      },
      itemStyle: { 
        color: colors[lastYear][lobIndex],
        opacity: 0.8
      },
      symbol: 'circle',
      symbolSize: 4
    })
    
    // Current year data (real, partial - only months with data)
    const currentMonth = new Date().getMonth()
    const currentYearData = getLobMonthlyByYear(lob, currentYear)
    series.push({
      name: `${lobName} (${currentYear})`,
      type: 'line',
      data: currentYearData.map((val, i) => i < currentMonth ? val : null),
      lineStyle: { 
        width: 3,
        color: colors[currentYear][lobIndex]
      },
      itemStyle: { 
        color: colors[currentYear][lobIndex]
      },
      symbol: 'circle',
      symbolSize: 5
    })
  })
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `<strong>${params[0].axisValue}</strong><br/>`

        // Group by LOB for better organization
        const lobData: Record<string, any[]> = {}
        params.forEach((item: any) => {
          const lobName = item.seriesName.replace(/ \(\d{4}\)/, '')
          if (!lobData[lobName]) lobData[lobName] = []
          lobData[lobName].push(item)
        })
        
        Object.entries(lobData).forEach(([lobName, items]) => {
          result += `<br/><strong>${lobName}:</strong><br/>`
          items.sort((a: any, b: any) => {
            const yearA = parseInt(a.seriesName.match(/\((\d{4})\)/)?.[1] || '0')
            const yearB = parseInt(b.seriesName.match(/\((\d{4})\)/)?.[1] || '0')
            return yearA - yearB
          }).forEach((item: any) => {
            if (item.value !== null && item.value !== undefined) {
              const year = item.seriesName.match(/\((\d{4})\)/)?.[1]
              result += `${item.marker} ${year}: ${formatCurrency(item.value)}<br/>`
            }
          })
        })
        
        return result
      }
    },
    legend: {
      data: series.map(s => s.name),
      textStyle: { color: CHART_THEME.textColor },
      type: 'scroll',
      bottom: 0,
      selected: {
        // Show only current year and last year by default
        ...series.reduce((acc, s) => {
          acc[s.name] = !s.name.includes(`(${twoYearsAgo})`)
          return acc
        }, {} as Record<string, boolean>)
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '5%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { color: CHART_THEME.textColor },
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
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
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

const lobTrendsChart = computed(() => {
  // Generate month labels for past 23 complete months (excludes current partial month)
  const months: string[] = []
  const now = new Date()
  for (let i = 23; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
  }
  
  // Define distinct colors for each LOB
  const colors = CHART_COLORS.slice(0, 5)
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let result = params[0].axisValue + '<br/>'
        params.forEach((item: any) => {
          const displayName = getLobDisplayName(item.seriesName)
          result += `${item.marker} ${displayName}: ${formatCurrency(item.value)}<br/>`
        })
        return result
      }
    },
    legend: {
      data: lobGroups.value.slice(0, 5).map(g => getLobDisplayName(g.name)),
      textStyle: { color: CHART_THEME.textColor },
      type: 'scroll',
      bottom: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      containLabel: true,
      backgroundColor: 'rgba(0,0,0,0.1)' // Subtle background
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { 
        color: CHART_THEME.textColor,
        interval: 2 // Show every 3rd month to avoid crowding
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' } // Subtle line
      },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(156, 163, 175, 0.1)' } // Very subtle grid
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.1)' } // Very subtle grid
      }
    },
    series: lobGroups.value.slice(0, 5).map((g, index) => {
      // Extract real monthly costs from historical data for this LOB
      const accountIds = new Set(g.accounts.map((a: any) => a.accountId))
      const monthlyData = (g.historicalMonthlyData || [])
      
      // Build a map of month label -> cost from the real data
      const realCostsByMonth = new Map<string, number>()
      monthlyData.forEach((monthEntry: any) => {
        const monthStr = monthEntry.month
        if (!monthStr) return
        const [yr, mo] = monthStr.split('-').map(Number)
        const d = new Date(yr, mo - 1, 1)
        const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
        const breakdown = monthEntry.accountBreakdown || []
        let lobCost = 0
        breakdown.forEach((entry: any) => {
          if (accountIds.has(entry.accountId)) {
            lobCost += entry.cost || 0
          }
        })
        realCostsByMonth.set(label, (realCostsByMonth.get(label) || 0) + lobCost)
      })
      
      return {
        name: g.name,
        type: 'line',
        smooth: true,
        lineStyle: {
          width: 2,
          color: colors[index]
        },
        itemStyle: {
          color: colors[index]
        },
        emphasis: {
          lineStyle: { width: 3 }
        },
        data: months.map(label => realCostsByMonth.get(label) || 0)
      }
    })
  }
})

const selectedLobTrendChart = computed(() => {
  if (!selectedLobData.value) return {}

  // Generate month labels for past 23 complete months (excludes current partial month)
  const months: string[] = []
  const now = new Date()
  for (let i = 23; i >= 1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
  }
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        return `${params[0].axisValue}<br/>Spend: ${formatCurrency(params[0].value)}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
      backgroundColor: 'rgba(0,0,0,0.05)' // Very subtle background
    },
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: { 
        color: CHART_THEME.textColor,
        interval: 2 // Show every 3rd month
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        show: true,
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' } // Ultra subtle
      }
    },
    yAxis: {
      type: 'value',
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' } // Ultra subtle
      }
    },
    series: [{
      type: 'line',
      data: (() => {
        // Extract real monthly costs from historical data for this LOB
        const accountIds = new Set(selectedLobData.value.accounts.map((a: any) => a.accountId))
        const monthlyData = selectedLobData.value.historicalMonthlyData || []
        
        const realCostsByMonth = new Map<string, number>()
        monthlyData.forEach((monthEntry: any) => {
          const monthStr = monthEntry.month
          if (!monthStr) return
          const [yr, mo] = monthStr.split('-').map(Number)
          const d = new Date(yr, mo - 1, 1)
          const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
          const breakdown = monthEntry.accountBreakdown || []
          let lobCost = 0
          breakdown.forEach((entry: any) => {
            if (accountIds.has(entry.accountId)) {
              lobCost += entry.cost || 0
            }
          })
          realCostsByMonth.set(label, (realCostsByMonth.get(label) || 0) + lobCost)
        })
        
        return months.map(label => realCostsByMonth.get(label) || 0)
      })(),
      smooth: true,
      lineStyle: {
        width: 2,
        color: CHART_COLORS[1]
      },
      itemStyle: { color: CHART_COLORS[1] },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(16, 185, 129, 0.2)' },
            { offset: 1, color: 'rgba(16, 185, 129, 0.02)' }
          ]
        }
      }
    }]
  }
})

// Selected LOB Year-over-Year Comparison
const selectedLobYoYChart = computed(() => {
  if (!selectedLobData.value) return {}
  
  const currentYear = new Date().getFullYear()
  const lastYear = currentYear - 1
  const twoYearsAgo = currentYear - 2
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const currentMonth = new Date().getMonth()
  
  // Use real historical data for each year
  const twoYearsAgoData = getLobMonthlyByYear(selectedLobData.value, twoYearsAgo)
  const lastYearData = getLobMonthlyByYear(selectedLobData.value, lastYear)
  const currentYearData = getLobMonthlyByYear(selectedLobData.value, currentYear)
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `<strong>${params[0].axisValue}</strong><br/>`
        params.forEach((item: any) => {
          if (item.value !== null && item.value !== undefined) {
            const changeIcon = item.seriesIndex > 0 ? 
              (item.value > params[item.seriesIndex - 1].value ? '↑' : '↓') : ''
            result += `${item.marker} ${item.seriesName}: ${formatCurrency(item.value)} ${changeIcon}<br/>`
          }
        })
        
        // Calculate YoY changes
        const currentIdx = params.findIndex((p: any) => p.seriesName === String(currentYear))
        const lastIdx = params.findIndex((p: any) => p.seriesName === String(lastYear))
        const twoYearsIdx = params.findIndex((p: any) => p.seriesName === String(twoYearsAgo))
        
        if (currentIdx >= 0 && lastIdx >= 0 && params[currentIdx].value && params[lastIdx].value) {
          const yoyChange = ((params[currentIdx].value - params[lastIdx].value) / params[lastIdx].value) * 100
          result += `<br/>YoY Change (${currentYear} vs ${lastYear}): <strong style="color:${yoyChange >= 0 ? '#10b981' : '#ef4444'}">${yoyChange >= 0 ? '+' : ''}${yoyChange.toFixed(1)}%</strong>`
        }
        
        if (lastIdx >= 0 && twoYearsIdx >= 0 && params[lastIdx].value && params[twoYearsIdx].value) {
          const yoyChange = ((params[lastIdx].value - params[twoYearsIdx].value) / params[twoYearsIdx].value) * 100
          result += `<br/>YoY Change (${lastYear} vs ${twoYearsAgo}): <strong style="color:${yoyChange >= 0 ? '#10b981' : '#ef4444'}">${yoyChange >= 0 ? '+' : ''}${yoyChange.toFixed(1)}%</strong>`
        }
        
        return result
      }
    },
    legend: {
      data: [String(twoYearsAgo), String(lastYear), String(currentYear)],
      textStyle: { color: CHART_THEME.textColor }
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
      axisLabel: { color: CHART_THEME.textColor },
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
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      },
      axisLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.2)' }
      },
      splitLine: {
        lineStyle: { color: 'rgba(156, 163, 175, 0.05)' }
      }
    },
    series: [
      {
        name: String(twoYearsAgo),
        type: 'bar',
        data: twoYearsAgoData,
        itemStyle: { 
          color: 'rgba(156, 163, 175, 0.4)'
        },
        barGap: '10%'
      },
      {
        name: String(lastYear),
        type: 'bar',
        data: lastYearData,
        itemStyle: { 
          color: 'rgba(59, 130, 246, 0.6)'
        }
      },
      {
        name: String(currentYear),
        type: 'bar',
        data: currentYearData.map((val, i) => i < currentMonth ? val : null),
        itemStyle: { 
          color: CHART_COLORS[0]
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => {
            // Only show label for current month
            if (params.dataIndex === currentMonth) {
              return 'Current'
            }
            return ''
          },
          color: '#f59e0b',
          fontSize: 10
        }
      }
    ]
  }
})

const selectedLobAccountsChart = computed(() => {
  if (!selectedLobData.value) return {}
  
  const topAccounts = selectedLobData.value.accounts
    .sort((a: any, b: any) => {
      const costA = a.totalCost || a.currentSpend || a.estimatedMonthlyCharge || 0
      const costB = b.totalCost || b.currentSpend || b.estimatedMonthlyCharge || 0
      return parseFloat(String(costB)) - parseFloat(String(costA))
    })
    .slice(0, 5)
    .map((a: any) => ({
      name: a.accountName || a.accountId,
      value: parseFloat(String(a.totalCost || a.currentSpend || a.estimatedMonthlyCharge || 0))
    }))
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        return `${params[0].name}: ${formatCurrency(params[0].value)}`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true
    },
    xAxis: {
      type: 'value',
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      }
    },
    yAxis: {
      type: 'category',
      data: topAccounts.map((a: any) => a.name),
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: string) => {
          return value.length > 20 ? value.substring(0, 20) + '...' : value
        }
      }
    },
    series: [{
      type: 'bar',
      data: topAccounts.map((a: any) => a.value),
      itemStyle: { 
        color: {
          type: 'linear',
          x: 0, y: 0, x2: 1, y2: 0,
          colorStops: [
            { offset: 0, color: '#f59e0b' },
            { offset: 1, color: '#fbbf24' }
          ]
        }
      },
      label: {
        show: true,
        position: 'right',
        formatter: (params: any) => `${formatCurrency(params.value)}`,
        color: CHART_THEME.textColor
      }
    }]
  }
})

// Budget comparison charts for selected LOB
const lastMonthBudgetChart = computed(() => {
  if (!selectedLobBudgetData.value?.lastMonth) return {}
  
  const data = selectedLobBudgetData.value.lastMonth
  const utilization = data.budget > 0 ? (data.spend / data.budget) * 100 : 0
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ['Budget', 'Actual Spend'],
      axisLabel: { color: CHART_THEME.textColor }
    },
    yAxis: {
      type: 'value',
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      }
    },
    series: [{
      type: 'bar',
      data: [
        {
          value: data.budget,
          itemStyle: { color: '#6b7280' }
        },
        {
          value: data.spend,
          itemStyle: { 
            color: getUtilizationColor(utilization)
          }
        }
      ],
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => `${formatCurrency(params.value)}`,
        color: CHART_THEME.textColor
      }
    }]
  }
})

const currentMtdBudgetChart = computed(() => {
  if (!selectedLobBudgetData.value?.currentMtd) return {}
  
  const data = selectedLobBudgetData.value.currentMtd
  const now = new Date()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const daysPassed = now.getDate()
  const expectedSpend = (data.budget * daysPassed) / daysInMonth
  
  return {
    ...chartAnimationDefaults,
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      data: ['Expected MTD', 'Actual MTD', 'Monthly Budget'],
      axisLabel: { color: CHART_THEME.textColor, rotate: 45 }
    },
    yAxis: {
      type: 'value',
      axisLabel: { 
        color: CHART_THEME.textColor,
        formatter: (value: number) => `${formatCurrency(value)}`
      }
    },
    series: [{
      type: 'bar',
      data: [
        {
          value: expectedSpend,
          itemStyle: { color: '#6b7280' }
        },
        {
          value: data.spend,
          itemStyle: { 
            color: data.spend > expectedSpend ? '#f59e0b' : CHART_COLORS[1]
          }
        },
        {
          value: data.budget,
          itemStyle: { color: CHART_COLORS[0] }
        }
      ],
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => `${formatCurrency(params.value)}`,
        color: CHART_THEME.textColor
      }
    }]
  }
})

// Helpers

// Get display name for LOB (full name if available, otherwise code)
const getLobDisplayName = (lobCode: string) => {
  return lobFullNames.value[lobCode] || lobCode
}

// Handle LOB selection
const selectLob = (lobName: string) => {
  selectedLob.value = lobName
}

// Handle chart click events
const handleChartClick = (params: any) => {
  // Get the LOB name from the click event
  let lobName = ''
  
  if (params.componentType === 'series') {
    if (params.seriesType === 'bar') {
      // Bar chart click - name is in the data point
      lobName = params.data?.name || params.name
    } else if (params.seriesType === 'pie') {
      // Pie chart click
      lobName = params.name
    } else if (params.seriesType === 'line') {
      // Line chart click - series name is the LOB
      lobName = params.seriesName
    }
  }
  
  // If we found a LOB name, select it
  if (lobName && lobGroups.value.some(g => g.name === lobName)) {
    selectLob(lobName)
  }
}

// Load data on mount
onMounted(async () => {
  // Fetch both LOB names and organizational data
  await Promise.all([
    fetchLobFullNames(),
    fetchOrganizationalData()
  ])
})
</script>