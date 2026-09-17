/**
 * Ghostv2 unit tests for the CollaborationQueryService read side (task 3.5).
 *
 * These verify the read rules the query service owns on top of the repository's
 * transactional writes:
 *  - Strong metadata reads and non-disclosing null for an unknown Investigation
 *    (Requirement 10.14, 10.15, 4.7).
 *  - Subject search resolves by the STABLE Subject_Reference, not the mutable
 *    display label (Requirement 6.10, 10.18).
 *  - Active / archived browsing are disjoint, recency-ordered views
 *    (Requirement 10.18).
 *  - The immutable Event timeline is read in Server_Sequence order, never by
 *    client timestamp (Requirement 7.10, 19.1, 19.2).
 *  - Check_ID pairing pairs starts and finishes ONLY by `(Investigation_ID,
 *    Check_ID)`, and a start with no matching finish at or below the fixed read
 *    High_Water_Mark is `incomplete`; a later finish surfaces only at a higher
 *    mark (Requirement 14.1, 14.10, 24.11).
 *  - Pre-ID creation recovery resolves by Operation_ID: original ack for a
 *    matching payload, conflict for a mismatch, unresolved before commit
 *    (Requirement 10.16, 14.14, 24.6, 24.26).
 *
 * Feature: shared-investigations (task 3.5).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CollaborationQueryService,
  InMemoryCollaborationReadStore,
  pairChecks
} from '../../server/kirocrew/collaboration/query-service.ts'
import {
  CollaborationRepository,
  canonicalPayloadHash,
  type RepositoryClock
} from '../../server/kirocrew/collaboration/repository.ts'
import { InMemoryTransactionalRecordStore } from '../../server/kirocrew/collaboration/record-store.ts'
import type { SpaceScope, InvestigationScope } from '../../server/kirocrew/collaboration/keys.ts'
import type {
  CommandContext,
  CreateInvestigationCommand,
  EventRecord,
  InvestigationRecord,
  RunRecord
} from '../../server/kirocrew/collaboration/repository-types.ts'
import type { SubjectReference } from '../../server/kirocrew/collaboration/subject.ts'

const scope: SpaceScope = { tenantId: 'tenant-A', spaceId: 'space-1' }
const author = { tenantId: 'tenant-A', entraObjectId: 'oid-1' }
const ctx: CommandContext = { ...scope, author, gatewayId: 'gw-1' }

const subject: SubjectReference = {
  sourceBindingId: 'binding-x',
  sourceType: 'jira',
  stableSourceId: 'PROJ-1'
}

function invScope(investigationId: string): InvestigationScope {
  return { ...scope, investigationId }
}

function makeInvestigation(
  overrides: Partial<InvestigationRecord> & { investigationId: string }
): InvestigationRecord {
  return {
    tenantId: scope.tenantId,
    spaceId: scope.spaceId,
    primarySubject: subject,
    workflowProfileId: 'wf-1',
    workflowVersion: 1,
    stageId: 'investigating',
    revision: 0,
    archived: false,
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z',
    lastMutationSequence: 1,
    ...overrides
  }
}

function checkEvent(
  overrides: Partial<EventRecord> & { eventId: string; serverSequence: number; type: EventRecord['type'] }
): EventRecord {
  return {
    investigationId: 'inv-1',
    author,
    gatewayId: 'gw-1',
    occurredAt: '2024-01-01T00:00:00.000Z',
    receivedAt: '2024-01-01T00:00:00.000Z',
    operationId: `op-${overrides.eventId}`,
    provenance: 'adapter',
    ...overrides
  }
}

// --- Strong metadata reads ---------------------------------------------------

test('getInvestigation returns the metadata record and null for an unknown id', async () => {
  const store = new InMemoryCollaborationReadStore()
  store.putInvestigation(scope, makeInvestigation({ investigationId: 'inv-1' }))
  const svc = new CollaborationQueryService(store)

  const found = await svc.getInvestigation(invScope('inv-1'))
  assert.equal(found?.investigationId, 'inv-1')
  assert.equal(await svc.getInvestigation(invScope('inv-missing')), null)
})

// --- Subject search resolves by stable identity, not label -------------------

test('findInvestigationsBySubject resolves by stable Subject_Reference regardless of display label', async () => {
  const store = new InMemoryCollaborationReadStore()
  store.putInvestigation(
    scope,
    makeInvestigation({
      investigationId: 'inv-1',
      primarySubject: { ...subject, displayLabel: 'Original label' },
      updatedAt: '2024-01-01T00:00:01.000Z'
    })
  )
  store.putInvestigation(
    scope,
    makeInvestigation({
      investigationId: 'inv-2',
      primarySubject: { ...subject, displayLabel: 'Renamed label' },
      updatedAt: '2024-01-01T00:00:02.000Z'
    })
  )
  const svc = new CollaborationQueryService(store)

  // A query by the SAME stable identity but a different label still matches both.
  const results = await svc.findInvestigationsBySubject(scope, {
    ...subject,
    displayLabel: 'Whatever the caller typed'
  })
  assert.deepEqual(
    results.map((r) => r.investigationId),
    ['inv-2', 'inv-1'] // most-recent first
  )

  // A different stable subject returns nothing.
  const none = await svc.findInvestigationsBySubject(scope, {
    ...subject,
    stableSourceId: 'PROJ-999'
  })
  assert.deepEqual(none, [])
})

// --- Active / archived browsing are disjoint recency-ordered views -----------

test('browseInvestigations separates active and archived and orders by recency', async () => {
  const store = new InMemoryCollaborationReadStore()
  store.putInvestigation(
    scope,
    makeInvestigation({ investigationId: 'inv-active-1', updatedAt: '2024-01-01T00:00:01.000Z' })
  )
  store.putInvestigation(
    scope,
    makeInvestigation({ investigationId: 'inv-active-2', updatedAt: '2024-01-01T00:00:03.000Z' })
  )
  store.putInvestigation(
    scope,
    makeInvestigation({
      investigationId: 'inv-archived',
      archived: true,
      updatedAt: '2024-01-01T00:00:02.000Z'
    })
  )
  const svc = new CollaborationQueryService(store)

  const active = await svc.browseInvestigations(scope)
  assert.deepEqual(
    active.map((r) => r.investigationId),
    ['inv-active-2', 'inv-active-1']
  )
  const archived = await svc.browseInvestigations(scope, { archived: true })
  assert.deepEqual(
    archived.map((r) => r.investigationId),
    ['inv-archived']
  )
})

// --- Immutable timeline is Server_Sequence ordered, not timestamp ordered ----

test('readTimeline orders events by Server_Sequence even when timestamps disagree', async () => {
  const store = new InMemoryCollaborationReadStore()
  store.putInvestigation(scope, makeInvestigation({ investigationId: 'inv-1' }))
  // Later sequence but EARLIER client timestamp; order must follow sequence.
  store.addEvent(
    scope,
    checkEvent({ eventId: 'e2', serverSequence: 3, type: 'finding', occurredAt: '2020-01-01T00:00:00.000Z' })
  )
  store.addEvent(
    scope,
    checkEvent({ eventId: 'e1', serverSequence: 2, type: 'finding', occurredAt: '2099-01-01T00:00:00.000Z' })
  )
  const svc = new CollaborationQueryService(store)

  const timeline = await svc.readTimeline(invScope('inv-1'))
  assert.deepEqual(
    timeline.events.map((e) => e.eventId),
    ['e1', 'e2']
  )
  assert.equal(timeline.highWaterMark, 3)
})

// --- Check_ID pairing + incomplete at a fixed read High_Water_Mark -----------

test('pairChecks pairs by Check_ID only and marks unmatched starts incomplete', () => {
  // Interleaved checks: check-A start, check-B start, check-A finish. Adjacency
  // and order must NOT pair A-start with B-start; only Check_ID pairs.
  const events: EventRecord[] = [
    checkEvent({ eventId: 'sA', serverSequence: 2, type: 'check-started', checkId: 'A' }),
    checkEvent({ eventId: 'sB', serverSequence: 3, type: 'check-started', checkId: 'B' }),
    checkEvent({ eventId: 'fA', serverSequence: 4, type: 'check-finished', checkId: 'A' })
  ]
  const checks = pairChecks(events)
  const byId = new Map(checks.map((c) => [c.checkId, c]))

  assert.equal(byId.get('A')?.status, 'complete')
  assert.equal(byId.get('A')?.finishEventId, 'fA')
  assert.equal(byId.get('B')?.status, 'incomplete')
  assert.equal(byId.get('B')?.finishEventId, undefined)
})

test('a start is incomplete at a fixed mark and completes only at a later mark', async () => {
  const store = new InMemoryCollaborationReadStore()
  store.putInvestigation(scope, makeInvestigation({ investigationId: 'inv-1' }))
  store.addEvent(scope, checkEvent({ eventId: 's1', serverSequence: 2, type: 'check-started', checkId: 'C1' }))
  const svc = new CollaborationQueryService(store)

  // First read: the fixed High_Water_Mark is 2; no finish exists -> incomplete.
  const first = await svc.readTimeline(invScope('inv-1'))
  assert.equal(first.highWaterMark, 2)
  assert.equal(first.checks.length, 1)
  assert.equal(first.checks[0]!.status, 'incomplete')

  // The finish lands later at sequence 3.
  store.addEvent(scope, checkEvent({ eventId: 'f1', serverSequence: 3, type: 'check-finished', checkId: 'C1' }))

  // Second read: a higher fixed mark now observes the finish -> complete.
  const second = await svc.readTimeline(invScope('inv-1'))
  assert.equal(second.highWaterMark, 3)
  assert.equal(second.checks[0]!.status, 'complete')
  assert.equal(second.checks[0]!.finishEventId, 'f1')
})

// --- Run listing -------------------------------------------------------------

test('listRuns returns the Investigation Runs ordered by Server_Sequence', async () => {
  const store = new InMemoryCollaborationReadStore()
  store.putInvestigation(scope, makeInvestigation({ investigationId: 'inv-1' }))
  const run = (runId: string, serverSequence: number): RunRecord => ({
    runId,
    investigationId: 'inv-1',
    author,
    gatewayId: 'gw-1',
    state: 'active',
    startedAt: '2024-01-01T00:00:00.000Z',
    serverSequence
  })
  store.addRun(scope, run('run-b', 4))
  store.addRun(scope, run('run-a', 2))
  const svc = new CollaborationQueryService(store)

  const runs = await svc.listRuns(invScope('inv-1'))
  assert.deepEqual(
    runs.map((r) => r.runId),
    ['run-a', 'run-b']
  )
})

// --- Pre-ID creation recovery wired through the real repository --------------

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

function createCommand(operationId: string): CreateInvestigationCommand {
  return {
    operationId,
    mode: 'default-first',
    primarySubject: subject,
    workflowProfileId: 'wf-1',
    workflowVersion: 1,
    stageId: 'investigating'
  }
}

test('resolveCreationOperation recovers by Operation_ID before the Investigation ID is known', async () => {
  const recordStore = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(recordStore, makeClock())
  const svc = new CollaborationQueryService(new InMemoryCollaborationReadStore(), repo)

  const command = createCommand('op-create-1')
  const payloadHash = canonicalPayloadHash({
    kind: 'create-investigation',
    mode: command.mode,
    primarySubject: JSON.stringify({
      sourceBindingId: subject.sourceBindingId,
      sourceType: subject.sourceType,
      stableSourceId: subject.stableSourceId
    }),
    relatedSubjects: [],
    workflowProfileId: command.workflowProfileId,
    workflowVersion: command.workflowVersion,
    stageId: command.stageId
  })

  // Unresolved before any creation commits.
  const before = await svc.resolveCreationOperation(scope, 'op-create-1', payloadHash)
  assert.equal(before.status, 'unresolved')

  // After creation, the SAME Operation_ID + matching payload returns the ack.
  const ack = await repo.createInvestigation(ctx, command)
  const resolved = await svc.resolveCreationOperation(scope, 'op-create-1', payloadHash)
  assert.equal(resolved.status, 'resolved')
  if (resolved.status === 'resolved') {
    assert.equal(resolved.ack.investigationId, ack.investigationId)
  }

  // A payload mismatch on the same Operation_ID conflicts, no second creation.
  const mismatch = await svc.resolveCreationOperation(scope, 'op-create-1', 'deadbeef')
  assert.equal(mismatch.status, 'conflict')
})
