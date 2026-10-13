/**
 * Ghostv2 unit tests for the Checkpoint, Handoff, and continuation domain
 * services (task 9.2).
 *
 * These verify the domain rules those services own:
 *  - Checkpoint candidates are IMMUTABLE cited candidates: publishing appends a
 *    candidate, stores the detailed document in the Object_Store, and captures a
 *    Coverage_Watermark; a conflicting retry preserves every candidate
 *    (Requirement 12.1, 12.2, 12.4).
 *  - Citations are validated against authorized Ready Artifacts / durable Events
 *    in the SAME Investigation; a dangling citation fails validation and writes
 *    nothing (Requirement 12.1).
 *  - Publication is idempotent by Operation_ID: identical replay returns the
 *    same candidate without a second Server_Sequence; a different payload
 *    conflicts (Requirement 7.6 shape).
 *  - Handoff returns the Selected_Checkpoint, its Coverage_Watermark, the Events
 *    newer than the watermark up to a FIXED High_Water_Mark, and the first
 *    Evidence_Index page, with continuation cursors bound to the fixed mark and
 *    scope (Requirement 12.5-12.9, 16.1).
 *  - Newer-than-Checkpoint follows Server_Sequence, not timestamps
 *    (Requirement 12.9).
 *  - A cursor bound to another scope / a tampered cursor is non-disclosing
 *    (Requirement 12.7, 12.8).
 *  - A selected Checkpoint that has become unavailable stops the Handoff
 *    (Requirement 16.9).
 *
 * Feature: shared-investigations (task 9.2).
 */
import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CheckpointService,
  HandoffService,
  HandoffCursorCodec,
  type CheckpointClock
} from '../../server/kirocrew/collaboration/checkpoint-service.ts'
import { CheckpointDocumentStore } from '../../server/kirocrew/collaboration/checkpoint-document-store.ts'
import { InMemoryCheckpointReadModel } from '../../server/kirocrew/collaboration/checkpoint-read-model.ts'
import { InMemoryObjectStorageBackend } from '../../server/kirocrew/collaboration/artifact-store.ts'
import { InMemoryTransactionalRecordStore } from '../../server/kirocrew/collaboration/record-store.ts'
import { checkpointKey, changeFeedKey, type InvestigationScope } from '../../server/kirocrew/collaboration/keys.ts'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors.ts'
import type { CommandContext } from '../../server/kirocrew/collaboration/repository-types.ts'
import type { CheckpointRecord, HandoffEvent } from '../../server/kirocrew/collaboration/checkpoint-types.ts'

const TENANT = 'tenant-A'
const SPACE = 'space-1'
const INVESTIGATION = 'inv-1'

const scope: InvestigationScope = { tenantId: TENANT, spaceId: SPACE, investigationId: INVESTIGATION }
const ctx: CommandContext = {
  tenantId: TENANT,
  spaceId: SPACE,
  author: { tenantId: TENANT, entraObjectId: 'oid-1' },
  gatewayId: 'gw-1'
}

function makeClock(seed = 0): CheckpointClock {
  let n = seed
  let t = Date.parse('2024-01-01T00:00:00.000Z')
  return {
    now: () => new Date((t += 1000)),
    newCheckpointId: () => `cp-${++n}`,
    newCheckpointDocumentId: () => `cpd-${n}`
  }
}

function buildService(readModel?: InMemoryCheckpointReadModel) {
  const store = new InMemoryTransactionalRecordStore()
  const backend = new InMemoryObjectStorageBackend()
  const documents = new CheckpointDocumentStore(backend)
  const citations = readModel ?? new InMemoryCheckpointReadModel()
  const service = new CheckpointService(store, documents, citations, makeClock())
  return { store, backend, documents, citations, service }
}

