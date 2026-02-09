import { createBaseChartOptions, CHART_THEME, getUtilizationColor } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Department Budget Performance – horizontal bars showing utilization per department.
 * Matched by chart.id === 'departmentBudgetPerformance'.
 */
export function buildDepartmentBudgetPerformanceOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null
  if (data.length === 0) return null

  const baseOptions = createBaseChartOptions()

  // Calculate dynamic max based on actual data
  const maxUtilization = Math.max(...data.map((d: any) => d.utilization))
  const dynamicMax = Math.max(120, Math.ceil(maxUtilization / 10) * 10)

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        return `${item.name}<br/>
                    Actual: ${formatCurrency(item.actualCost)}<br/>
                    Budget: ${formatCurrency(item.budgetedCost)}<br/>
                    Accounts: ${item.accounts}<br/>
                    Utilization: ${formatPercent(item.utilization)}`
      }
    },
    xAxis: {
      type: 'value',
      max: dynamicMax,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => `${value}%`
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    yAxis: {
      type: 'category',
      data: data.map((d: any) => d.name),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: string) => value.length > 12 ? value.substring(0, 12) + '...' : value
      }
    },
    series: [
      {
        type: 'bar',
        data: data.map((d: any) => ({
          value: d.utilization,
          itemStyle: {
            color: getUtilizationColor(d.utilization)
          }
        }))
      }
    ]
  }
}
