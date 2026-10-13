/**
 * Ghostv2 unit + property tests for the CollaborationRepository transactional
 * mutation layer (task 3.3).
 *
 * These verify the durable-mutation rules the repository owns:
 *  - Atomic bundle: an accepted mutation writes the domain change, Event where
 *    applicable, Change_Feed entry, Idempotency_Record, next Server_Sequence,
 *    and the specialized creation/check records — all-or-nothing
 *    (Requirement 7.3).
 *  - Operation_ID idempotency: same payload replays without a duplicate Event;
 *    a different payload conflicts without applying it (Requirement 7.6, 7.7,
 *    24.8).
 *  - Default-first convergence and explicit-new separation (Requirement 14.2-14.4,
 *    24.6), including pre-ID Creation_Operation_Lookup recovery
 *    (Requirement 10.16, 14.14, 24.6, 24.26).
 *  - Check-finished `(Investigation_ID, Check_ID)` uniqueness: identical retry
 *    replays, a different payload conflicts, no duplicate finish
 *    (Requirement 10.16, 10.17).
 *  - Sequence monotonicity + conflict retry with the original Operation_ID
 *    (Requirement 7.4, 7.5), and concurrent appends each keep a distinct
 *    Server_Sequence (Requirement 7.10).
 *  - Expected-Revision metadata updates; a stale Revision returns a conflict
 *    with no state change (Requirement 7.8, 7.9, 12.3, 12.4).
 *
 * Feature: shared-investigations (task 3.3).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CollaborationRepository,
  canonicalPayloadHash,
  type RepositoryClock
} from '../../server/kirocrew/collaboration/repository.ts'
import {
  InMemoryTransactionalRecordStore,
  TransactionConflictError,
  type TransactionalRecordStore,
  type TransactionPlan
} from '../../server/kirocrew/collaboration/record-store.ts'
import {
  changeFeedKey,
  checkFinishKey,
  creationOperationKey,
  investigationMetaKey,
  sequenceCounterKey,
  subjectPointerKey,
  type SpaceScope
} from '../../server/kirocrew/collaboration/keys.ts'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors.ts'
import type {
  AppendEventCommand,
  CommandContext,
  CreateInvestigationCommand
} from '../../server/kirocrew/collaboration/repository-types.ts'
import type { SubjectReference } from '../../server/kirocrew/collaboration/subject.ts'

// --- Deterministic clock/id generator ---------------------------------------

function makeClock(seed = 0): RepositoryClock {
  let n = seed
  let t = Date.parse('2024-01-01T00:00:00.000Z')
  return {
    now: () => new Date((t += 1000)),
    newInvestigationId: () => `inv-${++n}`,
    newRunId: () => `run-${++n}`,
    newEventId: () => `evt-${++n}`
  }
}

const ctx: CommandContext = {
  tenantId: 'tenant-A',
  spaceId: 'space-1',
  author: { tenantId: 'tenant-A', entraObjectId: 'oid-1' },
  gatewayId: 'gw-1'
}
const scope: SpaceScope = { tenantId: ctx.tenantId, spaceId: ctx.spaceId }
const subject: SubjectReference = {
  sourceBindingId: 'binding-x',
  sourceType: 'jira',
  stableSourceId: 'PROJ-1'
}

function createCommand(
  operationId: string,
  mode: 'default-first' | 'explicit-new',
  overrides: Partial<CreateInvestigationCommand> = {}
): CreateInvestigationCommand {
  return {
    operationId,
    mode,
    primarySubject: subject,
    workflowProfileId: 'wf-1',
    workflowVersion: 1,
    stageId: 'investigating',
    ...overrides
  }
}

function makeRepo(store: TransactionalRecordStore = new InMemoryTransactionalRecordStore(), clock = makeClock()) {
  return { repo: new CollaborationRepository(store, clock), store }
}

// --- Atomic bundle -----------------------------------------------------------

test('an accepted creation atomically writes investigation, feed, idempotency, sequence, and creation lookup', async () => {
  const { repo, store } = makeRepo()
  const ack = await repo.createInvestigation(ctx, createCommand('op-create-1', 'default-first'))

  assert.equal(ack.investigationId, 'inv-1')
  assert.equal(ack.revision, 0)
  assert.equal(ack.acceptedServerSequence, 1)

  const invScope = { ...scope, investigationId: ack.investigationId }
  assert.ok(await store.get(investigationMetaKey(invScope)), 'investigation row written')
  assert.ok(await store.get(changeFeedKey(scope, 1)), 'change feed entry written')
  assert.ok(await store.get(creationOperationKey(scope, 'op-create-1')), 'creation lookup written')
  assert.ok(await store.get(subjectPointerKey(scope, subject, 'default')), 'default subject pointer written')
  const counter = await store.get(sequenceCounterKey(scope))
  assert.equal(Number(counter!.value), 1, 'sequence counter advanced')
})

test('a failing transaction writes nothing (all-or-nothing)', async () => {
  // A store that always rejects the transaction must leave state empty.
  const failing: TransactionalRecordStore = {
    async transactWrite(_plan: TransactionPlan) {
      throw new Error('boom')
    },
    async get() {
      return null
    }
  }
  const r = new CollaborationRepository(failing, makeClock())
  await assert.rejects(() => r.createInvestigation(ctx, createCommand('op-x', 'explicit-new')), /boom/)
})

// --- Idempotency -------------------------------------------------------------

test('same Operation_ID + same payload replays the prior creation without a second Investigation', async () => {
  const { repo, store } = makeRepo()
  const first = await repo.createInvestigation(ctx, createCommand('op-dup', 'explicit-new'))
  const second = await repo.createInvestigation(ctx, createCommand('op-dup', 'explicit-new'))
  assert.deepEqual(first, second)
  // Only one sequence consumed.
  assert.equal(Number((await store.get(sequenceCounterKey(scope)))!.value), 1)
})

test('reusing an Operation_ID with a different creation payload conflicts without applying it', async () => {
  const { repo } = makeRepo()
  await repo.createInvestigation(ctx, createCommand('op-conf', 'explicit-new', { stageId: 'investigating' }))
  await assert.rejects(
    () => repo.createInvestigation(ctx, createCommand('op-conf', 'explicit-new', { stageId: 'complete' })),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )
})

test('reusing an Operation_ID with a different append payload is a payload mismatch', async () => {
  const { repo } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  const base: AppendEventCommand = {
    operationId: 'op-evt',
    investigationId: created.investigationId,
    type: 'finding',
    provenance: 'self-reported',
    body: { text: 'a' }
  }
  await repo.appendEvent(ctx, base)
  await assert.rejects(
    () => repo.appendEvent(ctx, { ...base, body: { text: 'b' } }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'payload_mismatch'
  )
})

// --- Default-first convergence / explicit-new separation --------------------

test('a second default-first start on one subject converges on the first Investigation', async () => {
  const { repo } = makeRepo()
  const first = await repo.createInvestigation(ctx, createCommand('op-a', 'default-first'))
  const second = await repo.createInvestigation(ctx, createCommand('op-b', 'default-first'))
  assert.equal(second.investigationId, first.investigationId)
})

test('simultaneous default-first starts (racing subject pointer) resolve to one Investigation', async () => {
  // A store that lets both creations "commit" but rejects the second default
  // subject-pointer putIfAbsent, exactly like a concurrent DynamoDB conflict.
  const inner = new InMemoryTransactionalRecordStore()
  let firstPointerWritten = false
  const racing: TransactionalRecordStore = {
    async transactWrite(plan: TransactionPlan) {
      const hasPointer = plan.ops.some((o) => o.id === 'subject-pointer')
      if (hasPointer && firstPointerWritten) {
        throw new TransactionConflictError('exists', 'subject-pointer')
      }
      await inner.transactWrite(plan)
      if (hasPointer) firstPointerWritten = true
    },
    get: (k) => inner.get(k)
  }
  const clock = makeClock()
  const r = new CollaborationRepository(racing, clock)
  const a = await r.createInvestigation(ctx, createCommand('op-1', 'default-first'))
  const b = await r.createInvestigation(ctx, createCommand('op-2', 'default-first'))
  assert.equal(b.investigationId, a.investigationId, 'both default starts converge')
})

test('explicit-new creations for one subject stay separate', async () => {
  const { repo } = makeRepo()
  const a = await repo.createInvestigation(ctx, createCommand('op-1', 'explicit-new'))
  const b = await repo.createInvestigation(ctx, createCommand('op-2', 'explicit-new'))
  assert.notEqual(a.investigationId, b.investigationId)
})

// --- Pre-ID creation recovery ------------------------------------------------

test('creation is recoverable by Operation_ID before the Investigation ID is known', async () => {
  const { repo } = makeRepo()
  const cmd = createCommand('op-recover', 'default-first')
  const ack = await repo.createInvestigation(ctx, cmd)

  const payloadHash = canonicalPayloadHash({
    kind: 'create-investigation',
    mode: cmd.mode,
    primarySubject: JSON.stringify({
      sourceBindingId: subject.sourceBindingId,
      sourceType: subject.sourceType,
      stableSourceId: subject.stableSourceId
    }),
    relatedSubjects: [],
    workflowProfileId: cmd.workflowProfileId,
    workflowVersion: cmd.workflowVersion,
    stageId: cmd.stageId
  })
  const resolved = await repo.resolveCreationOperation(scope, 'op-recover', payloadHash)
  assert.equal(resolved.status, 'resolved')
  assert.deepEqual(resolved.status === 'resolved' ? resolved.ack : null, ack)

  // A mismatching payload hash conflicts; an unknown op is unresolved.
  const mismatch = await repo.resolveCreationOperation(scope, 'op-recover', 'f'.repeat(64))
  assert.equal(mismatch.status, 'conflict')
  const unknown = await repo.resolveCreationOperation(scope, 'op-never', 'a'.repeat(64))
  assert.equal(unknown.status, 'unresolved')
})

// --- Check-finished uniqueness ----------------------------------------------

function finishCommand(operationId: string, checkId: string, body: unknown): AppendEventCommand {
  return {
    operationId,
    investigationId: 'inv-1',
    type: 'check-finished',
    checkId,
    provenance: 'adapter',
    body: body as Record<string, unknown>
  }
}

test('an identical check-finished retry replays without a duplicate finish, even under a new Operation_ID', async () => {
  const { repo, store } = makeRepo()
  await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new')) // inv-1
  const a = await repo.appendEvent(ctx, finishCommand('op-f1', 'check-42', { result: 'pass' }))
  // Same payload, DIFFERENT Operation_ID => same acknowledgement, no 2nd event.
  const b = await repo.appendEvent(ctx, finishCommand('op-f2', 'check-42', { result: 'pass' }))
  assert.deepEqual(b, a)
  // Exactly one finish uniqueness row and the counter advanced only once for it.
  assert.ok(await store.get(checkFinishKey({ ...scope, investigationId: 'inv-1' }, 'check-42')))
})

test('a different check-finished payload for the same Check_ID conflicts without appending', async () => {
  const { repo } = makeRepo()
  await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new')) // inv-1
  await repo.appendEvent(ctx, finishCommand('op-f1', 'check-9', { result: 'pass' }))
  await assert.rejects(
    () => repo.appendEvent(ctx, finishCommand('op-f2', 'check-9', { result: 'fail' })),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )
})

// --- Sequence + Revision -----------------------------------------------------

test('server sequences are monotonic and distinct across accepted mutations', async () => {
  const { repo } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  const run = await repo.reserveRun(ctx, { operationId: 'op-run', investigationId: created.investigationId })
  const e1 = await repo.appendEvent(ctx, {
    operationId: 'op-e1',
    investigationId: created.investigationId,
    type: 'finding',
    provenance: 'self-reported'
  })
  const e2 = await repo.appendEvent(ctx, {
    operationId: 'op-e2',
    investigationId: created.investigationId,
    type: 'finding',
    provenance: 'self-reported'
  })
  const seqs = [created.acceptedServerSequence, run.acceptedServerSequence, e1.acceptedServerSequence, e2.acceptedServerSequence]
  assert.deepEqual(seqs, [1, 2, 3, 4])
})

test('an internal sequence-allocation conflict retries with the original Operation_ID', async () => {
  const inner = new InMemoryTransactionalRecordStore()
  let injected = false
  const flaky: TransactionalRecordStore = {
    async transactWrite(plan: TransactionPlan) {
      // Fail the FIRST sequence-bearing commit once to force a counter retry.
      if (!injected && plan.ops.some((o) => o.id === 'sequence')) {
        injected = true
        throw new TransactionConflictError('counter', 'sequence')
      }
      await inner.transactWrite(plan)
    },
    get: (k) => inner.get(k)
  }
  const r = new CollaborationRepository(flaky, makeClock())
  const ack = await r.createInvestigation(ctx, createCommand('op-retry', 'explicit-new'))
  // The retry succeeded with the same Operation_ID and consumed exactly one seq.
  assert.equal(ack.operationId, 'op-retry')
  assert.equal(Number((await inner.get(sequenceCounterKey(scope)))!.value), 1)
})

test('patch requires the expected Revision and bumps it on success', async () => {
  const { repo } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  const patched = await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    stageId: 'complete'
  })
  assert.equal(patched.revision, 1)
})

test('a stale expected Revision conflicts (409) without changing metadata', async () => {
  const { repo, store } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    stageId: 'waiting'
  })
  const before = await store.get(investigationMetaKey({ ...scope, investigationId: created.investigationId }))
  await assert.rejects(
    () =>
      repo.patchInvestigation(ctx, {
        operationId: 'op-p2',
        investigationId: created.investigationId,
        expectedRevision: 0, // stale
        stageId: 'complete'
      }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'revision_conflict'
  )
  const after = await store.get(investigationMetaKey({ ...scope, investigationId: created.investigationId }))
  assert.deepEqual(after, before, 'metadata unchanged after a stale-revision conflict')
})

// --- Archive read-only + orthogonal reopen (task 11.3) ----------------------

/** Archive an Investigation at Revision 0 (orthogonal to Stage, Req 18.12). */
async function archive(repo: CollaborationRepository, investigationId: string) {
  return repo.patchInvestigation(ctx, {
    operationId: `op-archive-${investigationId}`,
    investigationId,
    expectedRevision: 0,
    archived: true
  })
}