function handoffEvent(seq: number, overrides: Partial<HandoffEvent> = {}): HandoffEvent {
  return {
    eventId: `evt-${seq}`,
    investigationId: INVESTIGATION,
    type: 'finding',
    serverSequence: seq,
    occurredAt: '2024-01-01T00:00:00.000Z',
    provenance: 'adapter',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// CheckpointService.publishCheckpoint
// ---------------------------------------------------------------------------

test('publishing an immutable candidate writes the record, feed entry, and Object_Store document', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.addEvent(scope, handoffEvent(1))
  const { store, backend, service } = buildService(readModel)

  const ack = await service.publishCheckpoint(ctx, {
    operationId: 'op-1',
    investigationId: INVESTIGATION,
    summary: 'Where is the latency coming from?',
    citedEventIds: ['evt-1'],
    content: {
      currentQuestion: 'Where is the latency coming from?',
      observedFacts: [{ text: 'p99 spiked at 14:00', citationIds: ['evt-1'] }]
    }
  })

  assert.equal(ack.operationId, 'op-1')
  assert.equal(ack.acceptedServerSequence, 1)
  assert.equal(ack.coverageWatermark, 1)
  assert.ok(ack.checkpointId)

  // The immutable candidate row exists at its checkpoint key.
  const row = await store.get(checkpointKey(scope, ack.checkpointId))
  assert.ok(row)
  assert.equal(row!.recordType, 'checkpoint')
  assert.equal((row as unknown as CheckpointRecord).currentQuestion, 'Where is the latency coming from?')
  assert.deepEqual((row as unknown as CheckpointRecord).citedEventIds, ['evt-1'])

  // A Change_Feed entry was written at the accepted sequence, kind checkpoint.
  const feed = await store.get(changeFeedKey({ tenantId: TENANT, spaceId: SPACE }, 1))
  assert.ok(feed)
  assert.equal(feed!.kind, 'checkpoint')

  // The detailed document is stored write-once in the Object_Store.
  const documentId = (row as unknown as CheckpointRecord).documentArtifactId
  const stored = await backend.head(`t/${TENANT}/s/${SPACE}/i/${INVESTIGATION}/a/${documentId}/document`)
  assert.equal(stored.exists, true)
})

test('an identical publish replays without a second candidate or Server_Sequence', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.addEvent(scope, handoffEvent(5))
  const { service } = buildService(readModel)

  const first = await service.publishCheckpoint(ctx, {
    operationId: 'op-dup',
    investigationId: INVESTIGATION,
    summary: 'Q',
    citedEventIds: ['evt-5']
  })
  const second = await service.publishCheckpoint(ctx, {
    operationId: 'op-dup',
    investigationId: INVESTIGATION,
    summary: 'Q',
    citedEventIds: ['evt-5']
  })

  assert.deepEqual(second, first)
})

