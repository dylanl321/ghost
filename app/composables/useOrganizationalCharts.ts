import { computed } from 'vue'
import type { Ref } from 'vue'
import type { ChartDefinition } from './useChartRegistry'

interface UseOrganizationalChartsOptions {
  timeframe: Ref<string>
  includeHistorical?: boolean
}

export const useOrganizationalCharts = (options: UseOrganizationalChartsOptions) => {
  const { timeframe, includeHistorical = true } = options

  // Define organizational-specific chart IDs
  const organizationalChartIds = computed(() => {
    const baseCharts = [
      'lobComparison',                // LOB comparison bar chart
      'departmentComparison',         // Department breakdown treemap
      'topSpenders',                  // Highest cost accounts
      'serviceCostDistribution',      // Service cost treemap
      'departmentBudgetPerformance'  // Department budget gauges
    ]

    // Add trend charts if we have historical data
    if (includeHistorical && isHistoricalTimeframe(timeframe.value)) {
      return [
        'lobTrendComparison',          // LOB trends over time
        'departmentTrendComparison',   // Department trends over time
        ...baseCharts
      ]
    }

    return baseCharts
  })

  // Define trend/historical chart IDs
  const trendChartIds = computed(() => {
    return [
      'historicalMonthlyTrend',       // Monthly breakdown
      'yearOverYearComparison',       // Year comparison
      'costGrowthRate',               // Growth analysis
      'monthlyHeatmap',               // Monthly patterns
      'budgetVarianceAnalysis',       // Budget variance
      'forecastGauge'                 // Forecast
    ]
  })

  // Helper to check if timeframe is historical
  const isHistoricalTimeframe = (tf: string): boolean => {
    const historicalPeriods = [
      'lastMonth', 'lastQuarter', 'lastYear', 
      'last30days', 'last90days', 'ytd', 'last12months'
    ]
    return historicalPeriods.includes(tf)
  }

  return {
    organizationalChartIds,
    trendChartIds,
    isHistoricalTimeframe
  }
}