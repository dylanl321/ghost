export type AIUsageEnvironment = 'commercial' | 'govcloud'
export type AIUsageEnvironmentFilter = 'all' | AIUsageEnvironment
export type AIUsageProvider = 'bedrock-runtime' | 'bedrock-mantle' | 'bedrock-cost' | 'aws-ai-service'
export type AIUsageCostBasis = 'billable' | 'proforma'
export type AIUsageGranularity = 'hour' | 'day'
export type AIUsageGroupBy = 'enclave' | 'account' | 'environment' | 'provider' | 'service' | 'project' | 'model' | 'region' | 'day'

export interface AIUsageMetrics {
  invocations: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  clientErrors: number
  serverErrors: number
  throttles: number
  latencyMs: number | null
  latencySamples: number
  outputImages: number
}

export interface AIUsageCost {
  actual: number
  estimated: number
  estimateCoveragePercent: number | null
  currency: 'USD'
  basis: AIUsageCostBasis
}

export interface AIUsageFact {
  pk: string
  sk: string
  granularity: AIUsageGranularity
  bucket: string
  environment: AIUsageEnvironment
  enclaveId: string
  enclaveName: string
  accountId: string
  commercialAccountId?: string
  govCloudAccountId?: string
  lineOfBusiness?: string
  department?: string
  provider: AIUsageProvider
  service: string
  projectId?: string
  modelId?: string
  region?: string
  costBasis?: AIUsageCostBasis
  metrics: AIUsageMetrics
  actualCost: number
  estimatedCost: number
  pricedTokens: number
  collectedAt: string
  dataThrough?: string
  priceEffectiveDate?: string
  ttl: number
}

export interface AIUsageFilters {
  startDate: string
  endDate: string
  periodLabel: string
  environment: AIUsageEnvironmentFilter
  accountIds: string[]
  linesOfBusiness: string[]
  departments: string[]
  providers: AIUsageProvider[]
  services: string[]
  projects: string[]
  models: string[]
  regions: string[]
  costBasis: AIUsageCostBasis
  groupBy: AIUsageGroupBy
}

export interface AIUsageSummary {
  activeEnclaves: number
  activeAccounts: number
  activeProjects: number
  activeModels: number
  metrics: AIUsageMetrics
  cost: AIUsageCost
  growthPercent: number | null
}

export interface AIUsageBreakdownRow {
  key: string
  label: string
  environment?: AIUsageEnvironment
  enclaveId?: string
  enclaveName?: string
  accountId?: string
  provider?: AIUsageProvider
  service?: string
  projectId?: string
  modelId?: string
  region?: string
  services: string[]
  telemetryAvailable: boolean
  metrics: AIUsageMetrics
  cost: AIUsageCost
  active: boolean
  lastSeen?: string
}

export interface AIUsageTrendPoint {
  date: string
  activeEnclaves: number
  invocations: number
  inputTokens: number
  outputTokens: number
  actualCost: number
  estimatedCost: number
}

export interface AIUsageOptions {
  providers: AIUsageProvider[]
  services: string[]
  projects: string[]
  models: string[]
  regions: string[]
  linesOfBusiness: string[]
  departments: string[]
}

export interface AIUsageDataQuality {
  collectedAt: string | null
  actualCostThrough: string | null
  telemetryCoveragePercent: number
  estimateCoveragePercent: number | null
  partial: boolean
  warnings: string[]
}

export interface AIUsageOverviewResponse {
  filters: AIUsageFilters
  summary: AIUsageSummary
  previousSummary: AIUsageSummary | null
  trend: AIUsageTrendPoint[]
  breakdown: AIUsageBreakdownRow[]
  analysis: {
    byAccount: AIUsageBreakdownRow[]
    byModel: AIUsageBreakdownRow[]
    byProvider: AIUsageBreakdownRow[]
    byService: AIUsageBreakdownRow[]
  }
  options: AIUsageOptions
  dataQuality: AIUsageDataQuality
}

export function emptyAIUsageMetrics(): AIUsageMetrics {
  return {
    invocations: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    clientErrors: 0,
    serverErrors: 0,
    throttles: 0,
    latencyMs: null,
    latencySamples: 0,
    outputImages: 0
  }
}
