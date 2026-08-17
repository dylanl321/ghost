import { createBaseChartOptions, CHART_THEME, SEMANTIC_COLORS } from '~/utils/chart-theme'
import { formatCurrency } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'
import { getCurrentMonthForecastRemainder } from '~/utils/year-end-projection'

/**
 * Year-End Forecast with Actuals – the most complex chart.
 * Shows stacked bars (actual + forecast) with confidence bands and budget lines.
 * Uses `context.selectedYearView` to toggle between current and next year.
 * Matched by chart.id === 'yearEndForecast'.
 */
export function buildYearEndForecastOptions(data: any, context: ChartBuilderContext): any {
  if (!data) return null

  const baseOptions = createBaseChartOptions()
  const selectedYearView = context.selectedYearView || 'current'

  // Handle new data structure with currentYear and nextYear
  const yearData = selectedYearView === 'current' ? data.currentYear : data.nextYear

  if (!yearData?.months || !yearData?.series?.length) {
    return null
  }

  const series: any[] = []
  const isNextYear = selectedYearView === 'next'
  const currentMonthIndex = yearData.metadata?.currentMonth ? yearData.metadata.currentMonth - 1 : -1

  // Check if we have confidence bands (only for current year)
  const hasConfidenceBands = selectedYearView === 'current' &&
    yearData.confidenceBands?.upper &&
    yearData.confidenceBands.upper.some((v: any) => v !== null)

  // Add confidence band area using stacked area approach
  if (hasConfidenceBands) {
    const areaData = yearData.confidenceBands.lower.map((lower: number | null, idx: number) => {
      const upper = yearData.confidenceBands.upper[idx]
      if (lower !== null && upper !== null) {
        return upper - lower
      }
      return null
    })

    // Lower bound line (base of the confidence area)
    series.push({
      name: 'Confidence Lower',
      type: 'line',
      data: yearData.confidenceBands.lower,
      lineStyle: { opacity: 0 },
      symbol: 'none',
      stack: 'confidence',
      z: 0
    })

    // Confidence band (stacked on top of lower bound)
    series.push({
      name: '80% Confidence Band',
      type: 'line',
      data: areaData,
      lineStyle: { opacity: 0 },
      areaStyle: {
        color: 'rgba(16, 185, 129, 0.15)'
      },
      stack: 'confidence',
      symbol: 'none',
      z: 0
    })
  }

  // Build stacked bars for actual and forecast (or simple bars for estimates)
  if (isNextYear) {
    // Next year: AWS projection bars (green)
    series.push({
      name: 'AWS Projection',
      type: 'bar',
      data: yearData.series[0].data,
      itemStyle: {
        color: SEMANTIC_COLORS.forecast,
        opacity: 0.9,
        borderRadius: [4, 4, 0, 0]
      },
      barWidth: '60%',
      z: 2
    })
  } else {
    // Current year: stacked bars for actual + forecast
    const actualBars = yearData.series[0].data.map((val: number | null) => val)

    const forecastBars = yearData.series[1].data.map((val: number | null, idx: number) => {
      // For current month, show forecast remainder
      if (idx === currentMonthIndex && val !== null && actualBars[idx] !== null) {
        return getCurrentMonthForecastRemainder(val, actualBars[idx])
      }
      return val
    })

    // Actual costs (blue bars)
    series.push({
      name: 'Actual',
      type: 'bar',
      stack: 'total',
      data: actualBars,
      itemStyle: {
        color: SEMANTIC_COLORS.primary,
        borderRadius: [0, 0, 0, 0]
      },
      barWidth: '60%',
      z: 2
    })

    // AWS Projection (green bars, stacked on top)
    series.push({
      name: 'AWS Projection',
      type: 'bar',
      stack: 'total',
      data: forecastBars,
      itemStyle: {
        color: SEMANTIC_COLORS.forecast,
        opacity: 0.8,
        borderRadius: [4, 4, 0, 0]
      },
      barWidth: '60%',
      z: 2
    })
  }

  // Add Budget line if budget data is available
  if (yearData.budget && yearData.budget.annual > 0) {
    const isPepData = yearData.budget.isPepData
    const budgetLineData = yearData.budget.monthlyArray || Array(12).fill(yearData.budget.monthly)

    const budgetLineName = isPepData ? 'PEP Budget' : 'GDMS Forecasted Costs'
    const budgetLineColor = isPepData ? 'rgba(168, 85, 247, 0.7)' : 'rgba(245, 158, 11, 0.6)'
    const budgetLineColorSolid = isPepData ? '#a855f7' : SEMANTIC_COLORS.warning

    series.push({
      name: budgetLineName,
      type: 'line',
      data: budgetLineData,
      lineStyle: {
        color: budgetLineColor,
        width: 2,
        type: 'dashed'
      },
      symbol: 'circle',
      symbolSize: 4,
      itemStyle: {
        color: budgetLineColorSolid
      },
      z: 4,
      emphasis: {
        lineStyle: {
          color: budgetLineColorSolid,
          width: 3
        }
      }
    })
  }

  // Calculate year total for subtitle
  const yearTotal = yearData.metadata?.yearTotal || yearData.metadata?.projectedTotal || 0
  const yearTotalFormatted = formatCurrency(yearTotal, { showCents: false })

  // Build title with budget info if available
  let titleText = isNextYear
    ? `${yearData.year} Projected Total: ${yearTotalFormatted}`
    : `Projected Year Total: ${yearTotalFormatted}`

  if (yearData.budget && yearData.budget.annual > 0) {
    const annualBudget = formatCurrency(yearData.budget.annual, { showCents: false })
    const percentOfBudget = ((yearTotal / yearData.budget.annual) * 100).toFixed(0)
    const budgetLabel = yearData.budget.isPepData ? 'PEP Budget' : 'GDMS Forecast'
    titleText += ` | ${budgetLabel}: ${annualBudget} (${percentOfBudget}%)`
  }

  // Add note for next year if only partial data
  if (isNextYear && yearData.metadata?.monthsWithData) {
    const monthsCount = yearData.metadata.monthsWithData
    if (monthsCount < 12) {
      titleText += ` (${monthsCount} months)`
    }
  }

  return {
    ...baseOptions,
    title: {
      text: titleText,
      textStyle: {
        color: SEMANTIC_COLORS.white,
        fontSize: 14,
        fontWeight: 'bold'
      },
      left: 'center',
      top: 5
    },
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'axis',
      formatter: (params: any) => {
        const monthIndex = params[0].dataIndex
        const month = params[0].name
        const currentMonthIdx = yearData.metadata?.currentMonth ? yearData.metadata.currentMonth - 1 : -1
        let result = `<b>${month} ${yearData.year}</b><br/>`

        if (isNextYear) {
          const forecastVal = yearData.series[0].data[monthIndex]
          if (forecastVal !== null) {
            result += `<span style="color: #10b981">● AWS Projection: ${formatCurrency(forecastVal)}</span><br/>`
          } else {
            result += `<span style="color: #6b7280">○ No AWS forecast available</span><br/>`
            result += `<span style="color: #9ca3af; font-size: 11px;">  (Forecasts extend 12 months from today)</span><br/>`
          }
        } else {
          const actualVal = yearData.series[0].data[monthIndex]
          const forecastVal = yearData.series[1].data[monthIndex]

          if (monthIndex < currentMonthIdx) {
            if (actualVal !== null) {
              result += `<span style="color: #3b82f6">● Actual: ${formatCurrency(actualVal)}</span><br/>`
            }
          } else if (monthIndex === currentMonthIdx) {
            if (actualVal !== null) {
              result += `<span style="color: #3b82f6">● Actual (MTD): ${formatCurrency(actualVal)}</span><br/>`
            }
            if (forecastVal !== null) {
              result += `<span style="color: #10b981">● Projected Month-End: ${formatCurrency(forecastVal)}</span><br/>`
              if (actualVal !== null) {
                const remainder = forecastVal - actualVal
                result += `<span style="color: #6ee7b7">  └─ Remaining: ${formatCurrency(remainder)}</span><br/>`
              }
            }
          } else {
            if (forecastVal !== null) {
              result += `<span style="color: #10b981">● Forecast: ${formatCurrency(forecastVal)}</span><br/>`
            }

            // Show confidence band if available
            if (hasConfidenceBands) {
              const lower = yearData.confidenceBands.lower[monthIndex]
              const upper = yearData.confidenceBands.upper[monthIndex]
              if (lower !== null && upper !== null) {
                result += `<span style="color: #6ee7b7">▬ 80% Range: ${formatCurrency(lower)} - ${formatCurrency(upper)}</span><br/>`
              }
            }
          }
        }

        // Show Budget line for all months
        if (yearData.budget && yearData.budget.annual > 0) {
          const isPepData = yearData.budget.isPepData
          const budgetLabel = isPepData ? 'PEP Budget' : 'GDMS Forecasted Costs'
          const budgetColor = isPepData ? '#a855f7' : '#f59e0b'
          const monthBudgetValue = yearData.budget.monthlyArray?.[monthIndex] ?? yearData.budget.monthly

          result += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1);">`
          result += `<span style="color: ${budgetColor}; font-weight: 500;">⚊ ${budgetLabel}: ${formatCurrency(monthBudgetValue)}/month</span>`
          result += `</div>`
        }

        // Show disclaimer for next year estimates
        if (isNextYear && yearData.metadata?.disclaimer) {
          result += `<div style="margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); font-size: 11px;">`
          result += `<span style="color: #9ca3af; font-style: italic;">${yearData.metadata.disclaimer}</span>`
          result += `</div>`
        }

        return result
      }
    },
    legend: {
      data: isNextYear
        ? [
          'AWS Projection',
          ...(yearData.budget && yearData.budget.annual > 0 ? [yearData.budget.isPepData ? 'PEP Budget' : 'GDMS Forecasted Costs'] : [])
        ]
        : [
          'Actual',
          'AWS Projection',
          ...(yearData.budget && yearData.budget.annual > 0 ? [yearData.budget.isPepData ? 'PEP Budget' : 'GDMS Forecasted Costs'] : []),
          ...(hasConfidenceBands ? ['80% Confidence Band'] : [])
        ],
      textStyle: { color: CHART_THEME.textColor, fontSize: 11 },
      top: 35,
      itemGap: 15,
      itemWidth: 25,
      itemHeight: 14
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '10%',
      top: '20%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: yearData.months,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        fontSize: 11
      },
      axisTick: {
        alignWithLabel: true
      },
      boundaryGap: true,
      splitLine: {
        show: !isNextYear,
        interval: (index: number) => {
          return !isNextYear && yearData.metadata?.currentMonth && index === yearData.metadata.currentMonth - 1
        },
        lineStyle: {
          color: SEMANTIC_COLORS.annotation,
          type: 'dashed',
          width: 2
        }
      }
    },
    yAxis: {
      type: 'value',
      name: 'Monthly Cost',
      nameTextStyle: {
        color: CHART_THEME.textColor,
        fontSize: 12
      },
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