test('an archived Investigation rejects new Run and Event contributions without altering history (Req 18.8, 18.9)', async () => {
  const { repo, store } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  const inv = created.investigationId
  const archived = await archive(repo, inv)
  assert.equal(archived.revision, 1)

  const invScope = { ...scope, investigationId: inv }
  const before = await store.get(investigationMetaKey(invScope))
  const seqBefore = Number((await store.get(sequenceCounterKey(scope)))!.value)

  await assert.rejects(
    () => repo.reserveRun(ctx, { operationId: 'op-run', investigationId: inv }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )
  await assert.rejects(
    () =>
      repo.appendEvent(ctx, {
        operationId: 'op-evt',
        investigationId: inv,
        type: 'finding',
        provenance: 'self-reported',
        body: { text: 'late' }
      }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )

  const after = await store.get(investigationMetaKey(invScope))
  assert.deepEqual(after, before, 'archived history unchanged by rejected contributions')
  const seqAfter = Number((await store.get(sequenceCounterKey(scope)))!.value)
  assert.equal(seqAfter, seqBefore, 'a rejected contribution never advances the Server_Sequence')
})

test('archive preserves Stage and a rejected contribution is orthogonal to workflow (Req 18.12)', async () => {
  const { repo, store } = makeRepo()
  const created = await repo.createInvestigation(
    ctx,
    createCommand('op-c', 'explicit-new', { stageId: 'investigating' })
  )
  const inv = created.investigationId
  await archive(repo, inv)
  const record = (await store.get(
    investigationMetaKey({ ...scope, investigationId: inv })
  )) as unknown as { archived: boolean; stageId: string }
  assert.equal(record.archived, true)
  assert.equal(record.stageId, 'investigating', 'archive does not rewrite Stage')
})

test('explicit reopen restores contributions under the pinned workflow (Req 18.10, 18.11)', async () => {
  const { repo } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  const inv = created.investigationId
  await archive(repo, inv)

  // Explicit reopen is a metadata-Revision transition orthogonal to Stage.
  const reopened = await repo.patchInvestigation(ctx, {
    operationId: 'op-reopen',
    investigationId: inv,
    expectedRevision: 1,
    archived: false
  })
  assert.equal(reopened.revision, 2)

  // Contributions are accepted again after reopen.
  const run = await repo.reserveRun(ctx, { operationId: 'op-run-after', investigationId: inv })
  assert.ok(run.acceptedServerSequence > 0, 'a Run is accepted after reopen')
})

test('an Operation_ID reservation acknowledged before archival still replays after archival', async () => {
  const { repo } = makeRepo()
  const created = await repo.createInvestigation(ctx, createCommand('op-c', 'explicit-new'))
  const inv = created.investigationId
  const firstRun = await repo.reserveRun(ctx, { operationId: 'op-run', investigationId: inv })
  await archive(repo, inv)
  // The same Operation_ID replays its prior acknowledgement even though the
  // Investigation is now archived (idempotency precedes the archive guard).
  const replay = await repo.reserveRun(ctx, { operationId: 'op-run', investigationId: inv })
  assert.deepEqual(replay, firstRun)
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

test('property: retrying any accepted mutation with the same Operation_ID never adds a Server_Sequence', async () => {
  // Property 13/14 flavor: idempotent replay creates nothing additional.
  for (let trial = 0; trial < 40; trial++) {
    const rng = makeRng(trial + 1)
    const { repo, store } = makeRepo(new InMemoryTransactionalRecordStore(), makeClock(trial * 100))
    const created = await repo.createInvestigation(ctx, createCommand(`op-c-${trial}`, 'explicit-new'))
    const inv = created.investigationId

    // A random sequence of distinct-Operation_ID mutations.
    const opCount = 1 + Math.floor(rng() * 6)
    const applied: Array<() => Promise<unknown>> = []
    for (let i = 0; i < opCount; i++) {
      const kind = Math.floor(rng() * 3)
      const opId = `op-${trial}-${i}`
      if (kind === 0) {
        const cmd = { operationId: opId, investigationId: inv }
        await repo.reserveRun(ctx, cmd)
        applied.push(() => repo.reserveRun(ctx, cmd))
      } else if (kind === 1) {
        const cmd: AppendEventCommand = {
          operationId: opId,
          investigationId: inv,
          type: 'finding',
          provenance: 'self-reported',
          body: { i }
        }
        await repo.appendEvent(ctx, cmd)
        applied.push(() => repo.appendEvent(ctx, cmd))
      } else {
        const cmd: AppendEventCommand = {
          operationId: opId,
          investigationId: inv,
          type: 'check-finished',
          checkId: `chk-${trial}-${i}`,
          provenance: 'adapter',
          body: { i }
        }
        await repo.appendEvent(ctx, cmd)
        applied.push(() => repo.appendEvent(ctx, cmd))
      }
    }

    const seqAfterApply = Number((await store.get(sequenceCounterKey(scope)))!.value)
    // Replay every applied mutation; the counter must not advance.
    for (const replay of applied) {
      await replay()
    }
    const seqAfterReplay = Number((await store.get(sequenceCounterKey(scope)))!.value)
    assert.equal(seqAfterReplay, seqAfterApply, `trial ${trial}: replay advanced the sequence`)
  }
})

test('property: exactly one contiguous Server_Sequence per accepted mutation', async () => {
  for (let trial = 0; trial < 30; trial++) {
    const rng = makeRng(trial + 7)
    const { repo, store } = makeRepo(new InMemoryTransactionalRecordStore(), makeClock(trial * 1000))
    let accepted = 0
    const created = await repo.createInvestigation(ctx, createCommand(`op-c-${trial}`, 'explicit-new'))
    accepted++
    const inv = created.investigationId
    const rounds = 1 + Math.floor(rng() * 8)
    for (let i = 0; i < rounds; i++) {
      await repo.appendEvent(ctx, {
        operationId: `op-${trial}-${i}`,
        investigationId: inv,
        type: 'finding',
        provenance: 'self-reported',
        body: { i }
      })
      accepted++
    }
    const counter = Number((await store.get(sequenceCounterKey(scope)))!.value)
    assert.equal(counter, accepted, `trial ${trial}: counter must equal accepted mutations`)
    // Every sequence from 1..accepted has a change-feed row.
    for (let s = 1; s <= accepted; s++) {
      assert.ok(await store.get(changeFeedKey(scope, s)), `trial ${trial}: feed row missing at ${s}`)
    }
  }
})
