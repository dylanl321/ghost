/**
 * Variance Calculator for GDMS Forecasts and AWS Projections
 * 
 * Provides comprehensive variance tracking across historical, current, and future periods
 * to compare actual costs against both GDMS forecasts and AWS ML projections.
 */

export interface VarianceData {
  actual: number
  gdmsForecast: number
  mlProjection: number
  gdmsVariance: number
  projectionVariance: number
  gdmsVariancePercent: number
  projectionVariancePercent: number
}

export interface MonthlyVarianceData {
  month: string
  actual: number
  gdmsForecast: number
  mlProjection: number
  gdmsVariance: number
  projectionVariance: number
  gdmsVariancePercent: number
  projectionVariancePercent: number
  status: 'over' | 'under' | 'on_target'
}

export interface YearEndVarianceData {
  ytdActual: number
  ytdGDMSForecast: number
  ytdMLProjection: number
  yearEndMLProjection: number
  yearEndGDMSForecast: number
  ytdGDMSVariance: number
  ytdProjectionVariance: number
  yearEndVariance: number
  yearEndVariancePercent: number
}

export interface AccountVarianceData {
  accountId: string
  accountName: string
  actual: number
  gdmsForecast: number
  mlProjection: number
  gdmsVariance: number
  projectionVariance: number
  gdmsVariancePercent: number
  projectionVariancePercent: number
  status: 'over' | 'under' | 'on_target'
}

/**
 * Calculate YTD variance between actual costs and GDMS forecast
 */
export function calculateYTDVariance(
  ytdActual: number,
  ytdGDMSForecast: number,
  ytdMLProjection: number
): VarianceData {
  const gdmsVariance = ytdActual - ytdGDMSForecast
  const projectionVariance = ytdActual - ytdMLProjection
  const gdmsVariancePercent = ytdGDMSForecast > 0 ? (gdmsVariance / ytdGDMSForecast) * 100 : 0
  const projectionVariancePercent = ytdMLProjection > 0 ? (projectionVariance / ytdMLProjection) * 100 : 0

  return {
    actual: ytdActual,
    gdmsForecast: ytdGDMSForecast,
    mlProjection: ytdMLProjection,
    gdmsVariance,
    projectionVariance,
    gdmsVariancePercent,
    projectionVariancePercent
  }
}

/**
 * Calculate monthly variance for a specific month
 */
export function calculateMonthlyVariance(
  month: string,
  actual: number,
  gdmsForecast: number,
  mlProjection: number,
  tolerance: number = 10
): MonthlyVarianceData {
  const gdmsVariance = actual - gdmsForecast
  const projectionVariance = actual - mlProjection
  const gdmsVariancePercent = gdmsForecast > 0 ? (gdmsVariance / gdmsForecast) * 100 : 0
  const projectionVariancePercent = mlProjection > 0 ? (projectionVariance / mlProjection) * 100 : 0

  // Determine status based on GDMS forecast variance
  let status: 'over' | 'under' | 'on_target' = 'on_target'
  if (gdmsForecast === 0) {
    status = actual > 0 ? 'over' : 'on_target'
  } else {
    if (gdmsVariancePercent > tolerance) status = 'over'
    else if (gdmsVariancePercent < -tolerance) status = 'under'
  }

  return {
    month,
    actual,
    gdmsForecast,
    mlProjection,
    gdmsVariance,
    projectionVariance,
    gdmsVariancePercent,
    projectionVariancePercent,
    status
  }
}

/**
 * Calculate year-end variance projections
 */
export function calculateYearEndVariance(
  ytdActual: number,
  ytdGDMSForecast: number,
  ytdMLProjection: number,
  yearEndMLProjection: number,
  yearEndGDMSForecast: number
): YearEndVarianceData {
  const ytdGDMSVariance = ytdActual - ytdGDMSForecast
  const ytdProjectionVariance = ytdActual - ytdMLProjection
  const yearEndVariance = yearEndMLProjection - yearEndGDMSForecast
  const yearEndVariancePercent = yearEndGDMSForecast > 0 ? (yearEndVariance / yearEndGDMSForecast) * 100 : 0

  return {
    ytdActual,
    ytdGDMSForecast,
    ytdMLProjection,
    yearEndMLProjection,
    yearEndGDMSForecast,
    ytdGDMSVariance,
    ytdProjectionVariance,
    yearEndVariance,
    yearEndVariancePercent
  }
}

/**
 * Calculate account-level variance
 */
export function calculateAccountVariance(
  accountId: string,
  accountName: string,
  actual: number,
  gdmsForecast: number,
  mlProjection: number,
  tolerance: number = 10
): AccountVarianceData {
  const gdmsVariance = actual - gdmsForecast
  const projectionVariance = actual - mlProjection
  const gdmsVariancePercent = gdmsForecast > 0 ? (gdmsVariance / gdmsForecast) * 100 : 0
  const projectionVariancePercent = mlProjection > 0 ? (projectionVariance / mlProjection) * 100 : 0

  // Determine status based on GDMS forecast variance
  let status: 'over' | 'under' | 'on_target' = 'on_target'
  if (gdmsForecast === 0) {
    status = actual > 0 ? 'over' : 'on_target'
  } else {
    if (gdmsVariancePercent > tolerance) status = 'over'
    else if (gdmsVariancePercent < -tolerance) status = 'under'
  }

  return {
    accountId,
    accountName,
    actual,
    gdmsForecast,
    mlProjection,
    gdmsVariance,
    projectionVariance,
    gdmsVariancePercent,
    projectionVariancePercent,
    status
  }
}

