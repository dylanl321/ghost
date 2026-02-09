import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Historical Comparison – line chart showing year-long cost trend.
 * Matched by chart.id === 'historicalComparison'.
 */
export function buildHistoricalComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.series || !data?.dates) return null

  const baseOptions = createBaseChartOptions()

  const series = data.series.map((yearSeries: any) => ({
    name: yearSeries.name,
    type: 'line',
    data: yearSeries.values,
    smooth: true,
    lineStyle: {
      width: 2,
      color: '#3b82f6'
    },
    itemStyle: {
      color: '#3b82f6'
    },
    areaStyle: {
      color: {
        type: 'linear',
        x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [
          { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
          { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
        ]
      }
    }
  }))

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        if (Array.isArray(params)) params = params[0]
        return `${params.name}<br/>Cost: ${formatCurrency(params.value)}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        fontSize: 9,
        rotate: 45,
        interval: Math.floor(data.dates.length / 12)
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
    series
  }
}
