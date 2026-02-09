/**
 * BOM Export Composable
 * Generates forward-looking 12-month forecast BOM exports
 */

import type { NormalizedDataset } from '~/types/costs'
import type { AccountBomData } from '#shared/utils/bom-sheet-builder'
import { exportSingleBom, exportMultipleBoms } from '~/utils/export/bom-xlsx-writer'

export const useBomExport = (dataset: NormalizedDataset) => {
  const route = useRoute()

  /**
   * Fetches 12-month forecast starting from current month
   * Includes current month remainder + next 11 months
   * Fills any missing months with average of available data
   */
  async function fetch12MonthForecast(accountId: string): Promise<{ costs: number[], monthLabels: string[] }> {
    const costs: number[] = Array(12).fill(0)
    const today = new Date()
    const currentMonth = today.getMonth() // 0-11
    const currentYear = today.getFullYear()

    // Generate month labels for the next 12 months starting from current month
    const monthLabels: string[] = []
    for (let i = 0; i < 12; i++) {
      const date = new Date(currentYear, currentMonth + i, 1)
      const year = date.getFullYear()
      const month = date.getMonth()
      monthLabels.push(`${year}-${String(month + 1).padStart(2, '0')}`)
    }

    const params = new URLSearchParams()
    params.set('period', '12-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(dataset.mode === 'proforma'))
    params.set('accountIds', accountId)

    try {
      // Fetch 12-month forecast (starts from first of next month)
      const response: any = await globalThis.$fetch(`/api/costs/forecast?${params.toString()}`)
      const results = response?.data?.forecast?.forecastResultsByTime || []

      // Also fetch current month remainder
      const currentMonthParams = new URLSearchParams()
      currentMonthParams.set('period', 'current-month-remainder')
      currentMonthParams.set('granularity', 'MONTHLY')
      currentMonthParams.set('proforma', String(dataset.mode === 'proforma'))
      currentMonthParams.set('accountIds', accountId)

      const currentMonthResponse: any = await globalThis.$fetch(`/api/costs/forecast?${currentMonthParams.toString()}`)
      const currentMonthResults = currentMonthResponse?.data?.forecast?.forecastResultsByTime || []

      // Add current month remainder to position 0
      if (currentMonthResults.length > 0) {
        const currentMonthCost = parseFloat(currentMonthResults[0]?.MeanValue || currentMonthResults[0]?.meanValue || '0')
        costs[0] = Math.round(currentMonthCost)
      }

      // Process 12-month forecast results (positions 1-11)
      results.forEach((result: any, index: number) => {
        const timePeriod = result.TimePeriod || result.timePeriod
        if (!timePeriod) return
        const start = timePeriod.Start || timePeriod.start
        if (!start) return

        const meanValue = parseFloat(result.MeanValue || result.meanValue || '0')

        // Find which position this forecast period belongs to in our 12-month array
        const periodMonth = start.substring(0, 7) // YYYY-MM format
        const labelIndex = monthLabels.indexOf(periodMonth)

        if (labelIndex >= 0 && labelIndex < 12) {
          // Add to existing value (for current month) or set new value
          costs[labelIndex] = Math.round((costs[labelIndex] || 0) + meanValue)
        }
      })

      // Fill any missing months with average of available data
      const nonZeroMonths = costs.filter(cost => cost > 0)
      if (nonZeroMonths.length > 0) {
        const average = Math.round(nonZeroMonths.reduce((sum, cost) => sum + cost, 0) / nonZeroMonths.length)

        for (let i = 0; i < 12; i++) {
          if (costs[i] === 0) {
            costs[i] = average
          }
        }
      }
    } catch (error) {
      console.error('BOM Export: Failed to fetch forecast data:', error)
    }

    return { costs, monthLabels }
  }

  /**
   * Generates a permanent, predictable URL for a specific account
   * Format: /account/costs?account={accountId}
   * This provides a clean, stable, permanent link for this account
   */
  function generateAccountPermanentLink(accountId: string): string {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
    // Use clean 'account' (singular) parameter for single account links
    return `${baseUrl}/account/costs?account=${accountId}`
  }

  /**
   * Prepares BOM data for a single account
   */
  async function prepareBomData(accountId: string): Promise<AccountBomData> {
    // Find account metadata
    const account = dataset.accountsList?.find(acc => acc.accountId === accountId)
    const accountName = account?.accountName || account?.projectName || accountId

    // Fetch 12-month forecast
    const { costs, monthLabels } = await fetch12MonthForecast(accountId)

    // Generate permanent link
    const permanentLink = generateAccountPermanentLink(accountId)

    // Use real request ID from metadata when available; else fallback
    const requestId = (account?.requestID || account?.requestId || accountId.substring(0, 8)).toString().toUpperCase()

    // Get generation date
    const generationDate = new Date().toISOString().split('T')[0] // YYYY-MM-DD format

    return {
      accountId,
      accountName,
      requestId,
      monthlyCosts: costs,
      monthLabels,
      shortLink: permanentLink,
      generationDate
    }
  }

  /**
   * Exports BOM for selected accounts
   */
  async function exportBom(): Promise<void> {
    const selectedAccounts = dataset.accounts

    if (!selectedAccounts || selectedAccounts.length === 0) {
      console.error('No accounts selected for export')
      throw new Error('Please select at least one account to export')
    }

    try {
      if (selectedAccounts.length === 1) {
        // Single account export
        const bomData = await prepareBomData(selectedAccounts[0])
        await exportSingleBom(bomData)
      } else {
        // Multiple accounts export (ZIP)
        const bomDataArray = await Promise.all(
          selectedAccounts.map(accountId => prepareBomData(accountId))
        )
        await exportMultipleBoms(bomDataArray)
      }
    } catch (error) {
      console.error('BOM export failed:', error)
      throw error
    }
  }

  return {
    exportBom
  }
}
