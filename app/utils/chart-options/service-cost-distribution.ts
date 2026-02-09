import { createBaseChartOptions, CHART_THEME, getSeriesColor } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Service Cost Distribution – enhanced treemap with per-service detail.
 * Matched by chart.id === 'serviceCostDistribution'.
 */
export function buildServiceCostDistributionOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      formatter: (info: any) => {
        const value = info.value
        let tooltip = `${info.name}<br/>Total: ${formatCurrency(value)}`

        // Add percentage if available
        if (info.data?.children) {
          const total = data.reduce((sum: number, item: any) => sum + item.value, 0)
          const percentage = (value / total) * 100
          tooltip += `<br/>Share: ${formatPercent(percentage)}`
        }

        return tooltip
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
          formatter: (params: any) => {
            const name = params.name
            const value = formatCurrency(params.value)
            return name.length > 12 ? `${name.substring(0, 12)}...\n${value}` : `${name}\n${value}`
          },
          color: '#fff',
          fontSize: 11
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
          children: item.children,
          itemStyle: {
            color: getSeriesColor(index)
          }
        }))
      }
    ]
  }
}
