import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Organization Forecast Comparison – daily spend bars + cumulative lines + forecast.
 * Matched by chart.id === 'organizationForecastComparison'.
 */
export function buildOrganizationForecastComparisonOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.series || !data?.dates) return null
  if (data.series.length < 5) return null

  const baseOptions = createBaseChartOptions()

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const dateIndex = params[0].dataIndex
        const date = data.dates[dateIndex]
        let result = `${date}<br/>`

        params.forEach((param: any) => {
          if (param.value !== 0 && param.value !== null) {
            result += `${param.seriesName}: ${formatCurrency(param.value)}<br/>`
          }
        })

        // Add metadata if we're at current day
        if (data.metadata && dateIndex === data.metadata.currentDay - 1) {
          result += `<br/><b>Today (Day ${data.metadata.currentDay})</b><br/>`
          result += `Avg Daily Actual: ${formatCurrency(data.metadata.avgDailyActual)}<br/>`
          result += `Avg Daily Forecast: ${formatCurrency(data.metadata.avgDailyForecast)}<br/>`
          result += `Progress: ${data.metadata.percentThroughMonth.toFixed(1)}% of month`
        }

        return result
      }
    },
    legend: {
      data: ['Actual Daily Spend', 'AWS Projection', 'Cumulative Actual', 'Cumulative AWS Projection', 'GDMS Forecasted Costs'],
      textStyle: { color: CHART_THEME.textColor },
      top: 10
    },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        interval: 'auto',
        rotate: 45
      },
      splitLine: {
        show: true,
        interval: (index: number) => {
          return data.metadata && index === data.metadata.currentDay - 1
        },
        lineStyle: {
          color: SEMANTIC_COLORS.annotation,
          type: 'dashed',
          width: 2
        }
      }
    },
    yAxis: [
      {
        type: 'value',
        name: 'Daily Spend',
        position: 'left',
        axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
        axisLabel: {
          color: CHART_THEME.axisLabel,
          formatter: (value: number) => formatCurrency(value)
        },
        splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
      },
      {
        type: 'value',
        name: 'Cumulative',
        position: 'right',
        axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
        axisLabel: {
          color: CHART_THEME.axisLabel,
          formatter: (value: number) => formatCurrency(value)
        },
        splitLine: { show: false }
      }
    ],
    series: [
      {
        name: 'Actual Daily Spend',
        type: 'bar',
        yAxisIndex: 0,
        data: data.series[0].data,
        itemStyle: { color: SEMANTIC_COLORS.primary },
        barWidth: '40%'
      },
      {
        name: 'AWS Projection',
        type: 'bar',
        yAxisIndex: 0,
        data: data.series[1].data,
        itemStyle: {
          color: SEMANTIC_COLORS.forecast,
          opacity: 0.7
        },
        barWidth: '40%'
      },
      {
        name: 'Cumulative Actual',
        type: 'line',
        yAxisIndex: 1,
        data: data.series[2].data,
        smooth: true,
        lineStyle: {
          color: SEMANTIC_COLORS.primary,
          width: 3
        },
        symbol: 'circle',
        symbolSize: 4
      },
      {
        name: 'Cumulative AWS Projection',
        type: 'line',
        yAxisIndex: 1,
        data: data.series[3].data,
        smooth: true,
        lineStyle: {
          color: SEMANTIC_COLORS.forecast,
          width: 2,
          type: 'dashed'
        },
        symbol: 'none'
      },
      {
        name: 'GDMS Forecasted Costs',
        type: 'line',
        yAxisIndex: 1,
        data: data.series[4].data,
        lineStyle: {
          color: SEMANTIC_COLORS.warning,
          width: 2,
          type: 'dotted'
        },
        symbol: 'none'
      }
    ]
  }
}
