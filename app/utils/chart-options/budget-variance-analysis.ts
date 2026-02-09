import { createBaseChartOptions, CHART_THEME } from '~/utils/chart-theme'
import { formatCurrency, formatPercent } from '~/utils/formatters'
import type { ChartBuilderContext } from './types'
import { calculateLinearRegression as calcRegression } from './types'

/**
 * Budget Variance Analysis – scatter plot of budgeted vs actual costs.
 * Optionally overlays a linear regression trend line.
 * Matched by chart.id === 'budgetVarianceAnalysis'.
 */
export function buildBudgetVarianceAnalysisOptions(data: any, context: ChartBuilderContext): any {
  if (!Array.isArray(data)) return null

  const baseOptions = createBaseChartOptions()

  const series: any[] = [
    {
      name: 'Accounts',
      type: 'scatter',
      symbolSize: (dataItem: any) => {
        const item = data[dataItem[2]]
        return Math.max(8, Math.min(30, (item.size / 10000) * 10))
      },
      data: data.map((item: any, index: number) => [
        item.budgetedCost,
        item.actualCost,
        index,
        item.accountName
      ]),
      itemStyle: {
        color: (params: any) => {
          const item = data[params.data[2]]
          return item.variancePercent > 20 ? '#ef4444' :
            item.variancePercent > 0 ? '#f59e0b' :
              item.variancePercent > -20 ? '#10b981' :
                '#3b82f6'
        }
      }
    }
  ]

  // Add regression line if enabled
  if (context.showRegressionLine && data.length >= 2) {
    const regression = calcRegression(data)
    if (regression) {
      const minX = Math.min(...data.map((d: any) => d.budgetedCost))
      const maxX = Math.max(...data.map((d: any) => d.budgetedCost))

      const regressionLine = {
        name: `Trend Line (R² = ${regression.rSquared.toFixed(2)})`,
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: [
          [minX, regression.slope * minX + regression.intercept],
          [maxX, regression.slope * maxX + regression.intercept]
        ],
        lineStyle: {
          color: '#8b5cf6',
          width: 2,
          type: 'dashed'
        }
      }

      series.push(regressionLine)
    }
  }

  return {
    ...baseOptions,
    tooltip: {
      ...baseOptions.tooltip,
      trigger: 'item',
      formatter: (params: any) => {
        if (params.seriesName?.includes('Trend Line')) {
          return `${params.seriesName}<br/>Budget vs Actual correlation`
        }
        const item = data[params.data[2]]
        return `${item.accountName}<br/>
                    Budget: ${formatCurrency(item.budgetedCost)}<br/>
                    Actual: ${formatCurrency(item.actualCost)}<br/>
                    Variance: ${formatPercent(item.variancePercent)}<br/>
                    Amount: ${formatCurrency(item.variance)}`
      }
    },
    legend: context.showRegressionLine ? {
      show: true,
      bottom: '2%',
      textStyle: { color: CHART_THEME.textColor }
    } : { show: false },
    xAxis: {
      type: 'value',
      name: 'Budgeted Cost ($K)',
      nameLocation: 'middle',
      nameGap: 30,
      axisLine: { lineStyle: { color: CHART_THEME.axisLine } },
      axisLabel: {
        color: CHART_THEME.axisLabel,
        formatter: (value: number) => formatCurrency(value)
      },
      splitLine: { lineStyle: { color: CHART_THEME.splitLine } }
    },
    yAxis: {
      type: 'value',
      name: 'Actual Cost ($K)',
      nameLocation: 'middle',
      nameGap: 40,
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