/**
 * Calculate comprehensive variance analysis for all periods
 */
export function calculateComprehensiveVariance(
  historicalData: Array<{ month: string; actual: number; gdmsForecast: number; mlProjection: number }>,
  currentMonthData: { actual: number; gdmsForecast: number; mlProjection: number },
  yearEndProjections: { mlProjection: number; gdmsForecast: number },
  tolerance: number = 10
) {
  // Calculate YTD totals
  const ytdActual = historicalData.reduce((sum, data) => sum + data.actual, 0) + currentMonthData.actual
  const ytdGDMSForecast = historicalData.reduce((sum, data) => sum + data.gdmsForecast, 0) + currentMonthData.gdmsForecast
  const ytdMLProjection = historicalData.reduce((sum, data) => sum + data.mlProjection, 0) + currentMonthData.mlProjection

  // Calculate monthly variances
  const monthlyVariances = historicalData.map(data => 
    calculateMonthlyVariance(data.month, data.actual, data.gdmsForecast, data.mlProjection, tolerance)
  )

  // Add current month variance
  const currentMonthVariance = calculateMonthlyVariance(
    new Date().toISOString().slice(0, 7), // YYYY-MM format
    currentMonthData.actual,
    currentMonthData.gdmsForecast,
    currentMonthData.mlProjection,
    tolerance
  )
  monthlyVariances.push(currentMonthVariance)

  // Calculate YTD variance
  const ytdVariance = calculateYTDVariance(ytdActual, ytdGDMSForecast, ytdMLProjection)

  // Calculate year-end variance
  const yearEndVariance = calculateYearEndVariance(
    ytdActual,
    ytdGDMSForecast,
    ytdMLProjection,
    yearEndProjections.mlProjection,
    yearEndProjections.gdmsForecast
  )

  return {
    ytd: ytdVariance,
    monthly: monthlyVariances,
    yearEnd: yearEndVariance,
    summary: {
      totalActual: ytdActual,
      totalGDMSForecast: ytdGDMSForecast,
      totalMLProjection: ytdMLProjection,
      yearEndMLProjection: yearEndProjections.mlProjection,
      yearEndGDMSForecast: yearEndProjections.gdmsForecast,
      overallGDMSVariance: ytdVariance.gdmsVariance,
      overallProjectionVariance: ytdVariance.projectionVariance,
      yearEndVariance: yearEndVariance.yearEndVariance
    }
  }
}

/**
 * Generate variance insights and recommendations
 */
export function generateVarianceInsights(varianceData: any) {
  const insights = []
  const recommendations = []

  // YTD Analysis
  if (varianceData.ytd.gdmsVariancePercent > 10) {
    insights.push({
      type: 'warning',
      message: `YTD costs are ${varianceData.ytd.gdmsVariancePercent.toFixed(1)}% over GDMS forecast`,
      impact: 'high'
    })
    recommendations.push({
      type: 'cost_control',
      message: 'Review spending patterns and consider cost optimization measures',
      priority: 'high'
    })
  } else if (varianceData.ytd.gdmsVariancePercent < -10) {
    insights.push({
      type: 'info',
      message: `YTD costs are ${Math.abs(varianceData.ytd.gdmsVariancePercent).toFixed(1)}% under GDMS forecast`,
      impact: 'medium'
    })
    recommendations.push({
      type: 'forecast_adjustment',
      message: 'Consider updating GDMS forecast to reflect actual spending patterns',
      priority: 'medium'
    })
  }

  // Year-end Projection Analysis
  if (varianceData.yearEnd.yearEndVariancePercent > 15) {
    insights.push({
      type: 'alert',
      message: `Year-end projection is ${varianceData.yearEnd.yearEndVariancePercent.toFixed(1)}% over GDMS forecast`,
      impact: 'critical'
    })
    recommendations.push({
      type: 'budget_review',
      message: 'Immediate budget review required - consider additional funding or cost reduction',
      priority: 'critical'
    })
  }

  // Monthly Trend Analysis
  const recentMonths = varianceData.monthly.slice(-3) // Last 3 months
  const overForecastMonths = recentMonths.filter((month: any) => month.status === 'over').length
  
  if (overForecastMonths >= 2) {
    insights.push({
      type: 'trend',
      message: 'Consistent over-forecast spending in recent months',
      impact: 'high'
    })
    recommendations.push({
      type: 'process_improvement',
      message: 'Implement monthly budget reviews and spending controls',
      priority: 'high'
    })
  }

  return {
    insights,
    recommendations,
    riskLevel: varianceData.ytd.gdmsVariancePercent > 20 ? 'high' : 
               varianceData.ytd.gdmsVariancePercent > 10 ? 'medium' : 'low'
  }
}


