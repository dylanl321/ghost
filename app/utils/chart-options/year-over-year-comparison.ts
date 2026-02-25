import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Year-over-Year Comparison – multi-line chart comparing years.
 * Matched by chart.id === 'yearOverYearComparison'.
 */
export function buildYearOverYearComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.series || !data?.dates) return null

  const baseOptions = createBaseChartOptions()

  const series = data.series.map((yearSeries: any, index: number) => ({
    name: yearSeries.name,
    type: 'line',
    data: yearSeries.values,
    smooth: true,
    lineStyle: {
      width: 3,
      color: index === 0 ? '#6b7280' : '#3b82f6' // Gray for last year, blue for this year
    },
    itemStyle: {
      color: index === 0 ? '#6b7280' : '#3b82f6'
    }
  }))

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const monthName = data.dates[params[0].dataIndex]
        let tooltip = `${monthName}<br/>`
        params.forEach((param: any) => {
          tooltip += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
        })
        return tooltip
      }
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
    series
  }
}
