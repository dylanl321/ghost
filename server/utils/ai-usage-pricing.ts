import { logger } from './logger'

type TokenKind = 'input' | 'output' | 'cache-read' | 'cache-write'

interface TokenRate {
  modelName: string
  normalizedModel: string
  tokenKind: TokenKind
  price: number
  tokensPerUnit: number
  effectiveDate?: string
}

interface CatalogEntry {
  rates: TokenRate[]
  loadedAt: number
}

const catalogCache = new Map<string, CatalogEntry>()
const catalogLoads = new Map<string, Promise<TokenRate[]>>()
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000

function normalizedModel(value: string): string {
  return value
    .toLowerCase()
    .replace(/amazon bedrock edition/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(token => token && !['amazon', 'anthropic', 'meta', 'cohere', 'ai21', 'model', 'global', 'us'].includes(token))
    .join(' ')
}

function classifyUsageType(usageType: string): TokenKind | null {
  const value = usageType.toLowerCase()
  if (value.includes('reserved_') || value.includes('provisionedthroughput') || value.includes('batch')) return null
  if (value.includes('cacheread') || value.includes('cache_read')) return 'cache-read'
  if (value.includes('cachewrite') || value.includes('cache_write')) return 'cache-write'
  if (value.includes('outputtokencount') || value.includes('output_tokens')) return 'output'
  if (value.includes('inputtokencount') || value.includes('input_tokens')) return 'input'
  return null
}

function tokensPerUnit(unit: string): number {
  const value = unit.toLowerCase()
  if (value.includes('1m')) return 1_000_000
  if (value.includes('1k')) return 1_000
  return 1
}

async function loadCatalog(region: string): Promise<TokenRate[]> {
  const cached = catalogCache.get(region)
  if (cached && Date.now() - cached.loadedAt < CATALOG_TTL_MS) return cached.rates
  const activeLoad = catalogLoads.get(region)
  if (activeLoad) return activeLoad

  const load = loadCatalogFromAWS(region)
  catalogLoads.set(region, load)
  try {
    return await load
  } finally {
    catalogLoads.delete(region)
  }
}

async function loadCatalogFromAWS(region: string): Promise<TokenRate[]> {
  const rates: TokenRate[] = []
  const url = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/${encodeURIComponent(region)}/index.json`
  const response = await fetch(url)
  if (!response.ok) throw new Error(`AWS Price List returned ${response.status} for ${region}`)
  const catalog = await response.json() as any

  for (const [sku, product] of Object.entries(catalog.products || {}) as [string, any][]) {
    const attributes = product.attributes || {}
    const tokenKind = classifyUsageType(attributes.usagetype || '')
    if (!tokenKind || !attributes.servicename) continue
    const onDemand = catalog.terms?.OnDemand?.[sku] || {}
    for (const term of Object.values(onDemand) as any[]) {
      for (const dimension of Object.values(term.priceDimensions || {}) as any[]) {
        const price = Number.parseFloat(dimension.pricePerUnit?.USD || '')
        if (!Number.isFinite(price)) continue
        rates.push({
          modelName: attributes.servicename,
          normalizedModel: normalizedModel(attributes.servicename),
          tokenKind,
          price,
          tokensPerUnit: tokensPerUnit(dimension.unit || ''),
          effectiveDate: term.effectiveDate
        })
      }
    }
  }

  catalogCache.set(region, { rates, loadedAt: Date.now() })
  return rates
}

function matchRate(rates: TokenRate[], modelId: string, tokenKind: TokenKind): TokenRate | undefined {
  const model = normalizedModel(modelId)
  const modelTokens = new Set(model.split(' ').filter(Boolean))
  return rates
    .filter(rate => rate.tokenKind === tokenKind)
    .map(rate => {
      const candidateTokens = rate.normalizedModel.split(' ').filter(Boolean)
      const matched = candidateTokens.filter(token => modelTokens.has(token)).length
      return { rate, score: candidateTokens.length ? matched / candidateTokens.length : 0 }
    })
    .filter(candidate => candidate.score >= 0.6)
    .sort((a, b) => b.score - a.score || b.rate.normalizedModel.length - a.rate.normalizedModel.length)[0]?.rate
}

export interface BedrockCostEstimate {
  estimatedCost: number
  pricedTokens: number
  totalTokens: number
  coveragePercent: number | null
  priceEffectiveDate?: string
}

export async function estimateBedrockTokenCost(input: {
  modelId?: string
  region?: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}): Promise<BedrockCostEstimate> {
  const counts: Record<TokenKind, number> = {
    input: input.inputTokens,
    output: input.outputTokens,
    'cache-read': input.cacheReadTokens,
    'cache-write': input.cacheWriteTokens
  }
  const totalTokens = Object.values(counts).reduce((sum, count) => sum + count, 0)
  if (!input.modelId || !input.region || totalTokens === 0) {
    return { estimatedCost: 0, pricedTokens: 0, totalTokens, coveragePercent: totalTokens === 0 ? null : 0 }
  }

  try {
    const rates = await loadCatalog(input.region)
    let estimatedCost = 0
    let pricedTokens = 0
    let priceEffectiveDate: string | undefined
    for (const [kind, count] of Object.entries(counts) as [TokenKind, number][]) {
      if (count <= 0) continue
      const rate = matchRate(rates, input.modelId, kind)
      if (!rate) continue
      estimatedCost += (count / rate.tokensPerUnit) * rate.price
      pricedTokens += count
      if (!priceEffectiveDate || (rate.effectiveDate && rate.effectiveDate > priceEffectiveDate)) priceEffectiveDate = rate.effectiveDate
    }
    return {
      estimatedCost,
      pricedTokens,
      totalTokens,
      coveragePercent: totalTokens ? (pricedTokens / totalTokens) * 100 : null,
      priceEffectiveDate
    }
  } catch (error) {
    logger.warn(`[AI Usage] Bedrock price lookup failed for ${input.modelId} in ${input.region}:`, error)
    return { estimatedCost: 0, pricedTokens: 0, totalTokens, coveragePercent: 0 }
  }
}

export function clearAIUsagePricingCache(): void {
  catalogCache.clear()
  catalogLoads.clear()
}