test('reusing an Operation_ID with a different checkpoint payload conflicts', async () => {
  const { service } = buildService()
  await service.publishCheckpoint(ctx, { operationId: 'op-x', investigationId: INVESTIGATION, summary: 'A' })
  await assert.rejects(
    () => service.publishCheckpoint(ctx, { operationId: 'op-x', investigationId: INVESTIGATION, summary: 'B' }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )
})

test('publishing many candidates preserves every prior candidate (append-only)', async () => {
  const { store, service } = buildService()
  const a = await service.publishCheckpoint(ctx, { operationId: 'op-a', investigationId: INVESTIGATION, summary: 'A' })
  const b = await service.publishCheckpoint(ctx, { operationId: 'op-b', investigationId: INVESTIGATION, summary: 'B' })
  assert.notEqual(a.checkpointId, b.checkpointId)
  // Both candidate rows still exist; neither was rewritten.
  assert.ok(await store.get(checkpointKey(scope, a.checkpointId)))
  assert.ok(await store.get(checkpointKey(scope, b.checkpointId)))
})

test('a citation that does not resolve in this Investigation fails validation and writes nothing', async () => {
  const { store, service } = buildService()
  await assert.rejects(
    () =>
      service.publishCheckpoint(ctx, {
        operationId: 'op-bad',
        investigationId: INVESTIGATION,
        summary: 'Q',
        citedEventIds: ['evt-does-not-exist']
      }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
  // No sequence was consumed and no candidate row exists.
  const counter = await store.get({ pk: `SPACE#${TENANT}#${SPACE}`, sk: 'SEQ#COUNTER' })
  assert.equal(counter, null)
})

test('an artifact citation must be a READY artifact in the same Investigation', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  // A ready artifact in this investigation is citable.
  readModel.addReadyArtifact(scope, {
    artifactId: 'art-1',
    sanitizedFilename: 'log.txt',
    mediaType: 'text/plain; charset=utf-8',
    byteCount: 10,
    sha256: 'a'.repeat(64),
    serverSequence: 2
  })
  const { service } = buildService(readModel)
  const ok = await service.publishCheckpoint(ctx, {
    operationId: 'op-art',
    investigationId: INVESTIGATION,
    summary: 'Q',
    citedArtifactIds: ['art-1']
  })
  assert.ok(ok.checkpointId)

  // An unknown artifact is rejected.
  await assert.rejects(
    () =>
      service.publishCheckpoint(ctx, {
        operationId: 'op-art-bad',
        investigationId: INVESTIGATION,
        summary: 'Q',
        citedArtifactIds: ['art-missing']
      }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'validation_failed'
  )
})

// ---------------------------------------------------------------------------
// HandoffService.readHandoff
// ---------------------------------------------------------------------------

function buildHandoff(readModel: InMemoryCheckpointReadModel) {
  return new HandoffService(readModel, new HandoffCursorCodec('handoff-test-key'))
}

test('readHandoff returns null for an unknown Investigation (non-disclosing not-found upstream)', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  const handoff = buildHandoff(readModel)
  assert.equal(await handoff.readHandoff(scope), null)
})

test('readHandoff returns selected Checkpoint, watermark, newer Events, and Evidence_Index', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 4 })

  const checkpoint: CheckpointRecord = {
    checkpointId: 'cp-sel',
    investigationId: INVESTIGATION,
    tenantId: TENANT,
    spaceId: SPACE,
    author: { tenantId: TENANT, entraObjectId: 'oid-1' },
    currentQuestion: 'Root cause?',
    citedEventIds: ['evt-1'],
    citedArtifactIds: [],
    coverageWatermark: 3,
    documentArtifactId: 'cpd-1',
    serverSequence: 3,
    operationId: 'op-1',
    createdAt: '2024-01-01T00:00:00.000Z'
  }
  readModel.addCheckpoint(scope, checkpoint)
  readModel.selectCheckpoint(scope, 'cp-sel', 4)

  // Events: two before the watermark, two after.
  readModel.addEvent(scope, handoffEvent(1))
  readModel.addEvent(scope, handoffEvent(2))
  readModel.addEvent(scope, handoffEvent(4))
  readModel.addEvent(scope, handoffEvent(5))
  // Ready artifacts (Evidence_Index).
  readModel.addReadyArtifact(scope, {
    artifactId: 'art-1', sanitizedFilename: 'a.txt', mediaType: 'text/plain; charset=utf-8', byteCount: 1, sha256: 'a'.repeat(64), serverSequence: 6
  })

  const handoff = buildHandoff(readModel)
  const view = await handoff.readHandoff(scope)
  assert.ok(view)
  assert.equal(view!.revision, 4)
  assert.equal(view!.selectedCheckpoint?.checkpointId, 'cp-sel')
  assert.equal(view!.coverageWatermark, 3)
  assert.equal(view!.highWaterMark, 6)
  // Only Events with Server_Sequence > 3 are "newer than the Checkpoint".
  assert.deepEqual(view!.newerEvents.map((e) => e.serverSequence), [4, 5])
  assert.equal(view!.evidenceIndex.length, 1)
  assert.equal(view!.evidenceIndex[0]!.artifactId, 'art-1')
})

test('newer-than-Checkpoint follows Server_Sequence, not client timestamps', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 1 })
  const checkpoint: CheckpointRecord = {
    checkpointId: 'cp-1', investigationId: INVESTIGATION, tenantId: TENANT, spaceId: SPACE,
    author: { tenantId: TENANT, entraObjectId: 'oid-1' }, currentQuestion: 'Q',
    citedEventIds: [], citedArtifactIds: [], coverageWatermark: 2, documentArtifactId: 'd', serverSequence: 2, operationId: 'op', createdAt: 'x'
  }
  readModel.addCheckpoint(scope, checkpoint)
  readModel.selectCheckpoint(scope, 'cp-1', 1)
  // Event with an EARLIER timestamp but a LATER sequence must still be "newer".
  readModel.addEvent(scope, handoffEvent(3, { occurredAt: '2000-01-01T00:00:00.000Z' }))
  // Event with a LATER timestamp but a sequence at/below the watermark is not.
  readModel.addEvent(scope, handoffEvent(2, { occurredAt: '2099-01-01T00:00:00.000Z' }))

  const view = await buildHandoff(readModel).readHandoff(scope)
  assert.deepEqual(view!.newerEvents.map((e) => e.serverSequence), [3])
})

