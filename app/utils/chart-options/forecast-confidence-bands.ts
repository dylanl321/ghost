import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'

/**
 * Forecast with Confidence Bands – line chart with upper/lower confidence area.
 * Matched by chart.id === 'forecastConfidenceBands'.
 */
export function buildForecastConfidenceBandsOptions(data: any, _context: ChartBuilderContext): any {
  if (!data?.dates || !data?.forecastLine) return null

  const baseOptions = createBaseChartOptions()
  const series: any[] = []

  // Only add confidence bands if we have real data from API
  if (data.upperConfidence && data.lowerConfidence) {
    series.push(
      {
        name: 'Upper Confidence',
        type: 'line',
        data: data.upperConfidence,
        lineStyle: { opacity: 0 },
        stack: 'confidence',
        symbol: 'none'
      },
      {
        name: 'Lower Confidence',
        type: 'line',
        data: data.lowerConfidence,
        lineStyle: { opacity: 0 },
        areaStyle: {
          color: 'rgba(16, 185, 129, 0.1)'
        },
        stack: 'confidence',
        symbol: 'none'
      }
    )
  }

  // Always add the forecast line
  series.push({
    name: 'Forecast',
    type: 'line',
    data: data.forecastLine,
    lineStyle: { color: '#10b981', width: 3 },
    symbol: 'circle'
  })

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const date = params[0].name
        let result = `${date}<br/>`

        const forecastParam = params.find((p: any) => p.seriesName === 'Forecast')
        if (forecastParam) {
          result += `Forecast: ${formatCurrency(forecastParam.value)}<br/>`
        }

        // Only show confidence bands if they exist
        if (data.confidenceLevel) {
          const upperParam = params.find((p: any) => p.seriesName === 'Upper Confidence')
          const lowerParam = params.find((p: any) => p.seriesName === 'Lower Confidence')
          if (upperParam) result += `Upper Bound: ${formatCurrency(upperParam.value)}<br/>`
          if (lowerParam) result += `Lower Bound: ${formatCurrency(lowerParam.value)}`
        }

        return result
      }
    },
    xAxis: {
      type: 'category',
      data: data.dates,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: { color: CHART_THEME.axisLabel }
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
    series
  }
}
