import assert from 'node:assert/strict'
import test from 'node:test'

import { createCacheManager } from '../cache-manager'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => { resolve = r })
  return { promise, resolve }
}

test('concurrent getOrSet calls share one fetch', async () => {
  const cache = createCacheManager()
  let calls = 0
  const fetcher = async () => {
    calls++
    await new Promise(resolve => setTimeout(resolve, 5))
    return { value: 1 }
  }

  const results = await Promise.all([cache.getOrSet('k', fetcher), cache.getOrSet('k', fetcher)])
  assert.equal(calls, 1)
  assert.deepEqual(results, [{ value: 1 }, { value: 1 }])
  cache.destroy()
})

test('invalidating a key while its fetch is running does not cache the stale result', async () => {
  const cache = createCacheManager()
  const first = deferred<string>()
  let calls = 0

  const stale = cache.getOrSet('costs:dashboard', () => { calls++; return first.promise }, { tags: ['costs'] })
  await cache.invalidateByTags(['costs'])
  first.resolve('before-invalidation')

  assert.equal(await stale, 'before-invalidation')
  assert.equal(await cache.get('costs:dashboard'), null)

  assert.equal(await cache.getOrSet('costs:dashboard', async () => { calls++; return 'fresh' }), 'fresh')
  assert.equal(calls, 2)
  cache.destroy()
})

test('callers after an invalidation do not join the pre-invalidation fetch', async () => {
  const cache = createCacheManager()
  const first = deferred<string>()

  const stale = cache.getOrSet('accounts:list', () => first.promise)
  await cache.clearPattern('accounts:')
  const fresh = cache.getOrSet('accounts:list', async () => 'fresh')
  first.resolve('stale')

  assert.equal(await stale, 'stale')
  assert.equal(await fresh, 'fresh')
  assert.equal(await cache.get('accounts:list'), 'fresh')
  cache.destroy()
})

test('null results are not cached so a failed fetch is retried', async () => {
  const cache = createCacheManager()
  let calls = 0
  const fetcher = async () => { calls++; return calls === 1 ? null : 'ok' }

  assert.equal(await cache.getOrSet('org:overview', fetcher), null)
  assert.equal(await cache.getOrSet('org:overview', fetcher), 'ok')
  assert.equal(await cache.getOrSet('org:overview', fetcher), 'ok')
  assert.equal(calls, 2)
  cache.destroy()
})

test('a failed fetch is not cached and does not block the next caller', async () => {
  const cache = createCacheManager()
  await assert.rejects(cache.getOrSet('k', async () => { throw new Error('boom') }))
  assert.equal(await cache.getOrSet('k', async () => 'ok'), 'ok')
  cache.destroy()
})
