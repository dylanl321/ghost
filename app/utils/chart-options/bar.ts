import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import { normalizeParams, tooltipCurrencyLine, tooltipLine, wrapTooltip, tooltipHeader } from '~/utils/tooltip-helpers'
import type { ChartBuilderContext } from './types'

/**
 * Generic bar chart for top spenders and other simple bar charts.
 * When data items include `budget`, renders budget reference markers.
 * Matched by chart.type === 'bar' as a fallback.
 */
export function buildBarOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()
  const hasBudgetData = data.some((d: any) => d.budget > 0)

  const series: any[] = [
    {
      name: 'Cost',
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

  // Add budget reference markers when budget data is available
  if (hasBudgetData) {
    series.push({
      name: 'Budget',
      type: 'scatter',
      symbol: 'diamond',
      symbolSize: 10,
      data: data.map((d: any) => d.budget || null),
      itemStyle: {
        color: '#10b981',
        borderColor: '#fff',
        borderWidth: 1
      },
      z: 10
    })
  }

  return {
    ...baseOptions,
    legend: hasBudgetData ? {
      data: ['Cost', 'Budget'],
      textStyle: { color: CHART_THEME.axisLabel },
      top: 0
    } : undefined,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const { item } = normalizeParams(params)
        const idx = item.dataIndex
        const d = data[idx]
        const lines = [
          tooltipHeader(item.name),
          tooltipCurrencyLine('Cost', d.cost || d.actualCost || d.value),
        ]
        if (d.budget > 0) {
          lines.push(tooltipCurrencyLine('Budget', d.budget))
          lines.push(tooltipLine('Utilization', `${d.utilization?.toFixed(0) || 0}%`))
        }
        return wrapTooltip(lines)
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
    series
  }
}
