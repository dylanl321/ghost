import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Billable vs Proforma – grouped bar chart comparing billable and proforma costs.
 * Matched by chart.id === 'billableVsProforma'.
 */
export function buildBillableVsProformaOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const item = data[params[0].dataIndex]
        return `
                            <div class="text-sm">
                                <div class="font-semibold">${item.accountName}</div>
                                <div>Billable: ${formatCurrency(item.billableCost, { showCents: false })}</div>
                                <div>Proforma: ${formatCurrency(item.proformaCost, { showCents: false })}</div>
                                <div class="${item.difference > 0 ? 'text-red-400' : 'text-green-400'}">
                                    Difference: ${formatCurrency(Math.abs(item.difference), false)} 
                                    (${(item.percentChange ?? 0) > 0 ? '+' : ''}${(item.percentChange ?? 0).toFixed(1)}%)
                                </div>
                            </div>
                        `
      }
    },
    legend: {
      data: ['Billable', 'Proforma'],
      textStyle: { color: CHART_THEME.textColor },
      top: 10
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.accountName || d.accountId),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        interval: 0,
        formatter: (value: string) => value.length > 20 ? value.substring(0, 20) + '...' : value
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
      {
        name: 'Billable',
        type: 'bar',
        data: data.map((d: any) => d.billableCost),
        itemStyle: {
          color: '#6b7280'
        }
      },
      {
        name: 'Proforma',
        type: 'bar',
        data: data.map((d: any) => d.proformaCost),
        itemStyle: {
          color: '#3b82f6'
        }
      }
    ]
  }
}
