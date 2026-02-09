import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Gauge chart for forecast percentage.
 * Matched by chart.type === 'gauge' as a fallback.
 */
export function buildGaugeOptions(data: any, _context: ChartBuilderContext): any {
  if (data?.value === undefined) return null

  const baseOptions = createBaseChartOptions()
  const percentage = Math.min(data.percentage || 0, 150)

  return {
    ...baseOptions,
    series: [
      {
        type: 'gauge',
        startAngle: 180,
        endAngle: 0,
        min: 0,
        max: 150,
        splitNumber: 6,
        axisLine: {
          lineStyle: {
            width: 20,
            color: [
              [0.6, '#10b981'],
              [0.8, '#3b82f6'],
              [0.9, '#f59e0b'],
              [1, '#ef4444']
            ]
          }
        },
        pointer: {
          icon: 'path://M12.8,0.7l12,40.1H0.7L12.8,0.7z',
          length: '70%',
          width: 8,
          offsetCenter: [0, '-60%'],
          itemStyle: { color: 'auto' }
        },
        axisTick: {
          length: 10,
          lineStyle: { color: 'auto', width: 2 }
        },
        splitLine: {
          length: 15,
          lineStyle: { color: 'auto', width: 3 }
        },
        axisLabel: {
          color: CHART_THEME.textColor,
          distance: 25,
          fontSize: 10,
          formatter: '{value}%'
        },
        title: {
          offsetCenter: [0, '-20%'],
          fontSize: 14,
          color: CHART_THEME.textColor,
          show: true
        },
        detail: {
          fontSize: 24,
          offsetCenter: [0, '20%'],
          valueAnimation: true,
          formatter: () => formatCurrency(data.value),
          color: 'auto'
        },
        data: [
          {
            value: percentage.toFixed(2),
            name: 'vs Budget'
          }
        ]
      }
    ]
  }
}
