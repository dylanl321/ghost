/**
 * Chart options builder registry.
 *
 * Maps chart IDs and chart types to their respective builder functions so that
 * `ChartsRenderer.vue` can look up the correct builder at runtime instead of
 * using a giant if/else chain.
 */

export type { ChartBuilderContext, ChartBuilderFn } from './types'
export { calculateLinearRegression } from './types'

// ---- id-specific builders ------------------------------------------------
import { buildBudgetUtilizationOptions } from './budget-utilization'
import { buildLobTrendComparisonOptions } from './lob-trend-comparison'
import { buildDepartmentTrendComparisonOptions } from './department-trend-comparison'
import { buildLobComparisonOptions } from './lob-comparison'
import { buildDepartmentBudgetPerformanceOptions } from './department-budget-performance'
import { buildCostGrowthRateOptions } from './cost-growth-rate'
import { buildServiceCostDistributionOptions } from './service-cost-distribution'
import { buildBudgetVarianceAnalysisOptions } from './budget-variance-analysis'
import { buildCostOptimizationOpportunitiesOptions } from './cost-optimization-opportunities'
import { buildAccountRiskAssessmentOptions } from './account-risk-assessment'
import { buildHistoricalMonthlyTrendOptions } from './historical-monthly-trend'
import { buildHistoricalComparisonOptions } from './historical-comparison'
import { buildBillableVsProformaOptions } from './billable-vs-proforma'
import { buildCurrentVsForecastComparisonOptions } from './current-vs-forecast-comparison'
import { buildOrganizationForecastComparisonOptions } from './organization-forecast-comparison'
import { buildMonthlyTrendWithForecastOptions } from './monthly-trend-with-forecast'
import { buildAccountForecastComparisonOptions } from './account-forecast-comparison'
import { buildHistoricalVsForecastComparisonOptions } from './historical-vs-forecast-comparison'
import { buildExtendedForecastTrendOptions } from './extended-forecast-trend'
import { buildForecastProjectionLineOptions } from './forecast-projection-line'
import { buildCumulativeBurnUpOptions } from './cumulative-burn-up'
import { buildBudgetSCurveOptions } from './budget-s-curve'
import { buildScenarioOverlayOptions } from './scenario-overlay'
import { buildForecastConfidenceBandsOptions } from './forecast-confidence-bands'
import { buildYearOverYearComparisonOptions } from './year-over-year-comparison'
import { buildMonthOverMonthComparisonOptions } from './month-over-month-comparison'
import { buildLast24MonthsTrendOptions } from './last-24-months-trend'
import { buildYearEndForecastOptions } from './year-end-forecast'
import { buildServiceCostVarianceOptions } from './service-cost-variance'

// ---- type-fallback builders -----------------------------------------------
import { buildLineTrendOptions } from './line-trend'
import { buildPieOptions } from './pie'
import { buildBarOptions } from './bar'
import { buildGaugeOptions } from './gauge'
import { buildDonutOptions } from './donut'
import { buildTreemapOptions } from './treemap'

import type { ChartBuilderFn } from './types'

// ---------------------------------------------------------------------------
// Registry maps
// ---------------------------------------------------------------------------

/** Builders keyed by `chart.id` – tried first for an exact match. */
export const chartBuilderById: Record<string, ChartBuilderFn> = {
  budgetUtilization: buildBudgetUtilizationOptions,
  lobTrendComparison: buildLobTrendComparisonOptions,
  departmentTrendComparison: buildDepartmentTrendComparisonOptions,
  lobComparison: buildLobComparisonOptions,
  departmentBudgetPerformance: buildDepartmentBudgetPerformanceOptions,
  costGrowthRate: buildCostGrowthRateOptions,
  serviceCostDistribution: buildServiceCostDistributionOptions,
  budgetVarianceAnalysis: buildBudgetVarianceAnalysisOptions,
  costOptimizationOpportunities: buildCostOptimizationOpportunitiesOptions,
  accountRiskAssessment: buildAccountRiskAssessmentOptions,
  historicalMonthlyTrend: buildHistoricalMonthlyTrendOptions,
  historicalComparison: buildHistoricalComparisonOptions,
  billableVsProforma: buildBillableVsProformaOptions,
  currentVsForecastComparison: buildCurrentVsForecastComparisonOptions,
  organizationForecastComparison: buildOrganizationForecastComparisonOptions,
  monthlyTrendWithForecast: buildMonthlyTrendWithForecastOptions,
  accountForecastComparison: buildAccountForecastComparisonOptions,
  historicalVsForecastComparison: buildHistoricalVsForecastComparisonOptions,
  extendedForecastTrend: buildExtendedForecastTrendOptions,
  forecastProjectionLine: buildForecastProjectionLineOptions,
  cumulativeBurnUp: buildCumulativeBurnUpOptions,
  budgetSCurve: buildBudgetSCurveOptions,
  scenarioOverlay: buildScenarioOverlayOptions,
  forecastConfidenceBands: buildForecastConfidenceBandsOptions,
  yearOverYearComparison: buildYearOverYearComparisonOptions,
  monthOverMonthComparison: buildMonthOverMonthComparisonOptions,
  last24MonthsTrend: buildLast24MonthsTrendOptions,
  yearEndForecast: buildYearEndForecastOptions,
  serviceCostVariance: buildServiceCostVarianceOptions,
}

/** Builders keyed by `chart.type` – used as a fallback when no id match is found. */
export const chartBuilderByType: Record<string, ChartBuilderFn> = {
  line: buildLineTrendOptions,
  pie: buildPieOptions,
  bar: buildBarOptions,
  gauge: buildGaugeOptions,
  donut: buildDonutOptions,
  treemap: buildTreemapOptions,
}
