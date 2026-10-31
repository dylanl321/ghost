import assert from 'node:assert/strict'
import test from 'node:test'
import {
  estimateBedrockTokenCost,
  clearAIUsagePricingCache
} from '../../server/utils/ai-usage-pricing'

const MODEL_IDS = [
  'anthropic.claude-opus-4-8',
  'anthropic.claude-sonnet-5',
  'anthropic.claude-haiku-4-5',
  'amazon.titan-text',
  'meta.llama3',
  'cohere.command'
]

const tokens = { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 }

function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch
  globalThis.fetch = impl
  return fn().finally(() => { globalThis.fetch = original })
}

test('a single catalog outage fetches and warns once, not once per model', async () => {
  clearAIUsagePricingCache()
  let fetchCalls = 0
  const failingFetch = (async () => {
    fetchCalls++
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch

  await withFetch(failingFetch, async () => {
    for (const modelId of MODEL_IDS) {
      const estimate = await estimateBedrockTokenCost({ modelId, region: 'us-east-1', ...tokens })
      // Zero-cost fallback is retained on failure.
      assert.equal(estimate.estimatedCost, 0)
      assert.equal(estimate.pricedTokens, 0)
      assert.equal(estimate.coveragePercent, 0)
      assert.equal(estimate.totalTokens, 150)
    }
  })

  // Six models, one region → the negative cache/backoff collapses to one fetch.
  assert.equal(fetchCalls, 1)
})

test('clearAIUsagePricingCache clears the failure cache so a later fetch retries', async () => {
  clearAIUsagePricingCache()
  let fetchCalls = 0
  const failingFetch = (async () => {
    fetchCalls++
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch

  await withFetch(failingFetch, async () => {
    await estimateBedrockTokenCost({ modelId: MODEL_IDS[0], region: 'us-east-1', ...tokens })
    assert.equal(fetchCalls, 1)

    // Still within the backoff window: no refetch.
    await estimateBedrockTokenCost({ modelId: MODEL_IDS[0], region: 'us-east-1', ...tokens })
    assert.equal(fetchCalls, 1)

    // Clearing the failure cache allows a retry.
    clearAIUsagePricingCache()
    await estimateBedrockTokenCost({ modelId: MODEL_IDS[0], region: 'us-east-1', ...tokens })
    assert.equal(fetchCalls, 2)
  })
})

test('failure backoff is region-scoped', async () => {
  clearAIUsagePricingCache()
  let fetchCalls = 0
  const failingFetch = (async () => {
    fetchCalls++
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch

  await withFetch(failingFetch, async () => {
    await estimateBedrockTokenCost({ modelId: MODEL_IDS[0], region: 'us-east-1', ...tokens })
    await estimateBedrockTokenCost({ modelId: MODEL_IDS[0], region: 'us-gov-west-1', ...tokens })
  })

  // A distinct region gets its own fetch attempt and its own backoff window.
  assert.equal(fetchCalls, 2)
})

test('zero-token estimates never touch the catalog', async () => {
  clearAIUsagePricingCache()
  let fetchCalls = 0
  const failingFetch = (async () => {
    fetchCalls++
    throw new TypeError('fetch failed')
  }) as unknown as typeof fetch

  const estimate = await withFetch(failingFetch, () =>
    estimateBedrockTokenCost({
      modelId: MODEL_IDS[0],
      region: 'us-east-1',
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0
    })
  )
  assert.equal(estimate.totalTokens, 0)
  assert.equal(estimate.coveragePercent, null)
  assert.equal(fetchCalls, 0)
})

function catalogFetch(products: Array<{ name: string; usageType: string; price: string }>) {
  const catalog = { products: {} as Record<string, any>, terms: { OnDemand: {} as Record<string, any> } }
  products.forEach((product, index) => {
    const sku = `SKU${index}`
    catalog.products[sku] = { attributes: { servicename: product.name, usagetype: product.usageType } }
    catalog.terms.OnDemand[sku] = {
      term: { effectiveDate: '2026-01-01T00:00:00Z', priceDimensions: { dim: { unit: '1M tokens', pricePerUnit: { USD: product.price } } } }
    }
  })
  return (async () => new Response(JSON.stringify(catalog))) as unknown as typeof fetch
}

test('models are priced by their own version, not one whose tokens overlap', async () => {
  clearAIUsagePricingCache()
  // Every token of "Claude Haiku 5.5" and "Claude Sonnet 5.5" occurs in the
  // claude-haiku-4-5 and claude-3-5-sonnet IDs; those rates must not be used.
  const fetchImpl = catalogFetch([
    { name: 'Claude Haiku 5.5 (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount-Units', price: '0.55' },
    { name: 'Claude Haiku 4.5 (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount-Units', price: '1.10' },
    { name: 'Claude Haiku 4.5 (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount_Global-Units', price: '1.00' },
    { name: 'Claude Haiku 4.5 (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount_Batch-Units', price: '0.55' },
    { name: 'Claude Sonnet 5.5 (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount-Units', price: '2.20' },
    { name: 'Claude Sonnet 4 (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount-Units', price: '3.00' },
    { name: 'Claude 3.5 Sonnet (Amazon Bedrock Edition)', usageType: 'USE1-MP:USE1_InputTokenCount-Units', price: '3.00' }
  ])
  const input = { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, region: 'us-east-1' }
  await withFetch(fetchImpl, async () => {
    assert.equal((await estimateBedrockTokenCost({ modelId: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', ...input })).estimatedCost, 1.1)
    assert.equal((await estimateBedrockTokenCost({ modelId: 'global.anthropic.claude-haiku-4-5-20251001-v1:0', ...input })).estimatedCost, 1)
    assert.equal((await estimateBedrockTokenCost({ modelId: 'anthropic.claude-3-5-sonnet-20240620-v1:0', ...input })).estimatedCost, 3)
    // Sonnet 4.5 is not in this catalog; it must not fall back to Sonnet 4.
    const unpriced = await estimateBedrockTokenCost({ modelId: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0', ...input })
    assert.equal(unpriced.estimatedCost, 0)
    assert.equal(unpriced.coveragePercent, 0)
  })
})
