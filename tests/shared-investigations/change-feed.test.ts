/**
 * Ghostv2 unit + property tests for fixed-high-water Change_Feed and cursor
 * handling (task 3.4).
 *
 * These verify the feed-read rules the CollaborationFeedService owns:
 *  - Fixed High_Water_Mark: a walk is bounded by one Server_Sequence captured at
 *    start; later writes never appear in that walk (Requirement 12.5, 19.3,
 *    19.4, 24.16).
 *  - Server_Sequence order only; never client timestamps (Requirement 12.6, 19.9).
 *  - Complete, non-overlapping pagination through the mark (Requirement 12.7,
 *    19.4, 24.16).
 *  - Opaque authenticated cursors bound to Tenant, Authenticated_Subject,
 *    Team_Space, Source_Binding, query, and High_Water_Mark; a foreign or
 *    tampered cursor yields a non-disclosing error with no data
 *    (Requirement 12.7, 12.8, 19.5, 19.10).
 *  - Reauthorize before every page; a mid-walk denial returns no protected
 *    records (Requirement 12.8, 19.10).
 *  - Default page size 50, maximum 200 (Requirement 19.3).
 *
 * Feature: shared-investigations (task 3.4).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CollaborationFeedService,
  FeedCursorCodec,
  InMemoryChangeFeedStore,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  type ChangeFeedItem,
  type ChangeFeedPage,
  type FeedScope
} from '../../server/kirocrew/collaboration/change-feed.ts'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors.ts'
import type { SpaceScope } from '../../server/kirocrew/collaboration/keys.ts'
import type { ChangeFeedKind } from '../../server/kirocrew/collaboration/repository-types.ts'

const scope: FeedScope = {
  tenantId: 'tenant-A',
  subjectObjectId: 'oid-1',
  spaceId: 'space-1',
  sourceBindingId: 'binding-x'
}
const spaceScope: SpaceScope = { tenantId: scope.tenantId, spaceId: scope.spaceId }

const KINDS: ChangeFeedKind[] = ['investigation', 'run', 'event', 'checkpoint', 'artifact']

function allow(): boolean {
  return true
}

function seedFeed(store: InMemoryChangeFeedStore, count: number, at: SpaceScope = spaceScope): void {
  for (let s = 1; s <= count; s++) {
    store.append(at, {
      serverSequence: s,
      kind: KINDS[s % KINDS.length]!,
      objectId: `obj-${s}`,
      safeProjection: { n: s }
    })
  }
}

function makeService(store = new InMemoryChangeFeedStore()) {
  const codec = new FeedCursorCodec('test-signing-key')
  return { service: new CollaborationFeedService(store, codec), store, codec }
}

/**
 * Drain a whole walk, returning every emitted item and the number of pages.
 * Asserts the High_Water_Mark is stable across every page.
 */
async function drain(
  service: CollaborationFeedService,
  walkScope: FeedScope,
  first: ChangeFeedPage
): Promise<{ items: ChangeFeedItem[]; pages: number; highWaterMark: number }> {
  const items: ChangeFeedItem[] = [...first.items]
  let pages = 1
  const mark = first.highWaterMark
  let cursor = first.nextCursor
  while (cursor) {
    const page = await service.continueSync(walkScope, allow, cursor)
    assert.equal(page.highWaterMark, mark, 'High_Water_Mark must be stable across pages')
    items.push(...page.items)
    cursor = page.nextCursor
    pages++
  }
  return { items, pages, highWaterMark: mark }
}

// --- Page size ---------------------------------------------------------------

test('default page size is 50 and the maximum is 200', async () => {
  const { service, store } = makeService()
  seedFeed(store, 260)

  const dflt = await service.startSync(scope, allow)
  assert.equal(dflt.items.length, DEFAULT_PAGE_SIZE)

  const capped = await service.startSync(scope, allow, { pageSize: 10_000 })
  assert.equal(capped.items.length, MAX_PAGE_SIZE)

  const clampedLow = await service.startSync(scope, allow, { pageSize: 0 })
  assert.equal(clampedLow.items.length, 1, 'a page size below 1 is clamped to 1')
})

// --- Fixed High_Water_Mark ---------------------------------------------------

