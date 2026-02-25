import { createBaseChartOptions, CHART_COLORS, getSeriesColor } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Treemap chart for department comparison.
 * Matched by chart.type === 'treemap' as a fallback.
 */
export function buildTreemapOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      formatter: (info: any) => {
        const value = info.value
        return `${info.name}<br/>Total: ${formatCurrency(value)}`
      }
    },
    series: [
      {
        type: 'treemap',
        roam: false,
        nodeClick: false,
        breadcrumb: { show: false },
        label: {
          show: true,
          formatter: '{b}',
          color: '#fff'
        },
        itemStyle: {
          borderColor: '#111827',
          borderWidth: 2,
          gapWidth: 2
        },
        levels: [
          {
            itemStyle: {
              borderWidth: 0,
              gapWidth: 2
            }
          },
          {
            itemStyle: {
              borderWidth: 2,
              gapWidth: 2
            }
          }
        ],
        data: data.map((item: any, index: number) => ({
          name: item.name,
          value: item.value,
          itemStyle: {
            color: getSeriesColor(index)
          }
        }))
      }
    ]
  }
}
