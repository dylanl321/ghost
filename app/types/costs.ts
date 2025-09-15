export type DataMode = 'billable' | 'proforma'

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
}

// Historical API response (server/api/costs/historical.get.ts)
export interface CostsHistoricalSeries {
  accountId: string
  series: SeriesPoint[]
}

export interface CostsHistoricalResponse {
  series: CostsHistoricalSeries[]
}

// Forecast API response (server/api/costs/forecast.get.ts)
export interface CostsForecastSeries {
  accountId: string
  series: SeriesPoint[]
}

export interface CostsForecastResponse {
  series: CostsForecastSeries[]
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
}

// Normalized dataset for charts
export interface NormalizedDataset {
  accounts: string[] // Selected account IDs
  accountsList?: any[] // Full account objects with metadata for LOB/Department mapping
  mode: DataMode // Current mode (billable or proforma)
  summary: CostsSummaryResponse | null
  historical: CostsHistoricalResponse | null
  forecast: CostsForecastResponse | null
  extendedForecast: CostsForecastResponse | null // 3-month forecast for trend analysis
  analysis: CostsAnalysisResponse | null
  services: any | null // Service breakdown data from separate API call
}


