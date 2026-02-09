import { createBaseChartOptions, CHART_THEME, getSeriesColor } from '~/utils/chart-theme'
import type { ChartBuilderContext } from './types'

/**
 * Pie (donut-ring) chart for service breakdown.
 * Matched by chart.type === 'pie' as a fallback.
 */
export function buildPieOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'item',
      formatter: '{b}<br/>${c} ({d}%)'
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '65%'],
        center: ['50%', '40%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#111827',
          borderWidth: 2
        },
        label: {
          show: true,
          position: 'outside',
          formatter: '{b}\n{d}%',
          fontSize: 11,
          color: CHART_THEME.textColor,
          distanceToLabelLine: 5
        },
        labelLine: {
          show: true,
          length: 10,
          length2: 5,
          lineStyle: {
            color: '#4b5563'
          }
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 12,
            fontWeight: 'normal',
            color: '#fff'
          }
        },
        data: data.map((item: any, index: number) => ({
          value: item.value,
          name: item.name,
          itemStyle: {
            color: getSeriesColor(index)
          }
        }))
      }
    ]
  }
}
