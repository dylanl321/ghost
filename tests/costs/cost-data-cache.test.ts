import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearCostDataCache,
  fetchCostResponse,
  getCachedDataset,
  setCachedDataset
} from '../../app/composables/useCostDataCache'
import type { NormalizedDataset } from '../../app/types/costs'

test.afterEach(() => clearCostDataCache())

test('concurrent requests for the same URL share one fetch', async () => {
  let calls = 0
  const fetcher = async () => { calls++; return { total: 1 } }

  const [a, b] = await Promise.all([
    fetchCostResponse('/api/costs/summary?period=ytd', fetcher),
    fetchCostResponse('/api/costs/summary?period=ytd', fetcher)
  ])

  assert.equal(calls, 1)
  assert.equal(a, b)
})

test('a cached response is reused until the cache is cleared', async () => {
  let calls = 0
  const fetcher = async () => ++calls

  assert.equal(await fetchCostResponse('/api/costs/forecast?period=3-months', fetcher), 1)
  assert.equal(await fetchCostResponse('/api/costs/forecast?period=3-months', fetcher), 1)
  clearCostDataCache()
  assert.equal(await fetchCostResponse('/api/costs/forecast?period=3-months', fetcher), 2)
})

test('different URLs are fetched separately', async () => {
  let calls = 0
  const fetcher = async () => ++calls

  await fetchCostResponse('/api/costs/summary?period=thisMonth', fetcher)
  await fetchCostResponse('/api/costs/summary?period=lastMonth', fetcher)
  assert.equal(calls, 2)
})

test('a failed request is not cached', async () => {
  let calls = 0
  const url = '/api/costs/historical?period=last24months'

  await assert.rejects(fetchCostResponse(url, async () => { calls++; throw new Error('503') }))
  assert.equal(await fetchCostResponse(url, async () => { calls++; return 'ok' }), 'ok')
  assert.equal(calls, 2)
})

test('datasets are cached by scope, timeframe and mode', () => {
  const dataset = { mode: 'proforma', timeframe: 'thisMonth', accounts: [] } as unknown as NormalizedDataset

  setCachedDataset(['222', '111'], 'thisMonth', 'proforma', dataset)

  assert.equal(getCachedDataset(['111', '222'], 'thisMonth', 'proforma'), dataset)
  assert.equal(getCachedDataset(['111', '222'], 'thisMonth', 'billable'), null)
  assert.equal(getCachedDataset(['111', '222'], 'lastMonth', 'proforma'), null)
})
