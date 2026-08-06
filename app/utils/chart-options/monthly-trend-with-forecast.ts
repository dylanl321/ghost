import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Monthly Trend with Forecast – grouped bars for last month, current, and forecast.
 * Matched by chart.id === 'monthlyTrendWithForecast'.
 */
export function buildMonthlyTrendWithForecastOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const dataIndex = params[0].dataIndex
        const item = data[dataIndex]
        return `${item.accountName}<br/>
                        Last Month: ${formatCurrency(item.lastMonth)}<br/>
                        Current: ${formatCurrency(item.currentMonth)}<br/>
                        Estimated allocation: ${formatCurrency(item.forecast)}<br/>
                        MoM Change: ${(item.monthOverMonth ?? 0) > 0 ? '+' : ''}${(item.monthOverMonth ?? 0).toFixed(1)}%<br/>
                        Estimate Change: ${(item.forecastChange ?? 0) > 0 ? '+' : ''}${(item.forecastChange ?? 0).toFixed(1)}%`
      }
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.accountName),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        interval: 0,
        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
      }
    },
    yAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => formatCurrency(value)
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    series: [
      {
        name: 'Last Month',
        type: 'bar',
        data: data.map((d: any) => d.lastMonth),
        itemStyle: { color: SEMANTIC_COLORS.secondary }
      },
      {
        name: 'Current',
        type: 'bar',
        data: data.map((d: any) => d.currentMonth),
        itemStyle: { color: SEMANTIC_COLORS.primary }
      },
      {
        name: 'Estimated allocation',
        type: 'bar',
        data: data.map((d: any) => d.forecast),
        itemStyle: { color: SEMANTIC_COLORS.forecast }
      }
    ]
  }
}
