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

    <!-- Historical Charts -->
    <div v-else class="space-y-6">
      <!-- Organization-wide 2-Year Trend -->
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-gray-200 mb-4">Organization-Wide 2-Year Cost Trend</h3>
        <v-chart :option="orgTrendChart" :autoresize="true" style="height: 400px" />
      </div>

      <!-- Year-over-Year Comparison -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">Year-over-Year Comparison</h3>
          <v-chart :option="yoyComparisonChart" :autoresize="true" style="height: 350px" />
        </div>
        
        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <h3 class="text-lg font-semibold text-gray-200 mb-4">Monthly Growth Rate</h3>
          <v-chart :option="growthRateChart" :autoresize="true" style="height: 350px" />
        </div>
      </div>

      <!-- Quarterly Breakdown -->
      <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
        <h3 class="text-lg font-semibold text-gray-200 mb-4">Quarterly Spending Analysis</h3>
        <v-chart :option="quarterlyChart" :autoresize="true" style="height: 350px" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'

// State
const loading = ref(true)
const error = ref<string | null>(null)
const historicalData = ref<any>(null)

// Fetch historical data
const fetchHistoricalData = async () => {
  loading.value = true
  error.value = null
  
  try {
    // Fetch 2 years of historical data
    const response = await $fetch('/api/costs/historical', {
      params: {
        period: 'last24months',
        groupBy: 'MONTHLY'
      }
    })
    
    historicalData.value = (response as any).data || response || {}
    console.log('Historical data loaded:', historicalData.value)
  } catch (err: any) {
    console.error('Error fetching historical data:', err)
    error.value = err.message || 'Failed to load historical data'
  } finally {
    loading.value = false
  }
}

// Helper to format currency
const formatCurrency = (value: number) => {
  if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`
  if (value >= 1000) return `${(value / 1000).toFixed(2)}K`
  return value.toFixed(2)
}

// Generate month labels for charts
const generateMonthLabels = (count: number) => {
  const months: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
  }
  return months
}

// Organization-wide 2-year trend chart
const orgTrendChart = computed(() => {
  const months = generateMonthLabels(24)
  
  // Generate sample data with realistic growth pattern
  const generateOrgData = () => {
    const baseValue = 500000 // $500K base monthly spend
    return months.map((_, i) => {
      const growthFactor = 1 + (i / 24) * 0.35 // 35% growth over 2 years
      const seasonalVariation = Math.sin((i % 12) * 0.524) * baseValue * 0.1 // Seasonal variation
      const randomVariation = (Math.random() - 0.5) * baseValue * 0.05 // Random variation
      return Math.max(0, baseValue * growthFactor + seasonalVariation + randomVariation)
    })
  }
  
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        return `${params[0].axisValue}<br/>Total Spend: $${formatCurrency(params[0].value)}`
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
        formatter: (value: number) => `$${formatCurrency(value)}`
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
      data: generateOrgData(),
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
  const currentYear = new Date().getFullYear()
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  
  // Generate sample data for two years
  const lastYearData = months.map((_, i) => 400000 + Math.random() * 100000)
  const thisYearData = months.map((_, i) => 500000 + Math.random() * 150000)
  
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        let result = params[0].axisValue + '<br/>'
        params.forEach((item: any) => {
          result += `${item.marker} ${item.seriesName}: $${formatCurrency(item.value)}<br/>`
        })
        return result
      }
    },
    legend: {
      data: [`${currentYear - 1}`, `${currentYear}`],
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
        formatter: (value: number) => `$${formatCurrency(value)}`
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
        name: `${currentYear - 1}`,
        type: 'bar',
        data: lastYearData,
        itemStyle: { color: 'rgba(107, 114, 128, 0.8)' }
      },
      {
        name: `${currentYear}`,
        type: 'bar',
        data: thisYearData,
        itemStyle: { color: '#3b82f6' }
      }
    ]
  }
})

// Monthly growth rate chart
const growthRateChart = computed(() => {
  const months = generateMonthLabels(12)
  
  // Generate growth rate data (percentage change month-over-month)
  const growthRates = months.map((_, i) => {
    const baseRate = 2.5 // Average 2.5% monthly growth
    const variation = (Math.random() - 0.5) * 5 // +/- 2.5% variation
    return baseRate + variation
  })
  
  return {
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
        formatter: '{value}%'
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
        formatter: '{c}%',
        color: '#9ca3af',
        fontSize: 10
      }
    }]
  }
})

// Quarterly breakdown chart
const quarterlyChart = computed(() => {
  const currentYear = new Date().getFullYear()
  const quarters = [
    `Q1 ${currentYear - 1}`, `Q2 ${currentYear - 1}`, `Q3 ${currentYear - 1}`, `Q4 ${currentYear - 1}`,
    `Q1 ${currentYear}`, `Q2 ${currentYear}`, `Q3 ${currentYear}`, `Q4 ${currentYear}`
  ]
  
  // Generate quarterly data
  const quarterlyData = quarters.map((_, i) => 1500000 + i * 100000 + Math.random() * 200000)
  
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        return `${params[0].name}<br/>Total: $${formatCurrency(params[0].value)}`
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
        formatter: (value: number) => `$${formatCurrency(value)}`
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
          color: i >= 4 ? '#3b82f6' : 'rgba(107, 114, 128, 0.6)'
        }
      })),
      label: {
        show: true,
        position: 'top',
        formatter: (params: any) => `$${formatCurrency(params.value)}`,
        color: '#9ca3af',
        fontSize: 10
      }
    }]
  }
})

// Load data on mount
onMounted(() => {
  fetchHistoricalData()
})
</script>