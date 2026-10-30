/**
 * Composable for managing forecast data operations
 */

import { ref, computed } from 'vue'

const logger = createLogger('ForecastData')

export const useForecastData = () => {
  // State
  const forecastData = ref<any[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const hasData = computed(() => forecastData.value.length > 0)
  const totalForecastAmount = computed(() => 
    forecastData.value.reduce((sum, item) => sum + (item.forecastAmount || 0), 0)
  )

  /**
   * Upload forecast data to the database
   */
  const uploadForecastData = async (data: any[]) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch('/api/forecast/upload', {
        method: 'POST',
        body: {
          data,
          source: 'excel_upload',
          timestamp: new Date().toISOString()
        }
      })

      if (response.success) {
        // Refresh local data
        await fetchForecastData()
        return response
      } else {
        throw new Error(apiErrorMessage(response, 'Failed to upload forecast data'))
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to upload forecast data'
      logger.error('Forecast upload error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Fetch forecast data from the database
   */
  const fetchForecastData = async (options: {
    period?: string
    accountId?: string
    status?: string
  } = {}) => {
    isLoading.value = true
    error.value = null

    try {
      const query: any = {}
      if (options.period) query.period = options.period
      if (options.accountId) query.accountId = options.accountId
      if (options.status) query.status = options.status

      const response = await $fetch('/api/forecast/data', {
        query: {
          ...query,
          limit: 1000 // Fetch up to 1000 records
        }
      })

      if (response.success) {
        forecastData.value = response.data || []
        return response.data
      } else {
        throw new Error(apiErrorMessage(response, 'Failed to fetch forecast data'))
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to fetch forecast data'
      logger.error('Forecast fetch error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Delete forecast data
   */
  const deleteForecastData = async (ids: string[]) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch('/api/forecast/delete', {
        method: 'DELETE',
        body: { ids }
      })

      if (response.success) {
        // Remove deleted items from local state
        forecastData.value = forecastData.value.filter(item => !ids.includes(item.id))
        return response
      } else {
        throw new Error(apiErrorMessage(response, 'Failed to delete forecast data'))
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to delete forecast data'
      logger.error('Forecast delete error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Update forecast data
   */
  const updateForecastData = async (id: string, updates: Partial<any>) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await $fetch('/api/forecast/update', {
        method: 'PUT',
        body: {
          id,
          updates,
          timestamp: new Date().toISOString()
        }
      })

      if (response.success) {
        // Update local state
        const index = forecastData.value.findIndex(item => item.id === id)
        if (index !== -1) {
          forecastData.value[index] = { ...forecastData.value[index], ...updates }
        }
        return response
      } else {
        throw new Error(apiErrorMessage(response, 'Failed to update forecast data'))
      }
    } catch (err: any) {
      error.value = err.message || 'Failed to update forecast data'
      logger.error('Forecast update error:', err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get forecast data grouped by account
   */
  const getForecastByAccount = computed(() => {
    const grouped: Record<string, any[]> = {}
    
    forecastData.value.forEach(item => {
      const accountId = item.accountId
      if (!grouped[accountId]) {
        grouped[accountId] = []
      }
      grouped[accountId].push(item)
    })

    return grouped
  })

  /**
   * Get forecast data grouped by period
   */
  const getForecastByPeriod = computed(() => {
    const grouped: Record<string, any[]> = {}
    
    forecastData.value.forEach(item => {
      const period = item.period
      if (!grouped[period]) {
        grouped[period] = []
      }
      grouped[period].push(item)
    })

    return grouped
  })

  /**
   * Get total forecast amount for a specific account
   */
  const getAccountForecastTotal = (accountId: string) => {
    return forecastData.value
      .filter(item => item.accountId === accountId)
      .reduce((sum, item) => sum + (item.forecastAmount || 0), 0)
  }

  /**
   * Get total forecast amount for a specific period
   */
  const getPeriodForecastTotal = (period: string) => {
    return forecastData.value
      .filter(item => item.period === period)
      .reduce((sum, item) => sum + (item.forecastAmount || 0), 0)
  }

  /**
   * Clear all forecast data from local state
   */
  const clearData = () => {
    forecastData.value = []
    error.value = null
  }

  return {
    // State
    forecastData,
    isLoading,
    error,
    
    // Computed
    hasData,
    totalForecastAmount,
    getForecastByAccount,
    getForecastByPeriod,
    
    // Methods
    uploadForecastData,
    fetchForecastData,
    deleteForecastData,
    updateForecastData,
    getAccountForecastTotal,
    getPeriodForecastTotal,
    clearData
  }
}
