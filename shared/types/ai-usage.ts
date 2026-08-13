export type AIUsageEnvironment = 'commercial' | 'govcloud'
export type AIUsageEnvironmentFilter = 'all' | AIUsageEnvironment
export type AIUsageProvider = 'bedrock-runtime' | 'bedrock-mantle' | 'bedrock-cost' | 'aws-ai-service'
export type AIUsageCostBasis = 'billable' | 'proforma'
export type AIUsageGranularity = 'hour' | 'day'
export type AIUsageGroupBy = 'enclave' | 'account' | 'environment' | 'provider' | 'service' | 'project' | 'model' | 'region' | 'day'
export type AIUsageTelemetryStatus = 'complete' | 'partial' | 'unavailable' | 'cost-only'

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

export interface AIUsageCollectionMarker {
  pk: string
  sk: string
  recordType: 'collection-marker'
  bucket: string
  environment: AIUsageEnvironment
  enclaveId: string
  enclaveName: string
  accountId: string
  region: string
  status: 'complete' | 'unavailable'
  collectedAt: string
  ttl: number
}

export interface AIUsageErrorCause {
  pk: string
  sk: string
  recordType: 'error-cause'
  eventId: string
  environment: AIUsageEnvironment
  enclaveId: string
  enclaveName: string
  accountId: string
  region: string
  source: 'bedrock-runtime' | 'cloudwatch-genai'
  modelId?: string
  operation: string
  errorCode: string
  errorMessage?: string
  callerIdentity?: string
  timestamp: string
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
  accountIds: string[]
  services: string[]
  sources: AIUsageProvider[]
  telemetryStatus: AIUsageTelemetryStatus
  telemetryTargets: number
  telemetryTargetsCollected: number
  actualCostAvailable: boolean
  estimatedCostAvailable: boolean
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
  accountCoveragePercent: number
  accountsCollected: number
  accountsTargeted: number
  accountRegionTargetsCollected: number
  accountRegionTargets: number
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
    byEnclave: AIUsageBreakdownRow[]
    byModel: AIUsageBreakdownRow[]
    byProvider: AIUsageBreakdownRow[]
    byService: AIUsageBreakdownRow[]
  }
  options: AIUsageOptions
  dataQuality: AIUsageDataQuality
}

export interface AIUsageErrorCauseGroup {
  key: string
  source: AIUsageErrorCause['source']
  errorCode: string
  operation: string
  message?: string
  count: number
  affectedAccounts: number
  affectedModels: number
}

export interface AIUsageErrorCauseSourceSummary {
  source: AIUsageErrorCause['source']
  label: string
  availability: 'available' | 'partial' | 'unavailable'
  eventCount: number
  message?: string
}

export interface AIUsageErrorCauseResponse {
  metricErrorTotal: number
  matchedCauseEvents: number
  affectedAccounts: Array<{ accountId: string; enclaveName: string; count: number }>
  affectedModels: Array<{ modelId: string; count: number }>
  groups: AIUsageErrorCauseGroup[]
  recentExamples: AIUsageErrorCause[]
  sources: AIUsageErrorCauseSourceSummary[]
}

export interface AIUsageCostDriverRow {
  key: string
  label: string
  cost: number
  usageType?: string
  operation?: string
}

export interface AIUsageCostDriverResource {
  resourceId: string
  cost: number
}

export interface AIUsageCostDriverResponse {
  service: string
  totalCost: number
  usageTypes: AIUsageCostDriverRow[]
  operations: AIUsageCostDriverRow[]
  combinations: AIUsageCostDriverRow[]
  resources: AIUsageCostDriverResource[]
  resourceDataAvailable: boolean
  resourceDataMessage?: string
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

export function aiUsageErrorCount(metrics: AIUsageMetrics): number {
  return metrics.clientErrors + metrics.serverErrors + metrics.throttles
}

export function aiUsageErrorRate(metrics: AIUsageMetrics): number {
  const errors = aiUsageErrorCount(metrics)
  const attempts = metrics.invocations + errors
  return attempts ? (errors / attempts) * 100 : 0
}
