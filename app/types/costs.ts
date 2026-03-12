import type { AWSEnclaveData } from '~~/shared/types/accounts'

export type DataMode = 'billable' | 'proforma'

/** AWS Cost Explorer time period */
export interface AwsTimePeriod {
  Start: string
  End: string
}

/** Single entry from AWS Cost Explorer ResultsByTime array */
export interface AwsResultsByTime {
  TimePeriod?: AwsTimePeriod
  Total?: Record<string, { Amount: string; Unit?: string }>
  Groups?: Array<{
    Keys?: string[]
    Metrics?: Record<string, { Amount: string; Unit?: string }>
  }>
  Estimated?: boolean
}

/** Per-account summary returned by the enhanced-mode summary API */
export interface CostAccountSummary {
  accountId: string
  accountName?: string
  totalCost: number
  budget?: number
  departmentNumber?: string
  linesOfBusiness?: string
  projectName?: string
  environment?: string
  services?: Record<string, number>
}

// API request params
export interface CostsQuery {
  accounts: string[]
  timeframe: string // aligns with UI values like 'thisMonth', 'lastMonth', ...
  mode: DataMode
}

// Shared series point
export interface SeriesPoint {
  date: string // YYYY-MM-DD
  value: number
}

// Summary API response (server/api/costs/summary.get.ts)
// The actual API response is wrapped in { data: ... } by sendSuccess
export interface CostsSummaryItem {
  accountId: string
  accountName?: string
  spend: number
  budget?: number
  forecast?: number
  serviceBreakdown?: Record<string, number>
  tags?: Record<string, string>
  lob?: string
  department?: string
}

export interface CostsSummaryResponse {
  items: CostsSummaryItem[]
  totals: {
    spend: number
    budget?: number
    forecast?: number
  }
  // The actual API response often has these additional fields
  data?: Record<string, unknown> // Wrapped data from sendSuccess
  accounts?: CostAccountSummary[] // Enhanced mode returns accounts array
  summary?: Record<string, unknown> // Summary totals
  rawData?: { resultsByTime?: AwsResultsByTime[] } // Raw AWS response data
  /**
   * Proforma nested data when mode=proforma.
   * Canonical shape: `proforma.resultsByTime` (server-normalized).
   * @deprecated `proforma.rawData.resultsByTime` nesting — kept for backward compat.
   */
  proforma?: CostsSummaryResponse
  billable?: CostsSummaryResponse // Billable nested data when mode=proforma
}

// Historical API response (server/api/costs/historical.get.ts)
export interface CostsHistoricalSeries {
  accountId: string
  series: SeriesPoint[]
}

export interface CostsHistoricalResponse {
  series: CostsHistoricalSeries[]
  data?: Record<string, unknown> // Wrapped data from sendSuccess
  monthlyBreakdown?: Record<string, unknown>[] // Monthly breakdown with account details
  rawData?: { resultsByTime?: AwsResultsByTime[] }
  /**
   * Proforma nested data when mode=proforma.
   * Canonical shape: `proforma.resultsByTime` (server-normalized).
   * @deprecated `proforma.rawData.resultsByTime` nesting — kept for backward compat.
   */
  proforma?: CostsHistoricalResponse
  billable?: CostsHistoricalResponse
}

// Forecast API response (server/api/costs/forecast.get.ts)
export interface CostsForecastSeries {
  accountId: string
  series: SeriesPoint[]
}

export interface CostsForecastResponse {
  series: CostsForecastSeries[]
  data?: Record<string, unknown> // Wrapped data from sendSuccess
  forecast?: Record<string, unknown> // Nested forecast object
  total?: Record<string, unknown> // Total amount object
  forecastResultsByTime?: AwsResultsByTime[] // AWS forecast periods
}

// Analysis API response (server/api/costs/analysis.get.ts)
export interface AnomalyItem {
  date: string
  accountId: string
  delta: number
  reason?: string
}

export interface OptimizationItem {
  accountId: string
  suggestion: string
  estSavings?: number
}

export interface CostsAnalysisResponse {
  anomalies: AnomalyItem[]
  optimizations: OptimizationItem[]
  // The actual API response has these additional fields
  data?: Record<string, unknown> // Wrapped data from sendSuccess
  budgetAnalysis?: {
    byAccount?: Record<string, unknown>[]
    totalBudget?: number
    totalActual?: number
    totalVariance?: number
  }
  monthOverMonth?: Record<string, unknown>
  costTrends?: Record<string, unknown>
}

// Normalized dataset for charts
export interface NormalizedDataset {
  accounts: string[] // Selected account IDs
  accountsList?: AWSEnclaveData[] // Full account objects with metadata for LOB/Department mapping
  mode: DataMode // Current mode (billable or proforma)
  timeframe: string // Selected timeframe (thisMonth, lastMonth, etc.)
  summary: CostsSummaryResponse | null
  historical: CostsHistoricalResponse | null
  orgWideHistorical?: CostsHistoricalResponse | null // Unfiltered historical data for contextual charts
  currentMonthOrgWide?: CostsSummaryResponse | null // Current month org-wide summary for Year-End chart
  ytdSummary?: CostsSummaryResponse | null // YTD per-account summary for data table
  lastMonthSummary?: CostsSummaryResponse | null // Last month per-account summary for data table
  forecast: CostsForecastResponse | null
  extendedForecast: CostsForecastResponse | null // 3-month forecast for trend analysis
  analysis: CostsAnalysisResponse | null
  services: { resultsByTime?: AwsResultsByTime[] } | null // Service breakdown data from separate API call
  lastMonthServices?: { resultsByTime?: AwsResultsByTime[] } | null // Last month service breakdown for variance chart
  yearEndForecast?: CostsForecastResponse | null // Rest-of-year forecast
}


