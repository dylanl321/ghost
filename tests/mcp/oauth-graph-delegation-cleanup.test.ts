/**
 * Feature: oauth-administration — task 9.3 replace the unconditional
 * `grant.destroyed` Graph-delegation delete with a synchronized, authoritative
 * last-live-MCP-grant determination and reconciliation.
 *
 * These focused tests exercise the full decision logic against injected
 * dependencies (no live DynamoDB / provider), covering the design invariants:
 *   - destroying ONE of TWO live MCP grants PRESERVES the shared delegation;
 *   - destroying the CONFIRMED last live grant PERMITS cleanup;
 *   - UNCERTAIN coverage (durable store unavailable, read failure, or an
 *     incomplete read) PRESERVES the delegation and SCHEDULES reconciliation;
 *   - a scheduled reconciliation deletes ONLY once coverage is authoritatively
 *     the last live grant;
 *   - the per-subject FENCE serializes a concurrent consent/issuance against the
 *     last-grant decision + delete for the same user (Req 9.3 concurrency).
 *
 * The non-MCP-grant path (delegation untouched) is enforced by the caller in
 * provider.ts (`grantIncludesMcpResource` gates the call) and asserted here at
 * that boundary via the `grantIncludesMcpResource` predicate.
 */

import assert from 'node:assert/strict'
import test from 'node:test'
import {
  determineMcpGrantCoverage,
  handleMcpGrantDestroyed,
  reconcileMcpGraphDelegation,
  setGraphDelegationCleanupDepsForTests,
  withSubjectGraphFence
} from '../../server/mcp/oauth/graph-delegation-cleanup'
import { grantIncludesMcpResource } from '../../server/mcp/oauth/provider'

const SUBJECT = 'user-subject-1'

interface Harness {
  deletedSubjects: string[]
  scheduled: Array<{ subject: string, delayMs: number }>
  restore: () => void
}

/**
 * Install injected cleanup deps. `liveGrantIds` is the authoritative set the
 * determiner reads for the subject; `undefined` simulates a read failure /
 * incomplete read (uncertainty). `durable` toggles durable-store availability.
 */
function harness(options: {
  liveGrantIds: string[] | undefined
  durable?: boolean
  runReconciliationImmediately?: boolean
}): Harness {
  const deletedSubjects: string[] = []
  const scheduled: Array<{ subject: string, delayMs: number }> = []
  const restore = setGraphDelegationCleanupDepsForTests({
    readSubjectGrantIds: async () => options.liveGrantIds,
    deleteDelegation: async subject => { deletedSubjects.push(subject) },
    durableStoreAvailable: () => options.durable ?? true,
    mcpResource: () => 'https://ghost.example.test/mcp',
    scheduleReconciliation: (subject, delayMs) => {
      scheduled.push({ subject, delayMs })
      if (options.runReconciliationImmediately) {
        void reconcileMcpGraphDelegation(subject)
      }
    }
  })
  return { deletedSubjects, scheduled, restore }
}

test('destroying one of two live MCP grants preserves the shared delegation', async () => {
  // Two live MCP grants exist; grant_1 is being destroyed, grant_2 remains.
  const h = harness({ liveGrantIds: ['grant_1', 'grant_2'] })
  try {
    const coverage = await handleMcpGrantDestroyed(SUBJECT, 'grant_1')
    assert.equal(coverage, 'other-live-grant')
    // The delegation is PRESERVED — grant_2 still needs it (Req 9.3).
    assert.deepEqual(h.deletedSubjects, [])
    assert.deepEqual(h.scheduled, [])
  } finally {
    h.restore()
  }
})

test('destroying the confirmed last live grant permits delegation cleanup', async () => {
  // Only the destroyed grant remains in an eventually-consistent read; no OTHER
  // live grant exists → authoritatively the last live grant.
  const h = harness({ liveGrantIds: ['grant_1'] })
  try {
    const coverage = await handleMcpGrantDestroyed(SUBJECT, 'grant_1')
    assert.equal(coverage, 'last-live-grant')
    // The shared delegation is deleted (Req 9.3).
    assert.deepEqual(h.deletedSubjects, [SUBJECT])
    assert.deepEqual(h.scheduled, [])
  } finally {
    h.restore()
  }
})

test('an empty authoritative grant set is treated as the last live grant', async () => {
  // The read is authoritative and returns no live MCP grants for the subject.
  const h = harness({ liveGrantIds: [] })
  try {
    const coverage = await handleMcpGrantDestroyed(SUBJECT, 'grant_1')
    assert.equal(coverage, 'last-live-grant')
    assert.deepEqual(h.deletedSubjects, [SUBJECT])
  } finally {
    h.restore()
  }
})

test('uncertain coverage from a read failure preserves the delegation and schedules reconciliation', async () => {
  // `undefined` live-grant read = uncertainty (query unavailable / incomplete).
  const h = harness({ liveGrantIds: undefined })
  try {
    const coverage = await handleMcpGrantDestroyed(SUBJECT, 'grant_1')
    assert.equal(coverage, 'uncertain')
    // Delegation PRESERVED; reconciliation SCHEDULED (Req 9.5).
    assert.deepEqual(h.deletedSubjects, [])
    assert.equal(h.scheduled.length, 1)
    assert.equal(h.scheduled[0]?.subject, SUBJECT)
    assert.ok((h.scheduled[0]?.delayMs ?? 0) > 0)
  } finally {
    h.restore()
  }
})

