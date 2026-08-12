import type { AIUsageCostBasis, AIUsageEnvironmentFilter, AIUsageGroupBy, AIUsageProvider } from '../../shared/types/ai-usage'
import type { AIUsageQueryInput } from './ai-usage-query'

const ENVIRONMENTS = new Set<AIUsageEnvironmentFilter>(['all', 'commercial', 'govcloud'])
const COST_BASES = new Set<AIUsageCostBasis>(['billable', 'proforma'])
const GROUPS = new Set<AIUsageGroupBy>(['enclave', 'account', 'environment', 'provider', 'service', 'project', 'model', 'region', 'day'])
const PROVIDERS = new Set<AIUsageProvider>(['bedrock-runtime', 'bedrock-mantle', 'bedrock-cost', 'aws-ai-service'])

function list(value: unknown): string[] {
  if (!value) return []
  const values = Array.isArray(value) ? value : String(value).split(',')
  return [...new Set(values.map(item => String(item).trim()).filter(Boolean))]
}

export function parseAIUsageQuery(query: Record<string, unknown>): AIUsageQueryInput {
  const environment = (query.environment || 'all') as AIUsageEnvironmentFilter
  const costBasis = (query.costBasis || 'proforma') as AIUsageCostBasis
  const groupBy = (query.groupBy || 'enclave') as AIUsageGroupBy
  const providers = list(query.providers) as AIUsageProvider[]
  if (!ENVIRONMENTS.has(environment)) throw new Error('environment must be all, commercial, or govcloud')
  if (!COST_BASES.has(costBasis)) throw new Error('costBasis must be billable or proforma')
  if (!GROUPS.has(groupBy)) throw new Error('Unsupported groupBy value')
  if (providers.some(provider => !PROVIDERS.has(provider))) throw new Error('Unsupported provider value')

  const accountIds = [...new Set([
    ...list(query.accountIds),
    ...list(query.enclaveIds),
    ...list(query.enclaveId)
  ])]
  return {
    period: query.period as string | undefined,
    startDate: query.startDate as string | undefined,
    endDate: query.endDate as string | undefined,
    environment,
    accountIds,
    linesOfBusiness: list(query.linesOfBusiness),
    departments: list(query.departments),
    providers,
    services: list(query.services),
    projects: list(query.projects),
    models: list(query.models),
    regions: list(query.regions),
    costBasis,
    groupBy
  }
}
