/**
 * Ghostv2 tests for task 4.3 — abandoned-upload cleanup with durable worker
 * claims.
 *
 * Requirements: 8.11, 20.12.
 *
 * These exercise the real eligibility, durable-claim, and restart-safe-resume
 * logic against the in-memory claim store and abandoned-upload backend, with no
 * AWS or dashboard dependency (the worker is browser- and report-scheduler
 * independent by construction — it is invoked directly here).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import type { InvestigationScope } from '../../server/kirocrew/collaboration/keys'
import {
  ABANDONED_UPLOAD_CLAIM,
  ABANDONED_UPLOAD_MAX_AGE_MS,
  AbandonedUploadCleanupWorker,
  InMemoryAbandonedUploads,
  InMemoryWorkerClaimStore,
  type AbandonedUploadCandidate
} from '../../server/kirocrew/collaboration/lifecycle-worker'

const SCOPE: InvestigationScope = {
  tenantId: 'tenant-fake-01',
  spaceId: 'space-fake-01',
  investigationId: 'inv-fake-0001'
}

/** A fixed "now" so age math is deterministic. */
const NOW = new Date('2024-06-08T00:00:00Z')

function daysAgo(days: number, from: Date = NOW): string {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
}

function candidate(
  artifactId: string,
  overrides: Partial<AbandonedUploadCandidate> = {}
): AbandonedUploadCandidate {
  return {
    scope: SCOPE,
    artifactId,
    reservedAt: daysAgo(8),
    pending: true,
    referenced: false,
    ...overrides
  }
}

function makeWorker(
  uploads: InMemoryAbandonedUploads,
  claims: InMemoryWorkerClaimStore,
  overrides: { pageSize?: number; leaseDurationMs?: number; ownerToken?: string; now?: () => Date } = {}
): AbandonedUploadCleanupWorker {
  let tokenCounter = 0
  return new AbandonedUploadCleanupWorker(uploads, uploads, claims, {
    now: overrides.now ?? (() => NOW),
    pageSize: overrides.pageSize ?? 100,
    leaseDurationMs: overrides.leaseDurationMs,
    newOwnerToken: () => overrides.ownerToken ?? `owner-${++tokenCounter}`
  })
}

// --- Threshold: seven days (Requirement 8.11) ------------------------------

test('removes an unreferenced pending reservation older than seven days and all its object versions', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  uploads.addPending(candidate('art-old', { reservedAt: daysAgo(8) }), ['v1', 'v2', 'v3'])

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.claimed, true)
  assert.equal(result.removed, 1)
  assert.equal(result.completed, true)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-old'), false, 'reservation removed')
  assert.deepEqual(uploads.versionsFor(SCOPE, 'art-old'), [], 'every object version removed')
})

test('keeps a pending reservation younger than seven days', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  uploads.addPending(candidate('art-young', { reservedAt: daysAgo(6) }))

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.removed, 0)
  assert.equal(result.skipped, 1)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-young'), true, 'young reservation retained')
})

test('a reservation exactly at the seven-day boundary is eligible', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  const reservedAt = new Date(NOW.getTime() - ABANDONED_UPLOAD_MAX_AGE_MS).toISOString()
  uploads.addPending(candidate('art-edge', { reservedAt }))

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.removed, 1, 'reserved exactly seven days ago is removable')
})

// --- Only unreferenced pending reservations (Requirement 8.11) -------------

test('never removes a referenced pending reservation', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  uploads.addPending(candidate('art-referenced', { reservedAt: daysAgo(30), referenced: true }))

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.removed, 0)
  assert.equal(result.skipped, 1)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-referenced'), true, 'referenced artifact retained')
})

test('never removes a non-pending (finalized) manifest even if old', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  uploads.addPending(candidate('art-ready', { reservedAt: daysAgo(365), pending: false }))

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.removed, 0)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-ready'), true, 'finalized artifact retained')
})

test('a manifest reserved during the sweep window is not eligible this pass', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  // Reserved "in the future" relative to the threshold: newer than 7 days.
  uploads.addPending(candidate('art-fresh', { reservedAt: daysAgo(0) }))

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.removed, 0)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-fresh'), true)
})

// --- Durable claim serializes replicas (Requirement 20.12) -----------------

test('a second replica stands down while a live replica holds the claim', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()

  // Replica A grabs the claim but does not release it (simulated by a lister
  // that never completes for A: use a big lease and a manual acquire).
  const acquired = await claims.acquire({
    claimName: ABANDONED_UPLOAD_CLAIM,
    ownerToken: 'replica-A',
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    now: NOW
  })
  assert.ok(acquired, 'replica A holds the claim')

  uploads.addPending(candidate('art-old'))
  const result = await makeWorker(uploads, claims, { ownerToken: 'replica-B' }).sweep()

  assert.equal(result.claimed, false, 'replica B stands down')
  assert.equal(result.removed, 0)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-old'), true, 'no double processing')
})