test('uncertain coverage when durable storage is unavailable preserves and schedules', async () => {
  // A memory-only deployment cannot enumerate grants authoritatively.
  const h = harness({ liveGrantIds: ['grant_1'], durable: false })
  try {
    const coverage = await handleMcpGrantDestroyed(SUBJECT, 'grant_1')
    assert.equal(coverage, 'uncertain')
    assert.deepEqual(h.deletedSubjects, [])
    assert.equal(h.scheduled.length, 1)
  } finally {
    h.restore()
  }
})

test('reconciliation deletes only once coverage is authoritatively the last live grant', async () => {
  // First reconciliation still sees another live grant → preserve.
  const preserved = harness({ liveGrantIds: ['grant_2'] })
  try {
    const coverage = await reconcileMcpGraphDelegation(SUBJECT)
    assert.equal(coverage, 'other-live-grant')
    assert.deepEqual(preserved.deletedSubjects, [])
  } finally {
    preserved.restore()
  }

  // A later reconciliation finds no live grant → delete now.
  const cleaned = harness({ liveGrantIds: [] })
  try {
    const coverage = await reconcileMcpGraphDelegation(SUBJECT)
    assert.equal(coverage, 'last-live-grant')
    assert.deepEqual(cleaned.deletedSubjects, [SUBJECT])
  } finally {
    cleaned.restore()
  }
})

test('reconciliation that is still uncertain schedules another re-check without deleting', async () => {
  const h = harness({ liveGrantIds: undefined })
  try {
    const coverage = await reconcileMcpGraphDelegation(SUBJECT)
    assert.equal(coverage, 'uncertain')
    assert.deepEqual(h.deletedSubjects, [])
    assert.equal(h.scheduled.length, 1)
  } finally {
    h.restore()
  }
})

test('the per-subject fence serializes a concurrent issuance against the last-grant delete', async () => {
  // Model the concurrency race: a destroy determines "last live grant" and would
  // delete, while a consent issuance for the SAME subject saves a new grant. The
  // fence must serialize them so they do not interleave.
  const order: string[] = []
  let resolveIssuance!: () => void
  const issuanceGate = new Promise<void>(resolve => { resolveIssuance = resolve })

  const h = harness({ liveGrantIds: [] })
  try {
    // Acquire the fence for a slow "issuance" first.
    const issuance = withSubjectGraphFence(SUBJECT, async () => {
      order.push('issuance-start')
      await issuanceGate
      order.push('issuance-end')
    })

    // The destroy handler must WAIT for the fence held by issuance.
    const destroy = handleMcpGrantDestroyed(SUBJECT, 'grant_1').then(coverage => {
      order.push('destroy-decided')
      return coverage
    })

    // Let the issuance finish, releasing the fence.
    resolveIssuance()
    await issuance
    const coverage = await destroy

    // The destroy's decision + delete ran STRICTLY AFTER the issuance completed.
    assert.deepEqual(order, ['issuance-start', 'issuance-end', 'destroy-decided'])
    assert.equal(coverage, 'last-live-grant')
    assert.deepEqual(h.deletedSubjects, [SUBJECT])
  } finally {
    h.restore()
  }
})

test('different subjects do not contend on the fence', async () => {
  const started: string[] = []
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })

  // Hold subject A's fence open.
  const a = withSubjectGraphFence('subject-a', async () => {
    started.push('a')
    await gate
  })
  // Subject B must run immediately without waiting on A.
  await withSubjectGraphFence('subject-b', async () => { started.push('b') })
  assert.ok(started.includes('b'), 'subject-b should not be blocked by subject-a')

  release()
  await a
})

test('determineMcpGrantCoverage ignores the destroyed grant id when counting others', async () => {
  // The destroyed grant appears in an eventually-consistent read but must not be
  // counted as an "other" live grant.
  const h = harness({ liveGrantIds: ['grant_1'] })
  try {
    assert.equal(await determineMcpGrantCoverage(SUBJECT, 'grant_1'), 'last-live-grant')
    // Without the destroyed id filter, that same single grant is "other".
    assert.equal(await determineMcpGrantCoverage(SUBJECT), 'other-live-grant')
  } finally {
    h.restore()
  }
})

test('a non-MCP grant does not reach the cleanup path (predicate gate)', () => {
  // provider.ts only invokes handleMcpGrantDestroyed when the grant includes the
  // MCP resource. A grant without the MCP resource is filtered out at that gate,
  // so the shared delegation is never touched for non-MCP grants.
  const mcp = 'https://ghost.example.test/mcp'
  assert.equal(grantIncludesMcpResource({ resources: { 'https://other.example/crew': 'scope' } }, mcp), false)
  assert.equal(grantIncludesMcpResource({ resources: { [mcp]: 'scope' } }, mcp), true)
})
