import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Cost Optimization Opportunities – bar chart showing potential savings.
 * Matched by chart.id === 'costOptimizationOpportunities'.
 */
export function buildCostOptimizationOpportunitiesOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        return `${item.accountName}<br/>
                    Opportunity: ${item.opportunity}<br/>
                    Priority: ${item.priority}<br/>
                    Potential Savings: ${formatCurrency(item.potentialSavings)}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.accountName),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        interval: 0,
        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
      }
    },
    yAxis: {
      type: 'value',
      name: 'Potential Savings ($K)',
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => formatCurrency(value)
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => ({
          value: d.potentialSavings,
          itemStyle: {
            color: d.priority === 'High' ? '#ef4444' :
              d.priority === 'Medium' ? '#f59e0b' : '#3b82f6'
          }
        }))
      }
    ]
  }
}
