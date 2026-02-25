export interface ChartBuilderContext {
  showRegressionLine?: boolean
  selectedYearView?: 'current' | 'next'
}

export type ChartBuilderFn = (data: any, context: ChartBuilderContext) => Record<string, any> | null

/**
 * Simple linear regression calculation used by budget variance analysis.
 * Returns slope, intercept, and R-squared for the given data points.
 */
export function calculateLinearRegression(data: Array<{ budgetedCost: number; actualCost: number }>) {
  const n = data.length
  if (n < 2) return null

  const sumX = data.reduce((sum, item) => sum + item.budgetedCost, 0)
  const sumY = data.reduce((sum, item) => sum + item.actualCost, 0)
  const sumXY = data.reduce((sum, item) => sum + (item.budgetedCost * item.actualCost), 0)
  const sumXX = data.reduce((sum, item) => sum + (item.budgetedCost * item.budgetedCost), 0)

  const denominator = n * sumXX - sumX * sumX
  if (Math.abs(denominator) < 1e-10) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n

  // Calculate R-squared
  const meanY = sumY / n
  const totalSumSquares = data.reduce((sum, item) => sum + Math.pow(item.actualCost - meanY, 2), 0)
  const residualSumSquares = data.reduce((sum, item) => {
    const predicted = slope * item.budgetedCost + intercept
    return sum + Math.pow(item.actualCost - predicted, 2)
  }, 0)
  const rSquared = Math.abs(totalSumSquares) < 1e-10 ? 0 : 1 - (residualSumSquares / totalSumSquares)

  return { slope, intercept, rSquared }
}
