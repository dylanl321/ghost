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
