import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Forecast Projection Line – actual spend + forecast overlay + budget line.
 * Matched by chart.id === 'forecastProjectionLine'.
 */
export function buildForecastProjectionLineOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.actualSeries || !data?.forecastSeries) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        let result = `${params[0].name}<br/>`
        params.forEach((param: any) => {
          result += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
        })
        return result
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
        name: 'Actual Spend',
        type: 'line',
        data: [...data.actualSeries.values, ...Array(data.forecastSeries.values.length).fill(null)],
        lineStyle: { color: SEMANTIC_COLORS.primary, width: 3 },
        connectNulls: false
      },
      {
        name: 'AWS Projected Spend',
        type: 'line',
        data: [...Array(data.actualSeries.values.length).fill(null), ...data.forecastSeries.values],
        lineStyle: { color: SEMANTIC_COLORS.forecast, width: 3, type: 'dashed' },
        connectNulls: false
      },
      {
        name: 'GDMS Forecasted Costs',
        type: 'line',
        data: Array(data.dates.length).fill(data.totalBudget),
        lineStyle: { color: SEMANTIC_COLORS.warning, width: 2, type: 'dotted' }
      }
    ]
  }
}
