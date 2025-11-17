/**
 * BOM Export Composable
 * Orchestrates BOM export logic including data transformation, short link generation, and file export
 */

import type { NormalizedDataset } from '~/types/costs'
import type { AccountBomData } from '#shared/utils/bom-sheet-builder'
import { exportSingleBom, exportMultipleBoms } from '~/utils/export/bom-xlsx-writer'

export const useBomExport = (dataset: NormalizedDataset) => {
  const route = useRoute()

  /**
   * Extracts monthly actuals for 2025 from historical dataset (AWS sourced)
   */
  function extractMonthlyActuals2025(accountId: string): number[] {
    const costs2025: number[] = Array(12).fill(0)

    console.log('BOM Export: Extracting costs for account:', accountId)
    console.log('BOM Export: Mode:', dataset.mode)

    // Get 2025 historical data from monthlyBreakdown (server-populated from AWS CE)
    const historicalSource = dataset.orgWideHistorical || dataset.historical
    const historicalData = (historicalSource as any)?.data || historicalSource
    const monthlyBreakdown = historicalData?.monthlyBreakdown || []

    console.log('BOM Export: Monthly breakdown entries:', monthlyBreakdown.length)

    // Extract 2025 per-account costs from monthlyBreakdown.accountBreakdown
    monthlyBreakdown.forEach((month: any) => {
      const monthStr = month.month // Format: "YYYY-MM"
      if (!monthStr) return

      const [year, monthNum] = monthStr.split('-').map(Number)

      if (year === 2025 && monthNum >= 1 && monthNum <= 12) {
        const monthIndex = monthNum - 1 // Convert to 0-indexed

        // Find cost for this specific account in accountBreakdown
        if (month.accountBreakdown && Array.isArray(month.accountBreakdown)) {
          const accountData = month.accountBreakdown.find((acc: any) => acc.accountId === accountId)
          if (accountData) {
            costs2025[monthIndex] = Math.round(accountData.cost || 0)
            console.log(`BOM Export: Found 2025-${monthNum.toString().padStart(2, '0')}: $${costs2025[monthIndex]}`)
          }
        }
      }
    })

    console.log('BOM Export: 2025 costs after historical:', costs2025)

    // Do not derive or copy values; leave missing months as zeros (AWS-only values)
    return costs2025
  }

  /**
   * Fetches per-account monthly forecast for 2026 directly from server API (AWS sourced)
   * No proportional scaling or derived calculations.
   */
  async function fetchAccountForecast2026(accountId: string): Promise<number[]> {
    const costs2026: number[] = Array(12).fill(0)

    const params = new URLSearchParams()
    params.set('period', '12-months')
    params.set('granularity', 'MONTHLY')
    params.set('proforma', String(dataset.mode === 'proforma'))
    params.set('accountIds', accountId)

    try {
      const response: any = await globalThis.$fetch(`/api/costs/forecast?${params.toString()}`)
      const results = response?.data?.forecast?.forecastResultsByTime || []
      console.log('BOM Export: Per-account forecast results count:', results.length)

      results.forEach((result: any) => {
        const timePeriod = result.TimePeriod || result.timePeriod
        if (!timePeriod) return
        const start = timePeriod.Start || timePeriod.start
        if (!start) return
        const startDate = new Date(start)
        const year = startDate.getFullYear()
        const monthIndex = startDate.getMonth() // 0-11
        if (year === 2026 && monthIndex >= 0 && monthIndex <= 11) {
          const meanValue = parseFloat(result.MeanValue || result.meanValue || '0')
          costs2026[monthIndex] = Math.round(meanValue || 0)
          console.log(`BOM Export: 2026-${(monthIndex + 1).toString().padStart(2, '0')}: $${costs2026[monthIndex]}`)
        }
      })
    } catch (error) {
      console.error('BOM Export: Failed to fetch per-account forecast:', error)
    }

    console.log('BOM Export: Final 2026 forecast costs:', costs2026)
    return costs2026
  }

  /**
   * Generates a short link for a specific account
   */
  async function generateAccountShortLink(accountId: string): Promise<string> {
    try {
      // Use global $fetch instead of destructured from useNuxtApp()
      const response: any = await globalThis.$fetch('/api/shortlinks', {
        method: 'POST',
        body: {
          originalUrl: route.fullPath,
          pagePath: '/account/costs',
          configData: {
            selectedAccounts: [accountId],
            timeframe: dataset.timeframe,
            view: 'overview',
            tab: 'all',
            dataMode: dataset.mode
          },
          description: `BOM Export - Account ${accountId}`,
          expiresInDays: 365 // BOM links should last a full year
        }
      })

      return response.data.shortUrl
    } catch (error) {
      console.error('Failed to generate short link:', error)
      // Fallback to direct URL with account filter
      const baseUrl = window.location.origin
      return `${baseUrl}/account/costs?accounts=${encodeURIComponent(JSON.stringify([accountId]))}&mode=${dataset.mode}`
    }
  }

  /**
   * Prepares BOM data for a single account
   */
  async function prepareBomData(accountId: string): Promise<AccountBomData> {
    // Find account metadata
    const account = dataset.accountsList?.find(acc => acc.accountId === accountId)
    const accountName = account?.accountName || account?.projectName || accountId

    // Extract monthly actuals (2025) from historical
    const costs2025 = extractMonthlyActuals2025(accountId)

    // Fetch per-account forecast (2026) from server (AWS sourced)
    const costs2026 = await fetchAccountForecast2026(accountId)

    // Generate short link
    const shortLink = await generateAccountShortLink(accountId)

    // Use real request ID from metadata when available; else fallback
    const requestId = (account?.requestID || account?.requestId || accountId.substring(0, 8)).toString().toUpperCase()

    return {
      accountId,
      accountName,
      requestId,
      costs2025,
      costs2026,
      shortLink
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
