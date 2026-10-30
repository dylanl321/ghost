import { logger } from './logger'

type TokenKind = 'input' | 'output' | 'cache-read' | 'cache-write'

interface TokenRate {
  modelName: string
  normalizedModel: string
  tokenKind: TokenKind
  price: number
  tokensPerUnit: number
  /** Global cross-Region inference rate (usage type ends in _Global). */
  global: boolean
  effectiveDate?: string
}

interface CatalogEntry {
  rates: TokenRate[]
  loadedAt: number
}

interface CatalogFailure {
  failedAt: number
  retryAfterMs: number
}

const catalogCache = new Map<string, CatalogEntry>()
const catalogLoads = new Map<string, Promise<TokenRate[]>>()
// Region-scoped negative cache so one catalog outage does not refetch/log per model.
const catalogFailures = new Map<string, CatalogFailure>()
const CATALOG_TTL_MS = 24 * 60 * 60 * 1000
const CATALOG_FETCH_TIMEOUT_MS = 5_000
const CATALOG_FAILURE_BACKOFF_MS = 5 * 60 * 1000 // 5 minutes

// Thrown when a region is inside its failure backoff window. Distinct from a
// real fetch error so callers can stay silent (the failure was already logged).
class CatalogUnavailableError extends Error {
  constructor(region: string) {
    super(`Bedrock pricing catalog unavailable for ${region} (backoff)`)
    this.name = 'CatalogUnavailableError'
  }
}

function normalizedModel(value: string): string {
  return value
    .toLowerCase()
    .replace(/amazon bedrock edition/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter(token => token && !['amazon', 'anthropic', 'meta', 'cohere', 'ai21', 'model', 'global', 'us'].includes(token))
    .join(' ')
}

// Usage types priced differently from standard on-demand tokens. Invocation
// metrics cannot tell these apart, so they must not compete with the standard rate.
const NON_STANDARD_USAGE = ['reserved_', 'provisionedthroughput', 'batch', 'latencyoptimized', 'long_ctx', 'cachewrite1h', 'cache_write_tokens_1h', 'cache_write_tokens_30m', 'customization']

function classifyUsageType(usageType: string): { kind: TokenKind; global: boolean } | null {
  const value = usageType.toLowerCase()
  if (NON_STANDARD_USAGE.some(marker => value.includes(marker))) return null
  const global = value.includes('global')
  if (value.includes('cacheread') || value.includes('cache_read')) return { kind: 'cache-read', global }
  if (value.includes('cachewrite') || value.includes('cache_write')) return { kind: 'cache-write', global }
  if (value.includes('outputtokencount') || value.includes('output_tokens')) return { kind: 'output', global }
  if (value.includes('inputtokencount') || value.includes('input_tokens')) return { kind: 'input', global }
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

  // Inside the backoff window, fail fast without refetching or logging so a
  // single catalog outage does not produce one fetch/warning per model.
  const failure = catalogFailures.get(region)
  if (failure && Date.now() - failure.failedAt < failure.retryAfterMs) {
    throw new CatalogUnavailableError(region)
  }

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
  const url = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/${encodeURIComponent(region)}/index.json`

  try {
    const rates: TokenRate[] = []
    const response = await fetch(url, { signal: AbortSignal.timeout(CATALOG_FETCH_TIMEOUT_MS) })
    if (!response.ok) throw new Error(`AWS Price List returned ${response.status} for ${region}`)
    const catalog = await response.json() as any

    for (const [sku, product] of Object.entries(catalog.products || {}) as [string, any][]) {
      const attributes = product.attributes || {}
      const usage = classifyUsageType(attributes.usagetype || '')
      if (!usage || !attributes.servicename) continue
      const onDemand = catalog.terms?.OnDemand?.[sku] || {}
      for (const term of Object.values(onDemand) as any[]) {
        for (const dimension of Object.values(term.priceDimensions || {}) as any[]) {
          const price = Number.parseFloat(dimension.pricePerUnit?.USD || '')
          if (!Number.isFinite(price)) continue
          rates.push({
            modelName: attributes.servicename,
            normalizedModel: normalizedModel(attributes.servicename),
            tokenKind: usage.kind,
            price,
            tokensPerUnit: tokensPerUnit(dimension.unit || ''),
            global: usage.global,
            effectiveDate: term.effectiveDate
          })
        }
      }
    }

    catalogCache.set(region, { rates, loadedAt: Date.now() })
    catalogFailures.delete(region)
    return rates
  } catch (error) {
    // Open the backoff window and emit exactly one structured warning for this
    // actual failed fetch. Subsequent per-model calls fail fast and stay silent.
    catalogFailures.set(region, { failedAt: Date.now(), retryAfterMs: CATALOG_FAILURE_BACKOFF_MS })
    logger.warn('[AI Usage] Bedrock pricing catalog fetch failed', {
      event: 'bedrock_pricing_catalog_failure',
      region,
      retryAfterMs: CATALOG_FAILURE_BACKOFF_MS,
      error: error instanceof Error ? { name: error.name, message: error.message } : String(error)
    })
    throw error
  }
}

/**
 * The catalog model whose name appears as a contiguous run in the model ID,
 * not followed by another version number. Token-overlap matching priced
 * claude-haiku-4-5 as "Claude Haiku 5.5" and claude-3-5-sonnet as "Claude
 * Sonnet 5.5" because every token of those names occurs somewhere in the ID.
 * Global inference profiles use the _Global rate; other IDs the regional rate.
 */
export function matchRate(rates: TokenRate[], modelId: string, tokenKind: TokenKind): TokenRate | undefined {
  const modelTokens = normalizedModel(modelId).split(' ').filter(token => token && !/^\d{8}$/.test(token))
  const wantsGlobal = modelId.toLowerCase().startsWith('global.')
  const matchLength = (rate: TokenRate) => {
    const candidate = rate.normalizedModel.split(' ').filter(Boolean)
    if (!candidate.length) return 0
    for (let start = 0; start + candidate.length <= modelTokens.length; start++) {
      if (!candidate.every((token, index) => modelTokens[start + index] === token)) continue
      const next = modelTokens[start + candidate.length]
      if (next && /^\d{1,2}$/.test(next)) continue
      return candidate.length
    }
    return 0
  }
  return rates
    .filter(rate => rate.tokenKind === tokenKind)
    .map(rate => ({ rate, length: matchLength(rate) }))
    .filter(candidate => candidate.length > 0)
    .sort((a, b) =>
      b.length - a.length ||
      Number(b.rate.global === wantsGlobal) - Number(a.rate.global === wantsGlobal) ||
      (b.rate.effectiveDate || '').localeCompare(a.rate.effectiveDate || ''))[0]?.rate
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
  } catch {
    // The catalog fetch failure (if any) is logged once in loadCatalogFromAWS
    // and negatively cached, so we must not log a duplicate per-model warning
    // here. Retain the zero-cost fallback.
    return { estimatedCost: 0, pricedTokens: 0, totalTokens, coveragePercent: 0 }
  }
}

export function clearAIUsagePricingCache(): void {
  catalogCache.clear()
  catalogLoads.clear()
  catalogFailures.clear()
}
