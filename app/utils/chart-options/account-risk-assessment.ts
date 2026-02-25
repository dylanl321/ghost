import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import type { ChartBuilderContext } from './types'

/**
 * Account Risk Assessment – enhanced donut chart showing risk categories.
 * Matched by chart.id === 'accountRiskAssessment'.
 */
export function buildAccountRiskAssessmentOptions(data: any, _context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'item',
      formatter: '{b}<br/>{c} accounts ({d}%)'
    },
    legend: {
      orient: 'horizontal',
      bottom: '8%',
      left: 'center',
      textStyle: { color: CHART_THEME.textColor, fontSize: 12 },
      itemGap: 15,
      itemWidth: 12,
      itemHeight: 12
    },
    series: [
      {
        type: 'pie',
        radius: ['50%', '80%'],
        avoidLabelOverlap: false,
        label: {
          show: true,
          position: 'center',
          formatter: () => {
            const total = data.reduce((sum: number, item: any) => sum + item.value, 0)
            return `${total}\\nTotal Accounts`
          },
          fontSize: 16,
          color: '#fff'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 20,
            fontWeight: 'bold'
          }
        },
        labelLine: { show: false },
        data: data.map((item: any) => ({
          value: item.value,
          name: item.name,
          itemStyle: { color: item.color }
        }))
      }
    ]
  }
}
