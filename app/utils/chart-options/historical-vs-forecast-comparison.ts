import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Historical Average vs Estimated Allocation – grouped bars per account.
 * Matched by chart.id === 'historicalVsForecastComparison'.
 */
export function buildHistoricalVsForecastComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data) || data.length === 0) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        const sign = item.variancePercent > 0 ? '+' : ''
        return `${item.accountName}<br/>
                        Monthly average: ${formatCurrency(item.historicalAverage)}<br/>
                        Next month (estimated): ${formatCurrency(item.forecastValue)}<br/>
                        Change: ${sign}${item.variancePercent.toFixed(1)}%`
      }
    },
    legend: { data: ['Monthly average', 'Next month (estimated)'], textStyle: { color: CHART_THEME.textColor }, top: 0 },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.accountName),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 30,
        interval: 0,
        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: { color: CHART_THEME.axisLabel, formatter: (value: number) => formatCurrency(value) },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    series: [
      { name: 'Monthly average', type: 'bar', data: data.map((d: any) => d.historicalAverage), itemStyle: { color: '#6366f1' } },
      { name: 'Next month (estimated)', type: 'bar', data: data.map((d: any) => d.forecastValue), itemStyle: { color: '#10b981' } }
    ]
  }
}
