import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Cumulative Burn-up Chart – multi-account actual spend + budget track lines.
 * Matched by chart.id === 'cumulativeBurnUp'.
 */
export function buildCumulativeBurnUpOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data) || data.length === 0) return null

  const baseOptions = createBaseChartOptions()

  const allMonths = data.length > 0 ? data[0].months : []
  const series: any[] = []

  data.forEach((account: any) => {
    // Actual spend line for each account
    series.push({
      name: account.accountName,
      type: 'line',
      data: account.actualSpend,
      smooth: true,
      lineStyle: { width: 2 }
    })

    // Budget track line (if budget exists)
    if (account.totalBudget > 0) {
      series.push({
        name: `${account.accountName} Budget`,
        type: 'line',
        data: account.budgetTrack,
        lineStyle: {
          type: 'dashed',
          width: 1,
          opacity: 0.5
        },
        symbol: 'none'
      })
    }
  })

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const month = params[0].name
        let result = `${month}<br/>`
        params.forEach((param: any) => {
          const isBudget = param.seriesName.includes('Budget')
          const prefix = isBudget ? 'Budget: ' : 'Actual: '
          result += `${param.seriesName}: ${prefix}${formatCurrency(param.value)}<br/>`
        })
        return result
      }
    },
    legend: {
      data: series.map((s: any) => s.name),
      textStyle: { color: CHART_THEME.textColor },
      type: 'scroll'
    },
    xAxis: {
      type: 'category',
      data: allMonths,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: { color: CHART_THEME.axisLabel }
    },
    yAxis: {
      type: 'value',
      name: 'Cumulative Spend',
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => formatCurrency(value)
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    series
  }
}
