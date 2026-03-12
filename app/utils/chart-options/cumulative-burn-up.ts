import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import { tooltipHeader, tooltipCurrencyLine, normalizeParams } from '~/utils/tooltip-helpers'
import type { ChartBuilderContext } from './types'

/**
 * Cumulative Burn-up – single aggregated view answering "are we on track?"
 *
 * - Solid blue area: cumulative actual spend (MTD)
 * - Dashed gray line: budget pace (linear from 0 to monthly budget)
 * - Dotted purple line: forecast projection to month end
 * - Red/green markline: monthly budget target
 */
export function buildCumulativeBurnUpOptions(data: any, _context: ChartBuilderContext): any {
  if (!data || !data.dates || data.dates.length === 0) return null

  const baseOptions = createBaseChartOptions()

  const {
    dates,
    cumulativeActual,
    budgetPace,
    forecastProjection,
    totalMonthlyBudget,
    totalActual,
    eomEstimate,
    daysElapsed,
    daysInMonth,
    status,
    variancePercent
  } = data

  const statusColor = status === 'over' ? '#ef4444' : status === 'warning' ? '#f59e0b' : '#10b981'
  const statusLabel = status === 'over' ? 'Over pace' : status === 'warning' ? 'Near pace' : 'Under pace'

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const { all } = normalizeParams(params)
        if (all.length === 0) return ''
        let html = tooltipHeader(`Day ${all[0].name}`)
        for (const p of all) {
          if (p.value == null) continue
          html += tooltipCurrencyLine(p.seriesName, p.value, { color: p.color || '#fff' })
        }
        return html
      }
    },
    legend: {
      data: ['Actual Spend', 'Budget Pace', 'Forecast'],
      textStyle: { color: CHART_THEME.axisLabel },
      top: 0
    },
    grid: {
      ...baseOptions.grid,
      top: 45,
      bottom: 35,
      right: 15
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        interval: Math.max(0, Math.floor(daysInMonth / 8) - 1),
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
    series: [
      // Cumulative actual spend — filled area
      {
        name: 'Actual Spend',
        type: 'line',
        data: cumulativeActual,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.5, color: '#3b82f6' },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.02)' }
            ]
          }
        },
        // "Today" marker on last actual data point
        markPoint: {
          data: [
            {
              name: 'Today',
              coord: [daysElapsed - 1, totalActual],
              symbol: 'circle',
              symbolSize: 8,
              itemStyle: { color: '#3b82f6', borderColor: '#fff', borderWidth: 2 },
              label: {
                show: true,
                position: 'top',
                color: statusColor,
                fontWeight: 'bold',
                fontSize: 11,
                formatter: () => `${statusLabel} (${variancePercent > 0 ? '+' : ''}${variancePercent.toFixed(0)}%)`
              }
            }
          ]
        }
      },
      // Budget pace — dashed line across full month
      {
        name: 'Budget Pace',
        type: 'line',
        data: budgetPace,
        smooth: false,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dashed', color: '#6b7280' },
        // Budget target markline at end of month
        markLine: totalMonthlyBudget > 0 ? {
          silent: true,
          symbol: 'none',
          data: [
            {
              yAxis: totalMonthlyBudget,
              lineStyle: { color: '#6b7280', type: 'dotted', width: 1 },
              label: {
                show: true,
                position: 'insideEndTop',
                color: '#9ca3af',
                fontSize: 10,
                formatter: () => `Budget: ${formatCurrency(totalMonthlyBudget)}`
              }
            }
          ]
        } : undefined
      },
      // Forecast projection — dotted line from today to month end
      {
        name: 'Forecast',
        type: 'line',
        data: forecastProjection,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2, type: 'dotted', color: '#a78bfa' },
        // EOM estimate marker
        markPoint: eomEstimate > 0 ? {
          data: [
            {
              name: 'EOM',
              coord: [daysInMonth - 1, eomEstimate],
              symbol: 'diamond',
              symbolSize: 10,
              itemStyle: { color: '#a78bfa' },
              label: {
                show: true,
                position: 'left',
                color: '#a78bfa',
                fontSize: 10,
                formatter: () => `EOM: ${formatCurrency(eomEstimate)}`
              }
            }
          ]
        } : undefined
      }
    ]
  }
}
