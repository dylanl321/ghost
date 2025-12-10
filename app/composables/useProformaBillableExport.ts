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
   * Fetch cost data for a specific mode and time period
   */
  async function fetchCostsForMode(mode: 'billable' | 'proforma', year: number) {
    const params = new URLSearchParams()

    // Fetch full year data
    if (year === new Date().getFullYear()) {
      // Current year: YTD actuals + forecast for remaining months
      params.set('period', 'ytd')
    } else {
      // Future year: all forecast
      params.set('period', 'custom')
      params.set('startDate', `${year}-01-01`)
      params.set('endDate', `${year}-12-31`)
    }

    params.set('proforma', String(mode === 'proforma'))
    params.set('groupBy', 'LINKED_ACCOUNT')
    params.set('enhanced', 'true')

    return await $fetch(`/api/costs/summary?${params}`)
  }

  /**
   * Fetch historical monthly data for an entire year
   * Note: For future years (2026), we'll use forecast data instead
   */
  async function fetchMonthlyData(mode: 'billable' | 'proforma', year: number) {
    const params = new URLSearchParams()
    const currentYear = new Date().getFullYear()

    if (year === currentYear) {
      // For current year, get last 12 months of historical
      params.set('period', 'last12months')
      params.set('proforma', String(mode === 'proforma'))
      params.set('groupBy', 'LINKED_ACCOUNT')
      return await $fetch(`/api/costs/historical?${params}`)
    } else {
      // For future years, we'll use forecast data (no historical endpoint exists)
      // Return null and we'll build monthly breakdown from year-end forecast instead
      return null
    }
  }

  /**
   * Fetch org-wide year-end forecast
   * AWS Forecast API doesn't support GroupBy, so we get org-wide total
   */
  async function fetchOrgWideForecast(mode: 'billable' | 'proforma', year: number) {
    const params = new URLSearchParams()
    params.set('period', '12-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(mode === 'proforma'))

    return await $fetch(`/api/costs/forecast?${params}`)
  }

  /**
   * Get account metadata (LOB, Department) from accounts list
   */
  function getAccountMetadata(accountId: string, accountsList: any[]) {
    const account = accountsList.find(
      (acc: any) =>
        acc.accountId === accountId ||
        acc.awsStandardAccountID === accountId ||
        acc.awsCommercialAccountID === accountId
    )

    if (!account) {
      return {
        accountName: accountId,
        lob: '',
        department: ''
      }
    }

    return {
      accountName: account.accountName || account.projectName || account.name || accountId,
      lob: account.linesOfBusiness || account.lineOfBusiness || account.lob || '',
      department: account.departmentNumber || account.department || account.dept || ''
    }
  }

  /**
   * Main export function: fetch proforma vs billable data using new API
   */
  async function fetchProformaBillableData(): Promise<ProformaBillableData[]> {
    isExporting.value = true
    exportError.value = null

    try {
      console.log('DEBUG: Fetching data from new API endpoint...')

      // Call the new API endpoint that handles all data fetching
      const response = await $fetch('/api/costs/proforma-billable-comparison', {
        params: {
          proforma: true,
          historicalYear: 2025,
          forecastYear: 2026,
          includeDecommissioned: false
        }
      })

      const apiData = (response as any)?.data || response

      console.log('DEBUG: API response received:', {
        accountsCount: apiData?.accounts?.length,
        totals: apiData?.totals,
        forecastResults: apiData?.metadata?.forecastResults
      })

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

      console.log('DEBUG: Transformation complete:', {
        accountsProcessed: transformedData.length,
        sample: transformedData[0]
      })

      return transformedData
    } catch (error: any) {
      exportError.value = error?.message || 'Failed to fetch proforma vs billable data'
      throw error
    } finally {
      isExporting.value = false
    }
  }

  /**
   * DEPRECATED - Old implementation kept for reference
   * This function is no longer used but kept for backwards compatibility
   */
  async function fetchProformaBillableDataOld(): Promise<ProformaBillableData[]> {
    isExporting.value = true
    exportError.value = null

    try {
      const currentYear = new Date().getFullYear()
      const year2025 = 2025
      const year2026 = 2026

      // Fetch all accounts list for metadata
      const accountsListResponse = await $fetch('/api/accounts/list')
      const accountsList = (accountsListResponse as any)?.data || []

      // Fetch 2025 data (both modes)
      const [billable2025Response, proforma2025Response] = await Promise.all([
        fetchCostsForMode('billable', year2025),
        fetchCostsForMode('proforma', year2025)
      ])

      // Fetch 2026 org-wide forecast data (both modes)
      const [billable2026Response, proforma2026Response] = await Promise.all([
        fetchOrgWideForecast('billable', year2026),
        fetchOrgWideForecast('proforma', year2026)
      ])

      // Fetch monthly breakdowns for 2025 (2026 will come from forecast data)
      const [
        billableMonthly2025,
        proformaMonthly2025
      ] = await Promise.all([
        fetchMonthlyData('billable', year2025),
        fetchMonthlyData('proforma', year2025)
      ])

      // Extract account costs from responses
      // When proforma=true with enhanced mode, API returns { billable: {...}, proforma: {...} }
      // When proforma=false with enhanced mode, API returns accounts directly
      const billable2025Raw = (billable2025Response as any)?.data || billable2025Response
      const proforma2025Raw = (proforma2025Response as any)?.data || proforma2025Response

      console.log('DEBUG: billable2025Raw structure:', {
        hasData: !!billable2025Raw,
        hasAccounts: !!billable2025Raw?.accounts,
        accountsCount: billable2025Raw?.accounts?.length,
        keys: Object.keys(billable2025Raw || {})
      })

      console.log('DEBUG: proforma2025Raw structure:', {
        hasData: !!proforma2025Raw,
        hasProformaKey: !!proforma2025Raw?.proforma,
        hasAccounts: !!proforma2025Raw?.accounts,
        hasProformaAccounts: !!proforma2025Raw?.proforma?.accounts,
        keys: Object.keys(proforma2025Raw || {}),
        proformaKeys: Object.keys(proforma2025Raw?.proforma || {})
      })

      // For proforma API calls, the structure is: { billable: {...}, proforma: {...}, comparison, validation }
      const billable2025Data = billable2025Raw
      const proforma2025Data = proforma2025Raw?.proforma || proforma2025Raw // Get proforma nested object

      console.log('DEBUG: Extracted proforma2025Data:', {
        hasAccounts: !!proforma2025Data?.accounts,
        accountsCount: proforma2025Data?.accounts?.length,
        keys: Object.keys(proforma2025Data || {})
      })

      // Extract 2026 forecast data
      const billable2026Raw = (billable2026Response as any)?.data || billable2026Response
      const proforma2026Raw = (proforma2026Response as any)?.data || proforma2026Response

      const billable2026Data = billable2026Raw?.forecast
      const proforma2026Data = proforma2026Raw?.forecast

      console.log('DEBUG: Received 2026 forecasts:', {
        billableTotal: billable2026Data?.total?.Amount,
        proformaTotal: proforma2026Data?.total?.Amount,
        billablePeriods: billable2026Data?.forecastResultsByTime?.length,
        proformaPeriods: proforma2026Data?.forecastResultsByTime?.length
      })

      // Build account map for 2025
      const accountMap = new Map<string, ProformaBillableData>()

      // Process 2025 billable accounts
      const billable2025Accounts = billable2025Data?.accounts || []
      billable2025Accounts.forEach((acc: any) => {
        const metadata = getAccountMetadata(acc.accountId, accountsList)
        accountMap.set(acc.accountId, {
          accountId: acc.accountId,
          accountName: metadata.accountName,
          lob: metadata.lob,
          department: metadata.department,
          billable2025: acc.totalCost || 0,
          proforma2025: 0,
          savings2025: 0,
          savingsPercent2025: 0,
          billable2026: 0,
          proforma2026: 0,
          savings2026: 0,
          savingsPercent2026: 0,
          monthlyData: []
        })
      })

      // Process 2025 proforma accounts
      const proforma2025Accounts = proforma2025Data?.proforma?.accounts || proforma2025Data?.accounts || []
      proforma2025Accounts.forEach((acc: any) => {
        const existing = accountMap.get(acc.accountId)
        if (existing) {
          existing.proforma2025 = acc.totalCost || 0
        } else {
          const metadata = getAccountMetadata(acc.accountId, accountsList)
          accountMap.set(acc.accountId, {
            accountId: acc.accountId,
            accountName: metadata.accountName,
            lob: metadata.lob,
            department: metadata.department,
            billable2025: 0,
            proforma2025: acc.totalCost || 0,
            savings2025: 0,
            savingsPercent2025: 0,
            billable2026: 0,
            proforma2026: 0,
            savings2026: 0,
            savingsPercent2026: 0,
            monthlyData: []
          })
        }
      })

      // Process 2026 forecast data (org-wide, distributed proportionally)
      // Calculate total 2025 costs for proportional distribution
      const total2025Billable = Array.from(accountMap.values())
        .reduce((sum, acc) => sum + acc.billable2025, 0)
      const total2025Proforma = Array.from(accountMap.values())
        .reduce((sum, acc) => sum + acc.proforma2025, 0)

      // Get 2026 org-wide forecast totals
      const billable2026Total = parseFloat(billable2026Data?.total?.Amount || '0')
      const proforma2026Total = parseFloat(proforma2026Data?.total?.Amount || '0')

      console.log('DEBUG: Distribution calculations:', {
        total2025Billable,
        total2025Proforma,
        billable2026Total,
        proforma2026Total,
        accountsInMap: accountMap.size
      })

      // Distribute 2026 forecast proportionally based on 2025 costs
      accountMap.forEach((account) => {
        if (total2025Billable > 0) {
          const billableRatio = account.billable2025 / total2025Billable
          account.billable2026 = billable2026Total * billableRatio
        }

        if (total2025Proforma > 0) {
          const proformaRatio = account.proforma2025 / total2025Proforma
          account.proforma2026 = proforma2026Total * proformaRatio
        }
      })

      // Calculate savings for each account
      accountMap.forEach((account) => {
        // 2025 savings
        account.savings2025 = account.billable2025 - account.proforma2025
        account.savingsPercent2025 = account.billable2025 > 0
          ? (account.savings2025 / account.billable2025) * 100
          : 0

        // 2026 savings
        account.savings2026 = account.billable2026 - account.proforma2026
        account.savingsPercent2026 = account.billable2026 > 0
          ? (account.savings2026 / account.billable2026) * 100
          : 0
      })

      // Build monthly breakdown (combine 2025 and 2026)
      const monthlyDataMap = new Map<string, Map<string, { billable: number; proforma: number }>>()

      // Helper to process monthly data from historical API
      const processMonthlyBreakdown = (
        response: any,
        mode: 'billable' | 'proforma'
      ) => {
        // Historical API with proforma=true returns { billable: {...}, proforma: {...} }
        // Historical API with proforma=false returns data directly
        const rawData = response?.data || response

        let breakdown: any[] = []

        if (mode === 'proforma' && rawData?.proforma) {
          // When fetching proforma data, use the proforma nested object
          breakdown = rawData.proforma.monthlyBreakdown || []
        } else if (mode === 'billable' && rawData?.billable) {
          // When proforma API returns both, get billable from nested object
          breakdown = rawData.billable.monthlyBreakdown || []
        } else {
          // Fallback to direct access (for billable-only calls)
          breakdown = rawData?.monthlyBreakdown || []
        }

        breakdown.forEach((month: any) => {
          const monthKey = month.month // YYYY-MM format
          const accountBreakdown = month.accountBreakdown || []

          accountBreakdown.forEach((acc: any) => {
            if (!monthlyDataMap.has(acc.accountId)) {
              monthlyDataMap.set(acc.accountId, new Map())
            }

            const accountMonthly = monthlyDataMap.get(acc.accountId)!
            if (!accountMonthly.has(monthKey)) {
              accountMonthly.set(monthKey, { billable: 0, proforma: 0 })
            }

            const monthData = accountMonthly.get(monthKey)!
            if (mode === 'billable') {
              monthData.billable = acc.cost || 0
            } else {
              monthData.proforma = acc.cost || 0
            }
          })
        })
      }

      // Helper to process org-wide forecast into monthly breakdown (proportionally distributed)
      const processForecastMonthlyData = (
        forecastByTime: any[],
        mode: 'billable' | 'proforma',
        year: number
      ) => {
        const totalForMode = mode === 'billable' ? total2025Billable : total2025Proforma

        forecastByTime.forEach((period: any) => {
          const dateStr = period?.TimePeriod?.Start || ''
          if (!dateStr) return

          const date = new Date(dateStr)
          const periodYear = date.getFullYear()
          const periodMonth = String(date.getMonth() + 1).padStart(2, '0')
          const monthKey = `${periodYear}-${periodMonth}`

          // Only process months for the specified year
          if (periodYear !== year) return

          // Get the org-wide forecast for this month
          const monthTotal = parseFloat(period?.MeanValue || '0')

          // Distribute this month's total proportionally to all accounts
          accountMap.forEach((account, accountId) => {
            if (totalForMode === 0) return

            // Calculate this account's proportion based on 2025 costs
            const accountTotal2025 = mode === 'billable' ? account.billable2025 : account.proforma2025
            const proportion = accountTotal2025 / totalForMode
            const accountMonthAmount = monthTotal * proportion

            if (!monthlyDataMap.has(accountId)) {
              monthlyDataMap.set(accountId, new Map())
            }

            const accountMonthly = monthlyDataMap.get(accountId)!
            if (!accountMonthly.has(monthKey)) {
              accountMonthly.set(monthKey, { billable: 0, proforma: 0 })
            }

            const monthData = accountMonthly.get(monthKey)!
            if (mode === 'billable') {
              monthData.billable = accountMonthAmount
            } else {
              monthData.proforma = accountMonthAmount
            }
          })
        })
      }

      // Process 2025 monthly data (historical)
      processMonthlyBreakdown(billableMonthly2025, 'billable')
      processMonthlyBreakdown(proformaMonthly2025, 'proforma')

      // Process 2026 monthly data from org-wide forecasts (proportionally distributed)
      const billable2026ByTime = billable2026Data?.forecastResultsByTime || []
      const proforma2026ByTime = proforma2026Data?.forecastResultsByTime || []

      processForecastMonthlyData(billable2026ByTime, 'billable', year2026)
      processForecastMonthlyData(proforma2026ByTime, 'proforma', year2026)

      // Attach monthly data to accounts
      monthlyDataMap.forEach((monthlyMap, accountId) => {
        const account = accountMap.get(accountId)
        if (account) {
          account.monthlyData = Array.from(monthlyMap.entries())
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
        }
      })

      return Array.from(accountMap.values())
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
