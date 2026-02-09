import { createBaseChartOptions, CHART_THEME, getUtilizationColor } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Budget utilization chart – gauge for single account, bars for multiple.
 * Matched by chart.id === 'budgetUtilization'.
 */
export function buildBudgetUtilizationOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null
  if (data.length === 0) return null

  const baseOptions = createBaseChartOptions()

  // Calculate dynamic max based on actual data
  const maxUtilization = Math.max(...data.map((d: any) => d.utilization))
  const dynamicMax = Math.max(120, Math.ceil(maxUtilization / 10) * 10)

  // For single account, show as gauge
  if (data.length === 1) {
    const account = data[0]
    const utilization = account.utilization

    return {
      ...baseOptions,
      series: [
        {
          type: 'gauge',
          startAngle: 180,
          endAngle: 0,
          min: 0,
          max: dynamicMax,
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
            length: '25%',
            width: 10,
            offsetCenter: [0, '-60%'],
            itemStyle: {
              color: '#1f2937',
              borderColor: '#ffffff',
              borderWidth: 2
            },
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
            show: false
          },
          detail: {
            fontSize: 20,
            offsetCenter: [0, '20%'],
            valueAnimation: true,
            formatter: () => {
              return `${formatPercent(utilization)}\n${formatCurrency(account.actualCost, { showCents: false })} / ${formatCurrency(account.budgetedCost, { showCents: false })}`
            },
            color: 'auto'
          },
          data: [
            {
              value: utilization,
              name: account.accountName
            }
          ]
        }
      ]
    }
  }

  // For multiple accounts, show as bar chart
  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        return `${item.accountName}<br/>
                    Actual: ${formatCurrency(item.actualCost, { showCents: false })}<br/>
                    Budget: ${formatCurrency(item.budgetedCost, { showCents: false })}<br/>
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
        formatter: (value: string) => value.length > 15 ? value.substring(0, 15) + '...' : value
      }
    },
    yAxis: {
      type: 'value',
      max: dynamicMax,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => `${value}%`
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    series: [
      {
        name: 'Utilization',
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
