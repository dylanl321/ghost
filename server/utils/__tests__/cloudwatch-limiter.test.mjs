/**
 * Inline unit test for semaphore + token-bucket logic extracted from cloudwatch-limiter.ts
 * Run with: node server/utils/__tests__/cloudwatch-limiter.test.mjs
 */

const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`)
  console.log(`  PASS: ${message}`)
}

// ---------------------------------------------------------------------------
// Inline semaphore (matches cloudwatch-limiter.ts implementation)
// ---------------------------------------------------------------------------
function makeSemaphore(maxSlots) {
  let active = 0
  const queue = []
  function acquire() {
    if (active < maxSlots) { active++; return Promise.resolve() }
    return new Promise(resolve => queue.push(resolve))
  }
  function release() {
    active--
    const next = queue.shift()
    if (next) { active++; next() }
  }
  async function run(fn) {
    await acquire()
    try { return await fn() } finally { release() }
  }
  return { run, get active() { return active } }
}

// ---------------------------------------------------------------------------
// Inline token bucket (matches cloudwatch-limiter.ts implementation)
// ---------------------------------------------------------------------------
function makeTokenBucket(maxRps) {
  let tokens = maxRps
  let lastRefill = Date.now()

  async function waitForToken() {
    if (maxRps === 0) return
    const now = Date.now()
    const elapsed = (now - lastRefill) / 1000
    tokens = Math.min(maxRps, tokens + elapsed * maxRps)
    lastRefill = now
    if (tokens >= 1) { tokens--; return }
    const wait = Math.ceil((1 - tokens) / maxRps * 1000)
    await new Promise(resolve => setTimeout(resolve, wait))
    return waitForToken()
  }
  return { waitForToken }
}

async function run() {
  console.log('\n=== cloudwatch-limiter inline unit tests ===\n')

  // Test 1: Semaphore limits concurrency
  {
    console.log('Test 1: semaphore limits concurrency to configured max')
    const sem = makeSemaphore(3)
    let maxSeen = 0
    let concurrentNow = 0
    const tasks = Array.from({ length: 10 }, (_, i) =>
      sem.run(async () => {
        concurrentNow++
        maxSeen = Math.max(maxSeen, concurrentNow)
        await new Promise(resolve => setTimeout(resolve, 20))
        concurrentNow--
        return i
      })
    )
    const results = await Promise.all(tasks)
    assert(results.length === 10, '10 tasks completed')
    assert(maxSeen <= 3, `concurrency never exceeded 3 (saw ${maxSeen})`)
    assert(sem.active === 0, 'all slots released after completion')
  }

  // Test 2: Semaphore processes all queued tasks (no starvation)
  {
    console.log('\nTest 2: semaphore processes all queued tasks without starvation')
    const sem = makeSemaphore(2)
    const order = []
    await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        sem.run(async () => {
          await new Promise(resolve => setTimeout(resolve, 5))
          order.push(i)
        })
      )
    )
    assert(order.length === 6, `all 6 tasks ran (got ${order.length})`)
  }

  // Test 3: Token bucket disabled when maxRps=0
  {
    console.log('\nTest 3: token bucket disabled when maxRps=0 (all calls immediate)')
    const bucket = makeTokenBucket(0)
    const start = Date.now()
    await Promise.all(Array.from({ length: 50 }, () => bucket.waitForToken()))
    const elapsed = Date.now() - start
    assert(elapsed < 100, `all 50 calls completed instantly when disabled (${elapsed}ms)`)
  }

  // Test 4: Token bucket rate-limits when maxRps>0
  {
    console.log('\nTest 4: token bucket spreads calls at configured RPS')
    const bucket = makeTokenBucket(5) // 5 calls/sec
    const start = Date.now()
    // 10 calls: first 5 consume pre-filled tokens, next 5 need to wait ~1s
    await Promise.all(Array.from({ length: 10 }, () => bucket.waitForToken()))
    const elapsed = Date.now() - start
    assert(elapsed >= 800, `10 calls at 5 RPS took ${elapsed}ms (expected >= 800ms)`)
    assert(elapsed < 3000, `did not take unreasonably long: ${elapsed}ms`)
  }

  // Test 5: Semaphore + token bucket together (acquireLimiter composition)
  {
    console.log('\nTest 5: combined limiter - semaphore + token bucket together')
    const sem = makeSemaphore(2)
    const bucket = makeTokenBucket(10) // generous rate for fast test
    let maxConcurrent = 0
    let concurrentNow = 0

    async function acquireLimiter(fn) {
      await sem.run(async () => {
        await bucket.waitForToken()
        concurrentNow++
        maxConcurrent = Math.max(maxConcurrent, concurrentNow)
        try { return await fn() }
        finally { concurrentNow-- }
      })
    }

    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        acquireLimiter(() => new Promise(resolve => setTimeout(() => resolve(i), 10)))
      )
    )
    assert(maxConcurrent <= 2, `combined limiter: max concurrent ${maxConcurrent} <= 2`)
  }

  console.log('\nAll tests passed!\n')
}

run().catch(err => {
  console.error('\nTest failed:', err.message)
  process.exit(1)
})