test('the High_Water_Mark is fixed at start and later writes do not appear in the walk', async () => {
  const { service, store } = makeService()
  seedFeed(store, 120)

  const first = await service.startSync(scope, allow) // mark fixed at 120
  assert.equal(first.highWaterMark, 120)

  // Writes AFTER the walk began must not appear anywhere in this walk.
  store.append(spaceScope, { serverSequence: 121, kind: 'event', objectId: 'late', safeProjection: {} })
  store.append(spaceScope, { serverSequence: 122, kind: 'event', objectId: 'late', safeProjection: {} })

  const { items, highWaterMark } = await drain(service, scope, first)
  assert.equal(highWaterMark, 120)
  assert.equal(items.length, 120)
  assert.equal(items[items.length - 1]!.serverSequence, 120)
  assert.ok(!items.some((i) => i.serverSequence > 120), 'no post-mark rows in the walk')
})

test('an empty feed yields one complete empty page with no cursor', async () => {
  const { service } = makeService()
  const page = await service.startSync(scope, allow)
  assert.deepEqual(page.items, [])
  assert.equal(page.highWaterMark, 0)
  assert.equal(page.nextCursor, undefined)
})

// --- Complete, ordered, non-overlapping pagination ---------------------------

test('pagination is complete, ordered, and non-overlapping through the mark', async () => {
  const { service, store } = makeService()
  seedFeed(store, 137)

  const first = await service.startSync(scope, allow, { pageSize: 25 })
  const { items, pages } = await drain(service, scope, first)

  assert.equal(items.length, 137)
  assert.ok(pages >= 6, 'expected multiple pages')
  // Strictly ascending Server_Sequence with no gaps or duplicates.
  for (let i = 0; i < items.length; i++) {
    assert.equal(items[i]!.serverSequence, i + 1)
  }
})

test('synchronization resumes after a persisted cursor position (fromSequence)', async () => {
  const { service, store } = makeService()
  seedFeed(store, 40)

  const page = await service.startSync(scope, allow, { fromSequence: 30, pageSize: 100 })
  assert.equal(page.items.length, 10)
  assert.equal(page.items[0]!.serverSequence, 31)
  assert.equal(page.items[9]!.serverSequence, 40)
  assert.equal(page.nextCursor, undefined, 'walk complete')
})

test('the final page has no continuation cursor', async () => {
  const { service, store } = makeService()
  seedFeed(store, 50)
  const page = await service.startSync(scope, allow, { pageSize: 50 })
  assert.equal(page.items.length, 50)
  assert.equal(page.nextCursor, undefined)
})

// --- Query filter binding ----------------------------------------------------

test('a query filter is honored and cannot be widened through a continuation', async () => {
  const { service, store, codec } = makeService()
  seedFeed(store, 100)

  const first = await service.startSync(scope, allow, { pageSize: 10, query: { kinds: ['event'] } })
  assert.ok(first.items.every((i) => i.kind === 'event'))

  // Even if a client keeps following continuations, every page stays filtered.
  const { items } = await drain(service, scope, first)
  assert.ok(items.every((i) => i.kind === 'event'))
  assert.ok(items.length > 0)

  // A cursor's bound query is authenticated; it can't be swapped for a wider one.
  assert.ok(first.nextCursor)
  const decoded = codec.decode(first.nextCursor!)
  assert.equal(decoded?.queryKey, 'event')
})

// --- Cursor authentication / scope binding -----------------------------------

