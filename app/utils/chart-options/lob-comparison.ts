import { createBaseChartOptions, CHART_THEME, getUtilizationColor } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * LOB Comparison – horizontal bar chart comparing lines of business.
 * Matched by chart.id === 'lobComparison'.
 */
export function buildLobComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        return `${item.name}<br/>
                    Cost: ${formatCurrency(item.cost)}<br/>
                    Budget: ${formatCurrency(item.budget)}<br/>
                    Accounts: ${item.accounts}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
      }
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => formatCurrency(value)
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    yAxis: {
      type: 'category',
      data: data.map((d: any) => d.name),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
      }
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => ({
          value: d.cost,
          itemStyle: {
            color: getUtilizationColor(d.utilization)
          }
        }))
      }
    ]
  }
}
