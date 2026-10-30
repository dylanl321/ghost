import type { NormalizedDataset } from '~/types/costs'
import { buildAccountToGroupMap, unwrapByMode } from '~/utils/cost-data-unwrap'

export interface GroupTrendConfig {
  groupField: string
  fallbackField: string
  minThreshold: number
  limit: number
  unknownLabel: string
}

interface GroupSeries {
  name: string
  dates: string[]
  values: number[]
  total: number
}

/**
 * Shared algorithm for extracting group-based trend data (LOB or Department).
 *
 * Handles two data paths:
 *  1. `monthlyBreakdown` — preferred for historical data with account-level detail
 *  2. `resultsByTime` fallback — used when monthlyBreakdown is unavailable
 *
 * Both paths map account IDs → group labels using `buildAccountToGroupMap`,
 * aggregate per-period totals, then return the top N groups by spend.
 */
export function buildGroupTrendData(
  dataset: NormalizedDataset,
  config: GroupTrendConfig,
): { dates: string[]; series: GroupSeries[] } | null {
  const summary = dataset.summary as any
  const historical = dataset.historical as any

  const mode = dataset.mode || 'billable'
  // Proforma responses are { billable, proforma }; pick the active mode
  const dataSource = unwrapByMode(historical, mode) || unwrapByMode(summary, mode)
  if (!dataSource) return null

  // Path 1: monthlyBreakdown (historical data with account-level grouping)
  if (dataSource.monthlyBreakdown && Array.isArray(dataSource.monthlyBreakdown)) {
    const accounts = (dataset as any).accountsList || []
    if (!accounts || !Array.isArray(accounts) || accounts.length === 0) {
      return null
    }

    const groupMap = buildAccountToGroupMap(accounts, config.groupField, config.fallbackField)
    const resultsByTime = dataSource?.resultsByTime || []
    const seriesMap = new Map<string, number[]>()
    const dates: string[] = []

    resultsByTime.forEach((bucket: any) => {
      const dateStr = bucket?.TimePeriod?.Start || ''
      dates.push(dateStr)

      const groupTotals = new Map<string, number>()

      if (bucket.Groups) {
        bucket.Groups.forEach((g: any) => {
          const accountId = g.Keys?.[0] || 'unknown'
          const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
          const group = groupMap.get(accountId) || config.unknownLabel
          groupTotals.set(group, (groupTotals.get(group) || 0) + amount)
        })
      }

      // Push values for groups seen this period
      groupTotals.forEach((amount, group) => {
        if (!seriesMap.has(group)) {
          seriesMap.set(group, new Array(dates.length - 1).fill(0))
        }
        seriesMap.get(group)!.push(amount)
      })

      // Fill zeros for groups not seen this period
      seriesMap.forEach((series) => {
        if (series.length < dates.length) {
          series.push(0)
        }
      })
    })

    const groupSeries = Array.from(seriesMap.entries())
      .map(([name, values]) => ({
        name,
        dates,
        values,
        total: values.reduce((sum, val) => sum + val, 0),
      }))
      .filter((s) => s.total > config.minThreshold)
      .sort((a, b) => b.total - a.total)
      .slice(0, config.limit)

    return { dates, series: groupSeries }
  }

  // Path 2: resultsByTime fallback
  const resultsByTime = dataSource?.resultsByTime || []
  const seriesMap = new Map<string, { dates: string[]; values: number[] }>()
  const dates: string[] = []

  const fallbackAccountsList = (dataset as any).accountsList || []
  const fallbackGroupMap =
    fallbackAccountsList.length > 0
      ? buildAccountToGroupMap(fallbackAccountsList, config.groupField, config.fallbackField)
      : new Map<string, string>()

  resultsByTime.forEach((bucket: any) => {
    const dateStr = bucket?.TimePeriod?.Start || ''
    dates.push(dateStr)

    const groupTotals = new Map<string, number>()

    if (bucket.Groups) {
      bucket.Groups.forEach((g: any) => {
        const accountId = g.Keys?.[0] || 'unknown'
        const amount = parseFloat(g.Metrics?.UnblendedCost?.Amount || '0')
        const group =
          fallbackGroupMap.get(accountId) ||
          (fallbackGroupMap.size === 0 ? 'Account-' + (accountId.substring(0, 4) || 'Unknown') : config.unknownLabel)
        groupTotals.set(group, (groupTotals.get(group) || 0) + amount)
      })
    }

    groupTotals.forEach((amount, group) => {
      if (!seriesMap.has(group)) {
        seriesMap.set(group, { dates: [...dates], values: new Array(dates.length - 1).fill(0) })
      }
      seriesMap.get(group)!.values.push(amount)
    })

    seriesMap.forEach((series) => {
      if (series.values.length < dates.length) {
        series.values.push(0)
      }
    })
  })

  const groupSeries = Array.from(seriesMap.entries())
    .map(([name, series]) => ({
      name,
      dates: series.dates,
      values: series.values,
      total: series.values.reduce((sum, val) => sum + val, 0),
    }))
    .filter((s) => s.total > config.minThreshold)
    .sort((a, b) => b.total - a.total)
    .slice(0, config.limit)

  return { dates, series: groupSeries }
}
