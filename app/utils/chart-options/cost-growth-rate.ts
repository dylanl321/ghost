import { createBaseChartOptions, CHART_THEME, getGrowthColor } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Cost Growth Rate Analysis – bar chart showing growth rates per account.
 * Matched by chart.id === 'costGrowthRate'.
 */
export function buildCostGrowthRateOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        return `${item.accountName}<br/>
                    Growth: ${formatPercent(item.growthRate)}<br/>
                    Current: ${formatCurrency(item.currentCost)}<br/>
                    Previous: ${formatCurrency(item.previousCost)}<br/>
                    Change: ${formatCurrency(item.growthAmount)}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.accountName || d.accountId),
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
        formatter: (value: number) => `${value}%`
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => ({
          value: d.growthRate,
          itemStyle: {
            color: getGrowthColor(d.growthRate)
          }
        }))
      }
    ]
  }
}
