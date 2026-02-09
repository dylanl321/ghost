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
  data?: any // Wrapped data from sendSuccess
  accounts?: any[] // Enhanced mode returns accounts array
  summary?: any // Summary totals
  rawData?: { resultsByTime?: any[] } // Raw AWS response data
  proforma?: any // Proforma nested data when mode=proforma
  billable?: any // Billable nested data when mode=proforma
}

// Historical API response (server/api/costs/historical.get.ts)
export interface CostsHistoricalSeries {
  accountId: string
  series: SeriesPoint[]
}

export interface CostsHistoricalResponse {
  series: CostsHistoricalSeries[]
  data?: any // Wrapped data from sendSuccess
  monthlyBreakdown?: any[] // Monthly breakdown with account details
  rawData?: { resultsByTime?: any[] }
  proforma?: any
  billable?: any
}

// Forecast API response (server/api/costs/forecast.get.ts)
export interface CostsForecastSeries {
  accountId: string
  series: SeriesPoint[]
}

export interface CostsForecastResponse {
  series: CostsForecastSeries[]
  data?: any // Wrapped data from sendSuccess
  forecast?: any // Nested forecast object
  total?: any // Total amount object
  forecastResultsByTime?: any[] // AWS forecast periods
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
  data?: any // Wrapped data from sendSuccess
  budgetAnalysis?: {
    byAccount?: any[]
    totalBudget?: number
    totalActual?: number
    totalVariance?: number
  }
  monthOverMonth?: any
  costTrends?: any
}

// Normalized dataset for charts
export interface NormalizedDataset {
  accounts: string[] // Selected account IDs
  accountsList?: any[] // Full account objects with metadata for LOB/Department mapping
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
  services: any | null // Service breakdown data from separate API call
  yearEndForecast?: any // Rest-of-year forecast
}


