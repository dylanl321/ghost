// Simplified cost data fetching for faster loading

export const useSimpleCostData = () => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Fetch just historical data for quick loading
  const fetchBasicCostData = async (period: string) => {
    loading.value = true
    error.value = null
    
    try {
      const historical = await $fetch('/api/costs/historical', {
        params: { period },
        timeout: 10000 // 10 second timeout
      })
      
      if (!historical?.data) {
        throw new Error('No historical data available')
      }
      
      // Return minimal data structure for charts
      return {
        total: historical.data.total || 0,
        daily: historical.data.daily || [],
        changePercent: historical.data.changePercent || 0,
        hasHistoricalData: !!(historical.data.daily && historical.data.daily.length > 0),
        hasBudgetData: false,
        hasAnomalies: false,
        hasForecast: false,
        accounts: [],
        services: [],
        anomalies: [],
        forecast: []
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch cost data'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  return {
    loading: readonly(loading),
    error: readonly(error),
    fetchBasicCostData
  }
}