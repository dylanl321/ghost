/**
 * Proforma vs Billable Export Composable
 * Fetches both proforma and billable cost data for comparison reporting
 */

import { ref } from 'vue'

export interface ProformaBillableData {
  accountId: string
  accountName: string
  lob: string
  department: string
  // 2025 data (actuals)
  billable2025: number
  proforma2025: number
  savings2025: number
  savingsPercent2025: number
  // 2026 data (forecast)
  billable2026: number
  proforma2026: number
  savings2026: number
  savingsPercent2026: number
  // Monthly breakdowns
  monthlyData: {
    month: string // Format: YYYY-MM
    billable: number
    proforma: number
    savings: number
    savingsPercent: number
  }[]
}

export function useProformaBillableExport() {
  const isExporting = ref(false)
  const exportError = ref<string | null>(null)

  /**
   * Main export function: fetch proforma vs billable data using the dedicated API
   */
  async function fetchProformaBillableData(): Promise<ProformaBillableData[]> {
    isExporting.value = true
    exportError.value = null

    try {
      // Call the new API endpoint that handles all data fetching
      const currentYear = new Date().getFullYear()
      const historicalYear = currentYear - 1
      const forecastYear = currentYear
      
      const response = await $fetch('/api/costs/proforma-billable-comparison', {
        params: {
          proforma: true,
          historicalYear,
          forecastYear,
          includeDecommissioned: false
        }
      })

      const apiData = (response as any)?.data || response

      // Transform API response to ProformaBillableData format
      const transformedData: ProformaBillableData[] = apiData.accounts.map((account: any) => {
        // Combine monthly data from historical and forecast
        const monthlyDataMap = new Map<string, { billable: number; proforma: number }>()

        // Add historical monthly data (2025)
        account.historical.billable.monthlyBreakdown.forEach((m: any) => {
          if (!monthlyDataMap.has(m.month)) {
            monthlyDataMap.set(m.month, { billable: 0, proforma: 0 })
          }
          monthlyDataMap.get(m.month)!.billable = m.cost
        })

        account.historical.proforma.monthlyBreakdown.forEach((m: any) => {
          if (!monthlyDataMap.has(m.month)) {
            monthlyDataMap.set(m.month, { billable: 0, proforma: 0 })
          }
          monthlyDataMap.get(m.month)!.proforma = m.cost
        })

        // Add forecast monthly data (2026)
        account.forecast.billable.monthlyBreakdown.forEach((m: any) => {
          if (!monthlyDataMap.has(m.month)) {
            monthlyDataMap.set(m.month, { billable: 0, proforma: 0 })
          }
          monthlyDataMap.get(m.month)!.billable = m.cost
        })

        account.forecast.proforma.monthlyBreakdown.forEach((m: any) => {
          if (!monthlyDataMap.has(m.month)) {
            monthlyDataMap.set(m.month, { billable: 0, proforma: 0 })
          }
          monthlyDataMap.get(m.month)!.proforma = m.cost
        })

        // Convert to array and calculate savings
        const monthlyData = Array.from(monthlyDataMap.entries())
          .map(([month, data]) => ({
            month,
            billable: data.billable,
            proforma: data.proforma,
            savings: data.billable - data.proforma,
            savingsPercent: data.billable > 0
              ? ((data.billable - data.proforma) / data.billable) * 100
              : 0
          }))
          .sort((a, b) => a.month.localeCompare(b.month))

        return {
          accountId: account.accountId,
          accountName: account.accountName,
          lob: account.lob,
          department: account.department,
          billable2025: account.historical.billable.yearTotal,
          proforma2025: account.historical.proforma.yearTotal,
          savings2025: account.historical.savings.yearTotal,
          savingsPercent2025: account.historical.savings.savingsPercent,
          billable2026: account.forecast.billable.yearTotal,
          proforma2026: account.forecast.proforma.yearTotal,
          savings2026: account.forecast.savings.yearTotal,
          savingsPercent2026: account.forecast.savings.savingsPercent,
          monthlyData
        }
      })

      return transformedData
    } catch (error: any) {
      exportError.value = error?.message || 'Failed to fetch proforma vs billable data'
      throw error
    } finally {
      isExporting.value = false
    }
  }

  return {
    isExporting,
    exportError,
    fetchProformaBillableData
  }
}
