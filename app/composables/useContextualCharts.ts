import { ref, computed } from 'vue'
import type { Ref } from 'vue'

const logger = createLogger('ContextualCharts')

interface ContextualChartData {
  [chartId: string]: any
}

export const useContextualCharts = (selectedAccounts: Ref<string[]>) => {
  const contextualData = ref<ContextualChartData>({})
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const buildAccountsParam = () => {
    return selectedAccounts.value.length > 0 ? selectedAccounts.value.join(',') : ''
  }

  // Fetch year-over-year comparison (last 2 calendar years)
  const fetchYearOverYear = async () => {
    const accountsParam = buildAccountsParam()
    const params = new URLSearchParams()
    
    // Get last 2 calendar years
    const currentYear = new Date().getFullYear()
    const lastYear = currentYear - 1
    
    params.set('period', 'lastYear')
    if (accountsParam) params.set('accountIds', accountsParam)
    
    try {
      // Fetch last year data
      const lastYearResponse = await $fetch(`/api/costs/historical?${params.toString()}`)
      
      // Fetch this year (YTD) data  
      params.set('period', 'ytd')
      const thisYearResponse = await $fetch(`/api/costs/historical?${params.toString()}`)
      
      // Process and combine data
      const lastYearData = (lastYearResponse as any)?.data?.monthlyBreakdown || []
      const thisYearData = (thisYearResponse as any)?.data?.monthlyBreakdown || []
      
      // Create year-over-year structure
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                         'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      
      const lastYearSeries = Array(12).fill(0)
      const thisYearSeries = Array(12).fill(0)
      
      // Map last year data
      lastYearData.forEach((month: any) => {
        const [, monthNum] = month.month.split('-')
        const monthIndex = parseInt(monthNum) - 1
        lastYearSeries[monthIndex] = month.cost
      })
      
      // Map this year data  
      thisYearData.forEach((month: any) => {
        const [, monthNum] = month.month.split('-')
        const monthIndex = parseInt(monthNum) - 1
        thisYearSeries[monthIndex] = month.cost
      })
      
      return {
        dates: monthNames,
        series: [
          {
            name: lastYear.toString(),
            values: lastYearSeries,
            total: lastYearSeries.reduce((sum, val) => sum + val, 0)
          },
          {
            name: currentYear.toString(), 
            values: thisYearSeries,
            total: thisYearSeries.reduce((sum, val) => sum + val, 0)
          }
        ]
      }
    } catch (e: any) {
      logger.error('Error fetching year-over-year data:', e)
      throw e
    }
  }

  // Fetch month-over-month comparison
  const fetchMonthOverMonth = async () => {
    const accountsParam = buildAccountsParam()
    
    try {
      // Fetch this month
      const thisMonthParams = new URLSearchParams()
      thisMonthParams.set('period', 'thisMonth')
      if (accountsParam) thisMonthParams.set('accountIds', accountsParam)
      
      // Fetch last month
      const lastMonthParams = new URLSearchParams()  
      lastMonthParams.set('period', 'lastMonth')
      if (accountsParam) lastMonthParams.set('accountIds', accountsParam)
      
      const [thisMonthResponse, lastMonthResponse] = await Promise.all([
        $fetch(`/api/costs/historical?${thisMonthParams.toString()}`),
        $fetch(`/api/costs/historical?${lastMonthParams.toString()}`)
      ])
      
      const thisMonthData = (thisMonthResponse as any)?.data
      const lastMonthData = (lastMonthResponse as any)?.data
      
      return [
        {
          name: 'Last Month',
          value: lastMonthData?.totalCost || 0,
          formattedValue: lastMonthData?.totalCostFormatted || '$0.00'
        },
        {
          name: 'This Month',
          value: thisMonthData?.totalCost || 0,
          formattedValue: thisMonthData?.totalCostFormatted || '$0.00'
        }
      ]
    } catch (e: any) {
      logger.error('Error fetching month-over-month data:', e)
      throw e
    }
  }

  // Fetch 24-month trend
  const fetchLast24Months = async () => {
    const accountsParam = buildAccountsParam()
    const params = new URLSearchParams()
    params.set('period', 'last12months')
    if (accountsParam) params.set('accountIds', accountsParam)
    
    try {
      const response = await $fetch(`/api/costs/historical?${params.toString()}`)
      const data = (response as any)?.data?.monthlyBreakdown || []
      
      // Format for line chart
      const dates: string[] = []
      const values: number[] = []
      
      data.forEach((month: any) => {
        const [year, monthNum] = month.month.split('-')
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                           'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const monthName = monthNames[parseInt(monthNum) - 1]
        const shortYear = year.substring(2)
        
        dates.push(`${monthName} '${shortYear}`)
        values.push(month.cost)
      })
      
      return {
        dates,
        series: [{
          name: 'Monthly Costs',
          dates,
          values,
          total: values.reduce((sum, val) => sum + val, 0)
        }]
      }
    } catch (e: any) {
      logger.error('Error fetching 24-month trend:', e)
      throw e
    }
  }

  // Main fetch function
  const fetchContextualData = async (chartId: string) => {
    if (contextualData.value[chartId]) return contextualData.value[chartId]
    
    isLoading.value = true
    error.value = null
    
    try {
      let data
      
      switch (chartId) {
        case 'yearOverYearComparison':
          data = await fetchYearOverYear()
          break
        case 'monthOverMonthComparison':
          data = await fetchMonthOverMonth()
          break
        case 'last24MonthsTrend':
          data = await fetchLast24Months()
          break
        default:
          throw new Error(`Unknown contextual chart: ${chartId}`)
      }
      
      contextualData.value[chartId] = data
      return data
    } catch (e: any) {
      error.value = e.message || 'Failed to fetch contextual chart data'
      return null
    } finally {
      isLoading.value = false
    }
  }

  return {
    contextualData: computed(() => contextualData.value),
    isLoading: computed(() => isLoading.value),
    error: computed(() => error.value),
    fetchContextualData
  }
}