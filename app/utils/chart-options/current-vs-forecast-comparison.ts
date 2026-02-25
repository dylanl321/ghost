import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Current vs Forecast Comparison – grouped bar chart comparing current and forecast costs.
 * Matched by chart.id === 'currentVsForecastComparison'.
 */
export function buildCurrentVsForecastComparisonOptions(data: any, _context: ChartBuilderContext): any {
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
        const change = (item.percentChange ?? 0) > 0 ? '+' : ''
        return `${item.accountName}<br/>
                        Current: ${formatCurrency(item.currentCost)}<br/>
                        Forecast: ${formatCurrency(item.forecastCost)}<br/>
                        Change: ${change}${(item.percentChange ?? 0).toFixed(1)}%<br/>
                        Difference: ${formatCurrency(item.difference)}`
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
        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
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
        name: 'Current',
        type: 'bar',
        data: data.map((d: any) => d.currentCost),
        itemStyle: { color: '#3b82f6' }
      },
      {
        name: 'Forecast',
        type: 'bar',
        data: data.map((d: any) => d.forecastCost),
        itemStyle: { color: '#10b981' }
      }
    ]
  }
}
