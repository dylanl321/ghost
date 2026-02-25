import { createBaseChartOptions, DEPT_CHART_COLORS, CHART_THEME, getSeriesColor } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Department Trend Comparison – multi-line chart for department spend over time.
 * Matched by chart.id === 'departmentTrendComparison'.
 */
export function buildDepartmentTrendComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.series || !data?.dates) return null

  const baseOptions = createBaseChartOptions()

  const series = data.series.map((deptSeries: any, index: number) => ({
    name: deptSeries.name,
    type: 'line',
    data: deptSeries.values,
    smooth: true,
    lineStyle: {
      width: 2,
      color: getSeriesColor(index, DEPT_CHART_COLORS)
    },
    itemStyle: {
      color: getSeriesColor(index, DEPT_CHART_COLORS)
    }
  }))

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        let tooltip = `${params[0].name}<br/>`
        params.forEach((param: any) => {
          tooltip += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
        })
        return tooltip
      }
    },
    legend: {
      orient: 'horizontal',
      top: 'top',
      textStyle: { color: CHART_THEME.textColor },
      itemGap: 8,
      itemWidth: 14
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