test('a replica may take over after the previous holder\'s lease expires', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  await claims.acquire({
    claimName: ABANDONED_UPLOAD_CLAIM,
    ownerToken: 'crashed-replica',
    leaseExpiresAt: new Date(NOW.getTime() + 60_000),
    now: NOW
  })
  claims.expireLease(ABANDONED_UPLOAD_CLAIM) // the holder crashed

  uploads.addPending(candidate('art-old'))
  const result = await makeWorker(uploads, claims, { ownerToken: 'takeover-replica' }).sweep()

  assert.equal(result.claimed, true, 'takeover after lease expiry')
  assert.equal(result.removed, 1)
})

// --- Restart-safe progress (Requirement 20.12) -----------------------------

test('resumes from the persisted cursor after a crash mid-sweep', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  // Three abandoned candidates; page size 1 forces multiple pages/cursor saves.
  for (const id of ['art-a', 'art-b', 'art-c']) uploads.addPending(candidate(id))

  // A remover that throws after the first successful removal simulates a crash.
  let removals = 0
  const crashingUploads = Object.create(uploads) as InMemoryAbandonedUploads
  crashingUploads.removeReservationAndObjectVersions = async (scope, artifactId) => {
    if (removals >= 1) throw new Error('simulated crash')
    removals++
    return uploads.removeReservationAndObjectVersions(scope, artifactId)
  }
  const crashingWorker = new AbandonedUploadCleanupWorker(uploads, crashingUploads, claims, {
    now: () => NOW,
    pageSize: 1,
    newOwnerToken: () => 'owner-crash'
  })

  await assert.rejects(() => crashingWorker.sweep(), /simulated crash/)

  // The claim retains a cursor (progress persisted for at least the first page).
  const cursorAfterCrash = claims.peekCursor(ABANDONED_UPLOAD_CLAIM)
  assert.ok(cursorAfterCrash, 'a restart-safe cursor was persisted before the crash')

  // The crashed replica never released its claim; its lease eventually expires,
  // letting another replica take over and resume from the persisted cursor.
  claims.expireLease(ABANDONED_UPLOAD_CLAIM)

  // A fresh run resumes and finishes the remaining candidates.
  const result = await makeWorker(uploads, claims, { pageSize: 1, ownerToken: 'owner-resume' }).sweep()
  assert.equal(result.claimed, true)
  assert.equal(result.completed, true)
  // All three are gone: one before the crash, two on resume.
  for (const id of ['art-a', 'art-b', 'art-c']) {
    assert.equal(uploads.hasCandidate(SCOPE, id), false, `${id} eventually removed`)
  }
})

test('completing a sweep releases the claim so the next cadence starts clean', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  uploads.addPending(candidate('art-old'))

  await makeWorker(uploads, claims).sweep()

  assert.equal(claims.isHeld(ABANDONED_UPLOAD_CLAIM), false, 'claim released on completion')
})

test('an empty candidate list completes and releases without removing anything', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()

  const result = await makeWorker(uploads, claims).sweep()

  assert.equal(result.claimed, true)
  assert.equal(result.removed, 0)
  assert.equal(result.completed, true)
  assert.equal(claims.isHeld(ABANDONED_UPLOAD_CLAIM), false)
})

// --- Idempotent removal across retries (Requirement 20.12 durability) ------

test('re-running removal for an already-removed artifact is a no-op success', async () => {
  const uploads = new InMemoryAbandonedUploads()
  uploads.addPending(candidate('art-old'))
  await uploads.removeReservationAndObjectVersions(SCOPE, 'art-old')
  // Second removal must not throw and must leave state consistent.
  await uploads.removeReservationAndObjectVersions(SCOPE, 'art-old')
  assert.equal(uploads.hasCandidate(SCOPE, 'art-old'), false)
})

// --- Mixed batch across pages ----------------------------------------------

test('across many pages, removes only the eligible and skips the rest', async () => {
  const uploads = new InMemoryAbandonedUploads()
  const claims = new InMemoryWorkerClaimStore()
  uploads.addPending(candidate('art-1', { reservedAt: daysAgo(10) })) // eligible
  uploads.addPending(candidate('art-2', { reservedAt: daysAgo(2) })) // too young
  uploads.addPending(candidate('art-3', { reservedAt: daysAgo(10), referenced: true })) // referenced
  uploads.addPending(candidate('art-4', { reservedAt: daysAgo(10), pending: false })) // finalized
  uploads.addPending(candidate('art-5', { reservedAt: daysAgo(10) })) // eligible

  const result = await makeWorker(uploads, claims, { pageSize: 2 }).sweep()

  assert.equal(result.removed, 2)
  assert.equal(result.skipped, 3)
  assert.equal(result.completed, true)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-1'), false)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-5'), false)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-2'), true)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-3'), true)
  assert.equal(uploads.hasCandidate(SCOPE, 'art-4'), true)
})