test('a Handoff without a selected Checkpoint still returns newer Events from sequence 0', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  readModel.addEvent(scope, handoffEvent(1))
  readModel.addEvent(scope, handoffEvent(2))
  const view = await buildHandoff(readModel).readHandoff(scope)
  assert.equal(view!.selectedCheckpoint, null)
  assert.equal(view!.coverageWatermark, 0)
  assert.deepEqual(view!.newerEvents.map((e) => e.serverSequence), [1, 2])
})

test('a selected Checkpoint that has become unavailable stops the Handoff', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 1, selectedCheckpointId: 'cp-gone' })
  // No checkpoint record for cp-gone.
  assert.equal(await buildHandoff(readModel).readHandoff(scope), null)
})

// ---------------------------------------------------------------------------
// Handoff pagination + cursors.
// ---------------------------------------------------------------------------

test('Handoff paginates newer Events with a scope-bound continuation cursor', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  for (let s = 1; s <= 5; s++) readModel.addEvent(scope, handoffEvent(s))
  const handoff = buildHandoff(readModel)

  const first = await handoff.readHandoff(scope, { eventPageSize: 2 })
  assert.deepEqual(first!.newerEvents.map((e) => e.serverSequence), [1, 2])
  assert.ok(first!.newerEventsCursor)

  const next = await handoff.continueHandoff(scope, first!.newerEventsCursor!)
  assert.equal(next.stream, 'events')
  assert.deepEqual(next.items.map((e) => e.serverSequence), [3, 4])
  assert.ok(next.nextCursor)

  const last = await handoff.continueHandoff(scope, next.nextCursor!)
  assert.deepEqual(last.items.map((e) => e.serverSequence), [5])
  assert.equal(last.nextCursor, undefined)
})

test('Handoff paginates the Evidence_Index with its own cursor stream', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  for (let s = 1; s <= 3; s++) {
    readModel.addReadyArtifact(scope, {
      artifactId: `art-${s}`, sanitizedFilename: `a${s}.txt`, mediaType: 'text/plain; charset=utf-8',
      byteCount: 1, sha256: 'a'.repeat(64), serverSequence: s
    })
  }
  const handoff = buildHandoff(readModel)
  const first = await handoff.readHandoff(scope, { evidencePageSize: 2 })
  assert.deepEqual(first!.evidenceIndex.map((a) => a.artifactId), ['art-1', 'art-2'])
  assert.ok(first!.evidenceIndexCursor)
  const next = await handoff.continueHandoff(scope, first!.evidenceIndexCursor!)
  assert.equal(next.stream, 'evidence')
  assert.deepEqual(next.items.map((a) => (a as { artifactId: string }).artifactId), ['art-3'])
})

test('a cursor bound to another Investigation is a non-disclosing not-found', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  for (let s = 1; s <= 3; s++) readModel.addEvent(scope, handoffEvent(s))
  const handoff = buildHandoff(readModel)
  const first = await handoff.readHandoff(scope, { eventPageSize: 1 })
  const otherScope: InvestigationScope = { tenantId: TENANT, spaceId: SPACE, investigationId: 'inv-other' }
  await assert.rejects(
    () => handoff.continueHandoff(otherScope, first!.newerEventsCursor!),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
  )
})

test('a tampered Handoff cursor is a non-disclosing not-found', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  const handoff = buildHandoff(readModel)
  await assert.rejects(
    () => handoff.continueHandoff(scope, 'not.a-valid-cursor'),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
  )
})

test('the fixed High_Water_Mark excludes Events written after the Handoff started', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  readModel.addEvent(scope, handoffEvent(1))
  readModel.addEvent(scope, handoffEvent(2))
  const handoff = buildHandoff(readModel)
  const view = await handoff.readHandoff(scope, { eventPageSize: 1 })
  assert.equal(view!.highWaterMark, 2)
  // A later write lands after the mark was fixed.
  readModel.addEvent(scope, handoffEvent(3))
  // Following the cursor stays bounded by the ORIGINAL fixed mark (<= 2).
  const next = await handoff.continueHandoff(scope, view!.newerEventsCursor!)
  assert.deepEqual(next.items.map((e) => e.serverSequence), [2])
  assert.equal(next.nextCursor, undefined)
})
