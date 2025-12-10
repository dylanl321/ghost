/**
 * Forecast Types - Clear differentiation between AWS ML projections and strategic budget plans
 */

// Base forecast interface
export interface BaseForecast {
  id: string
  type: 'ml_projection' | 'budget_plan'
  source: 'aws_cost_explorer' | 'excel_upload' | 'manual_entry'
  createdAt: string
  updatedAt: string
  metadata: {
    confidence?: number // For ML projections
    isStatic?: boolean // For budget plans
    version?: string
  }
}

// AWS ML Projections (current "forecasts")
export interface MLProjection extends BaseForecast {
  type: 'ml_projection'
  source: 'aws_cost_explorer'
  data: {
    daily: MLProjectionDataPoint[]
    monthly: MLProjectionDataPoint[]
    confidence: number
    lastUpdated: string
  }
  metadata: {
    confidence: number
    model: 'aws_cost_explorer'
    granularity: 'daily' | 'monthly'
  }
}

export interface MLProjectionDataPoint {
  date: string
  amount: number
  confidence: number
  period: 'daily' | 'monthly'
}

// GDMS Forecasted Costs (Excel-based yearly forecasts from General Dynamics Mission Systems)
export interface GDMSForecast extends BaseForecast {
  type: 'gdms_forecast'
  source: 'excel_upload' | 'manual_entry'
  data: {
    annual: GDMSForecastDataPoint[]
    quarterly: GDMSForecastDataPoint[]
    monthly: GDMSForecastDataPoint[]
    lastUpdated: string
  }
  metadata: {
    isStatic: true
    year: number
    version: string
    uploadedBy?: string
    organization: 'General Dynamics Mission Systems'
  }
}

export interface GDMSForecastDataPoint {
  period: string // "2024-01", "Q1-2024", "2024"
  amount: number
  accountId?: string
  department?: string
  lineOfBusiness?: string
  category?: string
}

// Combined forecast data structure
export interface ForecastData {
  // AWS ML Projections
  mlProjections: {
    current: MLProjection | null
    historical: MLProjection[]
  }
  
  // GDMS Forecasted Costs
  gdmsForecasts: {
    current: GDMSForecast | null
    historical: GDMSForecast[]
  }
  
  // Comparison and variance analysis
  variance: {
    ytd: {
      actual: number
      mlProjection: number
      gdmsForecast: number
      gdmsVariance: number
      projectionVariance: number
    }
    monthly: {
      actual: number
      mlProjection: number
      gdmsForecast: number
      gdmsVariance: number
      projectionVariance: number
    }
    yearEnd: {
      mlProjection: number
      gdmsForecast: number
      variance: number
    }
  }
}

// Chart data structure for rendering
export interface ChartForecastData {
  dates: string[]
  series: {
    actual: number[]
    mlProjection: (number | null)[]
    gdmsForecast: (number | null)[]
    gdmsVariance: (number | null)[]
  }
  metadata: {
    totalActual: number
    totalMLProjection: number
    totalGDMSForecast: number
    gdmsVariance: number
    projectionVariance: number
  }
}

// API response types
export interface ForecastAPIResponse {
  success: boolean
  data: ForecastData
  error?: string
}

export interface GDMSForecastUploadResponse {
  success: boolean
  data: {
    forecastId: string
    recordsProcessed: number
    accounts: string[]
  }
  error?: string
}

// Chart series configuration
export interface ChartSeriesConfig {
  name: string
  type: 'actual' | 'ml_projection' | 'gdms_forecast' | 'gdms_variance'
  color: string
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  opacity?: number
  showInLegend: boolean
  tooltip: {
    title: string
    description: string
  }
}

// Predefined chart series configurations
export const CHART_SERIES_CONFIGS: ChartSeriesConfig[] = [
  {
    name: 'Actual Costs',
    type: 'actual',
    color: '#3b82f6',
    lineStyle: 'solid',
    showInLegend: true,
    tooltip: {
      title: 'Actual Costs',
      description: 'Real AWS costs incurred'
    }
  },
  {
    name: 'AWS Projection',
    type: 'ml_projection',
    color: '#10b981',
    lineStyle: 'dashed',
    opacity: 0.8,
    showInLegend: true,
    tooltip: {
      title: 'AWS ML Projection',
      description: 'Machine learning projection based on historical usage patterns'
    }
  },
  {
    name: 'GDMS Forecasted Costs',
    type: 'gdms_forecast',
    color: '#f59e0b',
    lineStyle: 'solid',
    showInLegend: true,
    tooltip: {
      title: 'GDMS Forecasted Costs',
      description: 'Strategic yearly forecast provided by General Dynamics Mission Systems'
    }
  },
  {
    name: 'GDMS Variance',
    type: 'gdms_variance',
    color: '#ef4444',
    lineStyle: 'dotted',
    showInLegend: true,
    tooltip: {
      title: 'GDMS Variance',
      description: 'Difference between actual costs and GDMS forecasted costs'
    }
  }
]

// Utility functions
export function isMLProjection(forecast: BaseForecast): forecast is MLProjection {
  return forecast.type === 'ml_projection'
}

export function isGDMSForecast(forecast: BaseForecast): forecast is GDMSForecast {
  return forecast.type === 'gdms_forecast'
}

export function getForecastTypeLabel(type: 'ml_projection' | 'gdms_forecast'): string {
  switch (type) {
    case 'ml_projection':
      return 'AWS Projection'
    case 'gdms_forecast':
      return 'GDMS Forecasted Costs'
    default:
      return 'Unknown'
  }
}

export function getForecastTypeDescription(type: 'ml_projection' | 'gdms_forecast'): string {
  switch (type) {
    case 'ml_projection':
      return 'Machine learning projection based on historical usage patterns'
    case 'gdms_forecast':
      return 'Strategic yearly forecast provided by General Dynamics Mission Systems'
    default:
      return 'Unknown forecast type'
  }
}
