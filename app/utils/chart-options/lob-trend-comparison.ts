import { createBaseChartOptions, CHART_THEME, getSeriesColor } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import { multiSeriesTooltip } from '~/utils/tooltip-helpers'
import type { ChartBuilderContext } from './types'

/**
 * LOB Trend Comparison – multi-line chart comparing lines of business over time.
 * Matched by chart.id === 'lobTrendComparison'.
 */
export function buildLobTrendComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.series || !data?.dates) return null

  const baseOptions = createBaseChartOptions()

  const series = data.series.map((lobSeries: any, index: number) => ({
    name: lobSeries.name,
    type: 'line',
    data: lobSeries.values,
    smooth: true,
    lineStyle: {
      width: 2,
      color: getSeriesColor(index)
    },
    itemStyle: {
      color: getSeriesColor(index)
    }
  }))

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: multiSeriesTooltip
    },
    legend: {
      orient: 'horizontal',
      top: 'top',
      textStyle: { color: CHART_THEME.textColor }
    },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        fontSize: 10
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
