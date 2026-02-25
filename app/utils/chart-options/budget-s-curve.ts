import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Budget S-Curve Tracking – actual spend + budget envelope + forecast projection.
 * Matched by chart.id === 'budgetSCurve'.
 */
export function buildBudgetSCurveOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.months || !data?.actualSpend) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const month = params[0].name
        let result = `${month}<br/>`
        params.forEach((param: any) => {
          if (param.seriesName === 'Actual Spend') {
            result += `Actual: ${formatCurrency(param.value)}<br/>`
          } else if (param.seriesName === 'Budget Envelope') {
            result += `Budget Target: ${formatCurrency(param.value)}<br/>`
          } else if (param.seriesName === 'Forecast Projection') {
            result += `Projected: ${formatCurrency(param.value)}<br/>`
          }
        })
        if (data.isOverBudget) {
          result += '<span style="color: #ef4444">⚠ Over Budget</span>'
        }
        return result
      }
    },
    legend: {
      data: [
        'Actual Spend',
        ...(data.budgetEnvelope ? ['Budget Envelope'] : []),
        ...(data.forecastProjection ? ['Forecast Projection'] : [])
      ],
      textStyle: { color: CHART_THEME.textColor }
    },
    xAxis: {
      type: 'category',
      data: data.months,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        interval: 0
      }
    },
    yAxis: {
      type: 'value',
      name: 'Cumulative Spend',
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
        data: data.actualSpend,
        smooth: true,
        lineStyle: { color: SEMANTIC_COLORS.primary, width: 3 },
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
      },
      ...(data.budgetEnvelope ? [{
        name: 'Budget Envelope',
        type: 'line',
        data: data.budgetEnvelope,
        smooth: true,
        lineStyle: {
          color: SEMANTIC_COLORS.warning,
          width: 2,
          type: 'dashed'
        },
        symbol: 'none'
      }] : []),
      ...(data.forecastProjection ? [{
        name: 'Forecast Projection',
        type: 'line',
        data: [...Array(data.actualSpend.length - data.forecastProjection.length).fill(null), ...data.forecastProjection],
        lineStyle: {
          color: SEMANTIC_COLORS.forecast,
          width: 2,
          type: 'dotted'
        },
        connectNulls: false,
        symbol: 'none'
      }] : [])
    ]
  }
}
