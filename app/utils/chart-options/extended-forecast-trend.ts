import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Extended Forecast Trend – line chart showing forecast projection over time.
 * Matched by chart.id === 'extendedForecastTrend'.
 */
export function buildExtendedForecastTrendOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.dates || !data?.series) return null
  if (!data.series.length) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const date = params[0].name
        const forecast = params[0].value
        return `${date}<br/>Forecast: ${formatCurrency(forecast)}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.dates,
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
    series: [
      {
        name: 'Forecast',
        type: 'line',
        data: data.series[0].values,
        smooth: true,
        lineStyle: { color: '#10b981', width: 3 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(16, 185, 129, 0.3)' },
              { offset: 1, color: 'rgba(16, 185, 129, 0.1)' }
            ]
          }
        }
      }
    ]
  }
}
