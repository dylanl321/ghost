import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Generic bar chart for top spenders and other simple bar charts.
 * Matched by chart.type === 'bar' as a fallback.
 */
export function buildBarOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        if (Array.isArray(params)) params = params[0]
        return `${params.name}<br/>Cost: ${formatCurrency(params.value, { showCents: false })}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.accountName || d.name),
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
        type: 'bar',
        data: data.map((d: any) => d.cost || d.actualCost || d.value),
        itemStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: SEMANTIC_COLORS.primary },
              { offset: 1, color: '#1e40af' /* gradient end */ }
            ]
          }
        }
      }
    ]
  }
}