test('a cursor bound to another authorization scope returns a non-disclosing error', async () => {
  const { service, store } = makeService()
  seedFeed(store, 30)
  const first = await service.startSync(scope, allow, { pageSize: 5 })
  assert.ok(first.nextCursor)

  const otherTenant: FeedScope = { ...scope, tenantId: 'tenant-B' }
  const otherSubject: FeedScope = { ...scope, subjectObjectId: 'oid-2' }
  const otherSpace: FeedScope = { ...scope, spaceId: 'space-2' }
  const otherBinding: FeedScope = { ...scope, sourceBindingId: 'binding-y' }

  for (const foreign of [otherTenant, otherSubject, otherSpace, otherBinding]) {
    await assert.rejects(
      () => service.continueSync(foreign, allow, first.nextCursor!),
      (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
    )
  }
})

test('a tampered or malformed cursor returns a non-disclosing error with no data', async () => {
  const { service, store } = makeService()
  seedFeed(store, 30)
  const first = await service.startSync(scope, allow, { pageSize: 5 })
  assert.ok(first.nextCursor)

  const tampered = first.nextCursor!.slice(0, -2) + (first.nextCursor!.endsWith('a') ? 'bb' : 'aa')
  for (const bad of [tampered, 'garbage', '', 'a.b', first.nextCursor! + 'x']) {
    await assert.rejects(
      () => service.continueSync(scope, allow, bad),
      (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
    )
  }
})

test('a cursor signed with a different key is rejected', async () => {
  const store = new InMemoryChangeFeedStore()
  seedFeed(store, 30)
  const issuer = new CollaborationFeedService(store, new FeedCursorCodec('key-1'))
  const first = await issuer.startSync(scope, allow, { pageSize: 5 })
  assert.ok(first.nextCursor)

  const attacker = new CollaborationFeedService(store, new FeedCursorCodec('key-2'))
  await assert.rejects(
    () => attacker.continueSync(scope, allow, first.nextCursor!),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
  )
})

// --- Reauthorize every page --------------------------------------------------

test('reauthorization runs before the first page', async () => {
  const { service, store } = makeService()
  seedFeed(store, 10)
  await assert.rejects(
    () => service.startSync(scope, () => false, { pageSize: 5 }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'forbidden'
  )
})

test('a mid-walk authorization change denies the next page without returning records', async () => {
  const { service, store } = makeService()
  seedFeed(store, 30)

  let calls = 0
  // Authorized for the first page, revoked for the second.
  const reauth = () => {
    calls++
    return calls < 2
  }

  const first = await service.startSync(scope, reauth, { pageSize: 5 })
  assert.equal(first.items.length, 5)
  assert.ok(first.nextCursor)

  await assert.rejects(
    () => service.continueSync(scope, reauth, first.nextCursor!),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'forbidden'
  )
})

// --- Isolation ---------------------------------------------------------------

test('a walk only reads its own Team_Space feed rows', async () => {
  const { service, store } = makeService()
  seedFeed(store, 10, spaceScope)
  seedFeed(store, 999, { tenantId: 'tenant-A', spaceId: 'space-OTHER' })

  const first = await service.startSync(scope, allow, { pageSize: 100 })
  const { items } = await drain(service, scope, first)
  assert.equal(items.length, 10)
})

// --- Property-style randomized checks ---------------------------------------

/** Small deterministic PRNG so the property loop is reproducible. */
function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0xffffffff
  }
}

test('property: draining a walk yields exactly 1..mark in order, for any feed size and page size', async () => {
  for (let trial = 0; trial < 60; trial++) {
    const rng = makeRng(trial + 1)
    const { service, store } = makeService()
    const count = Math.floor(rng() * 250)
    seedFeed(store, count)
    const pageSize = 1 + Math.floor(rng() * 220) // includes values above the cap

    const first = await service.startSync(scope, allow, { pageSize })
    assert.equal(first.highWaterMark, count, `trial ${trial}: mark must equal feed size`)
    const { items } = await drain(service, scope, first)

    assert.equal(items.length, count, `trial ${trial}: every row exactly once`)
    for (let i = 0; i < items.length; i++) {
      assert.equal(items[i]!.serverSequence, i + 1, `trial ${trial}: ordered, no gaps/dupes`)
    }
  }
})

test('property: every emitted page respects the effective page-size bound', async () => {
  for (let trial = 0; trial < 40; trial++) {
    const rng = makeRng(trial + 101)
    const { service, store } = makeService()
    const count = 1 + Math.floor(rng() * 300)
    seedFeed(store, count)
    const requested = 1 + Math.floor(rng() * 400)
    const effective = Math.min(requested, MAX_PAGE_SIZE)

    let cursor: string | undefined
    let page = await service.startSync(scope, allow, { pageSize: requested })
    for (;;) {
      assert.ok(page.items.length <= effective, `trial ${trial}: page over bound`)
      cursor = page.nextCursor
      if (!cursor) break
      page = await service.continueSync(scope, allow, cursor)
    }
  }
})

test('property: post-mark writes are never observed regardless of interleaving', async () => {
  for (let trial = 0; trial < 40; trial++) {
    const rng = makeRng(trial + 7)
    const { service, store } = makeService()
    const initial = 1 + Math.floor(rng() * 120)
    seedFeed(store, initial)

    const first = await service.startSync(scope, allow, { pageSize: 1 + Math.floor(rng() * 20) })
    const mark = first.highWaterMark

    // Interleave late writes while draining.
    const items: ChangeFeedItem[] = [...first.items]
    let cursor = first.nextCursor
    let next = initial + 1
    while (cursor) {
      store.append(spaceScope, { serverSequence: next++, kind: 'event', objectId: 'late', safeProjection: {} })
      const page = await service.continueSync(scope, allow, cursor)
      items.push(...page.items)
      cursor = page.nextCursor
    }
    assert.ok(items.every((i) => i.serverSequence <= mark), `trial ${trial}: leaked a post-mark row`)
    assert.equal(items.length, initial)
  }
})
