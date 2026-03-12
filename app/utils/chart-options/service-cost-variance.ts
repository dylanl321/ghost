import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import { normalizeParams, tooltipHeader, tooltipLine, tooltipCurrencyLine, wrapTooltip } from '~/utils/tooltip-helpers'
import type { ChartBuilderContext } from './types'

/**
 * Service Cost Variance – diverging horizontal bar chart showing per-service
 * dollar change: projected end-of-month (actual + forecast) vs last month.
 * Increases extend right (red), decreases left (green).
 * Matched by chart.id === 'serviceCostVariance'.
 */
export function buildServiceCostVarianceOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data) || data.length === 0) return null

  const baseOptions = createBaseChartOptions()

  // Sort by absolute change descending
  const sorted = [...data].sort((a, b) => Math.abs(b.change) - Math.abs(a.change))

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const { item } = normalizeParams(params)
        const d = sorted[item.dataIndex]
        const direction = d.change >= 0 ? 'Increase' : 'Decrease'
        const pct = d.percentChange !== null ? ` (${d.percentChange > 0 ? '+' : ''}${d.percentChange.toFixed(1)}%)` : ''
        return wrapTooltip([
          tooltipHeader(d.service),
          tooltipLine(direction, `${formatCurrency(Math.abs(d.change))}${pct}`),
          tooltipCurrencyLine('Projected EOM', d.projected),
          tooltipCurrencyLine('Last Month', d.previous),
        ])
      }
    },
    grid: {
      ...baseOptions.grid,
      left: '25%',
      right: '10%'
    },
    xAxis: {
      type: 'value',
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => formatCurrency(Math.abs(value))
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    yAxis: {
      type: 'category',
      data: sorted.map((d: any) => d.service),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: string) => value.length > 25 ? value.substring(0, 25) + '...' : value
      }
    },
    series: [
      {
        type: 'bar',
        data: sorted.map((d: any) => ({
          value: d.change,
          itemStyle: {
            color: d.change >= 0 ? '#ef4444' : '#10b981'
          }
        })),
        label: {
          show: true,
          position: 'right',
          color: CHART_THEME.axisLabel,
          fontSize: 10,
          formatter: (params: any) => {
            const val = params.value
            return val >= 0 ? `+${formatCurrency(val)}` : `-${formatCurrency(Math.abs(val))}`
          }
        }
      }
    ]
  }
}
