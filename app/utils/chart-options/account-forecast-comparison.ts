import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Account Forecast Comparison – grouped bars for current, forecast, and budget.
 * Matched by chart.id === 'accountForecastComparison'.
 */
export function buildAccountForecastComparisonOptions(data: any, _context: ChartBuilderContext): any {
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
                        Current: ${formatCurrency(item.currentCost)}<br/>
                        Estimated allocation: ${formatCurrency(item.forecastCost)}<br/>
                        Budget: ${formatCurrency(item.budget)}<br/>
                        Growth: ${(item.growthProjection ?? 0) > 0 ? '+' : ''}${(item.growthProjection ?? 0).toFixed(1)}%<br/>
                        Risk: ${item.riskLevel}`
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
        name: 'Estimated allocation',
        type: 'bar',
        data: data.map((d: any) => d.forecastCost),
        itemStyle: { color: '#10b981' }
      },
      {
        name: 'Budget',
        type: 'bar',
        data: data.map((d: any) => d.budget),
        itemStyle: { color: '#f59e0b' }
      }
    ]
  }
}
