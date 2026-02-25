import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Historical Monthly Trend – bar chart showing monthly cost over time.
 * Matched by chart.id === 'historicalMonthlyTrend'.
 */
export function buildHistoricalMonthlyTrendOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  // Determine appropriate interval based on data length
  const labelInterval = data.length > 12 ? Math.ceil(data.length / 12) - 1 : 0

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        if (Array.isArray(params)) params = params[0]
        const monthData = data[params.dataIndex]
        const monthName = monthData.name // YYYY-MM format
        const [year, month] = monthName.split('-')
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const formattedMonth = `${monthNames[parseInt(month) - 1]} ${year}`
        return `${formattedMonth}<br/>Cost: ${monthData.formattedValue || formatCurrency(params.value)}`
      }
    },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => {
        const [year, month] = d.name.split('-')
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
          'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
        const shortYear = year.substring(2)
        return `${monthNames[parseInt(month) - 1]} '${shortYear}`
      }),
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        interval: labelInterval,
        fontSize: 9
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
        type: 'bar',
        data: data.map((d: any) => ({
          value: d.value,
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#10b981' },
                { offset: 1, color: '#065f46' }
              ]
            }
          }
        }))
      }
    ]
  }
}
