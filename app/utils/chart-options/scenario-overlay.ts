import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Scenario Overlay – multi-line chart showing different forecast scenarios.
 * Matched by chart.id === 'scenarioOverlay'.
 */
export function buildScenarioOverlayOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.dates || !data?.scenarios) return null

  const baseOptions = createBaseChartOptions()

  const series = data.scenarios.map((scenario: any) => ({
    name: scenario.name,
    type: 'line',
    data: scenario.values,
    smooth: true,
    lineStyle: {
      color: scenario.color,
      width: 2
    },
    emphasis: {
      focus: 'series'
    }
  }))

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const date = params[0].name
        let result = `${date}<br/>`
        params.forEach((param: any) => {
          result += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
        })
        return result
      }
    },
    legend: {
      data: data.scenarios.map((s: any) => s.name),
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
      name: 'Forecast Amount',
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
