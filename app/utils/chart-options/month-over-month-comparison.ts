import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Month-over-Month Comparison – bar chart comparing two months.
 * Matched by chart.id === 'monthOverMonthComparison'.
 */
export function buildMonthOverMonthComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        if (Array.isArray(params)) params = params[0]
        const item = data[params.dataIndex]
        return `${item.name}<br/>Cost: ${item.formattedValue}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.name),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: { color: CHART_THEME.axisLabel }
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
    series: [{
      type: 'bar',
      data: data.map((d: any, index: number) => ({
        value: d.value,
        itemStyle: {
          color: index === 0 ? '#6b7280' : '#3b82f6' // Gray for last month, blue for this month
        }
      }))
    }]
  }
}
