import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Line chart for daily spend trends with weekend highlighting and
 * master-account annotations.
 *
 * Matched by chart.type === 'line' when data has `dates` and `totals`.
 */
export function buildLineTrendOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.dates || !data?.totals) return null

  const baseOptions = createBaseChartOptions()
  const hasEnhancedData = data.weekendData && data.firstOfMonthData && data.masterAccountData

  // Create weekend highlighting as background markArea (vertical bands)
  const weekendMarkAreas: any[] = []
  if (hasEnhancedData) {
    let weekendStart = -1
    data.weekendData.forEach((isWeekend: boolean, index: number) => {
      if (isWeekend && weekendStart === -1) {
        weekendStart = index
      } else if (!isWeekend && weekendStart !== -1) {
        weekendMarkAreas.push([
          { xAxis: weekendStart - 0.4, yAxis: 'min' },
          { xAxis: index - 1 + 0.4, yAxis: 'max' }
        ])
        weekendStart = -1
      }
    })

    // Handle case where data ends on a weekend
    if (weekendStart !== -1) {
      weekendMarkAreas.push([
        { xAxis: weekendStart - 0.4, yAxis: 'min' },
        { xAxis: data.weekendData.length - 1 + 0.4, yAxis: 'max' }
      ])
    }
  }

  // Create master account annotations for first of month
  const masterAccountAnnotations: any[] = []
  if (hasEnhancedData) {
    data.firstOfMonthData.forEach((isFirst: boolean, index: number) => {
      if (isFirst && data.masterAccountData[index] > 50000) {
        masterAccountAnnotations.push({
          type: 'line',
          xAxis: index,
          label: {
            show: true,
            formatter: '💳 Master Account\nEnterprise Support',
            position: 'insideEndTop',
            color: '#fbbf24',
            fontSize: 10,
            backgroundColor: 'rgba(0,0,0,0.8)',
            borderColor: '#fbbf24',
            borderWidth: 1,
            borderRadius: 4,
            padding: [4, 8]
          },
          lineStyle: {
            color: '#fbbf24',
            type: 'dashed',
            width: 2
          }
        })
      }
    })
  }

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        if (Array.isArray(params)) params = params[0]
        const index = params.dataIndex
        const value = formatCurrency(params.value)
        const date = new Date(data.dates[index])

        let tooltip = `${params.name}<br/>Total Spend: ${value}`

        // Add weekend indicator
        if (hasEnhancedData && data.weekendData[index]) {
          const dayName = date.getDay() === 0 ? 'Sunday' : 'Saturday'
          tooltip += `<br/><span style="color: #8b5cf6">🗓️ Weekend (${dayName})</span>`
        }

        // Add master account info for first of month
        if (hasEnhancedData && data.firstOfMonthData[index] && data.masterAccountData[index] > 50000) {
          tooltip += `<br/><span style="color: #fbbf24">💳 Master Account: ${formatCurrency(data.masterAccountData[index])}</span>`
          tooltip += `<br/><span style="color: #fbbf24">   (Enterprise Support + Savings Plans)</span>`
        }

        return tooltip
      }
    },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        rotate: 45,
        fontSize: 10,
        formatter: (value: string, index: number) => {
          const date = new Date(value)
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const dayOfWeek = dayNames[date.getDay()]
          const shortDate = value.substring(5) // Remove year (YYYY-MM-DD -> MM-DD)
          const label = `${shortDate}\n${dayOfWeek}`

          if (hasEnhancedData && data.weekendData[index]) {
            return `{weekend|${label}}`
          }
          return `{normal|${label}}`
        },
        rich: {
          weekend: {
            color: '#8b5cf6',
            fontWeight: 'bold',
            backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderRadius: 3,
            padding: [2, 4]
          },
          normal: {
            color: CHART_THEME.axisLabel
          }
        }
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
        name: 'Total Spend',
        type: 'line',
        data: data.totals,
        smooth: true,
        lineStyle: {
          color: '#3b82f6',
          width: 2
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(59, 130, 246, 0.4)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
            ]
          }
        },
        itemStyle: {
          color: (params: any) => {
            if (hasEnhancedData && data.weekendData[params.dataIndex]) {
              return '#8b5cf6'
            }
            if (hasEnhancedData && data.firstOfMonthData[params.dataIndex] &&
              data.masterAccountData[params.dataIndex] > 50000) {
              return '#fbbf24'
            }
            return '#3b82f6'
          }
        },
        markArea: weekendMarkAreas.length > 0 ? {
          silent: true,
          itemStyle: {
            color: 'rgba(139, 92, 246, 0.12)',
            borderWidth: 0,
            opacity: 0.6
          },
          emphasis: {
            disabled: true
          },
          data: weekendMarkAreas,
          z: -1
        } : undefined,
        markLine: masterAccountAnnotations.length > 0 ? {
          silent: false,
          data: masterAccountAnnotations
        } : undefined
      }
    ]
  }
}
