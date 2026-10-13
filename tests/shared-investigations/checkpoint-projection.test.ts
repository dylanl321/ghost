/**
 * Ghostv2 unit tests for the Checkpoint/Handoff API projection adapter
 * (task 9.2).
 *
 * The domain services (CheckpointService / HandoffService) own the rules; this
 * adapter binds them to the Collaboration_API ports (task 9.1). These tests
 * verify only the seam:
 *  - `publishCheckpoint` returns a `MutationAck` carrying the accepted
 *    Server_Sequence and the candidate id as `objectId` (Requirement 12.2).
 *  - `readHandoff` returns a SAFE Handoff view: the selected Checkpoint is
 *    projected without the Object_Store document id or author internals, and the
 *    Coverage_Watermark / High_Water_Mark / newer Events / Evidence_Index are
 *    preserved (Requirement 12.5, 12.10, 16.1).
 *  - `continueHandoff` follows a scope-bound cursor and surfaces the domain
 *    service's non-disclosing not-found for a foreign cursor (Requirement 12.7,
 *    12.8).
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
import { CheckpointApiProjection } from '../../server/kirocrew/collaboration/checkpoint-projection.ts'
import { InMemoryObjectStorageBackend } from '../../server/kirocrew/collaboration/artifact-store.ts'
import { InMemoryTransactionalRecordStore } from '../../server/kirocrew/collaboration/record-store.ts'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors.ts'
import type { InvestigationScope } from '../../server/kirocrew/collaboration/keys.ts'
import type { CommandContext } from '../../server/kirocrew/collaboration/repository-types.ts'
import type { CheckpointRecord, HandoffEvent } from '../../server/kirocrew/collaboration/checkpoint-types.ts'
import type { SafeHandoffView } from '../../server/kirocrew/collaboration/checkpoint-projection.ts'

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

function buildProjection(readModel: InMemoryCheckpointReadModel) {
  const store = new InMemoryTransactionalRecordStore()
  const documents = new CheckpointDocumentStore(new InMemoryObjectStorageBackend())
  const checkpoints = new CheckpointService(store, documents, readModel, makeClock())
  const handoffs = new HandoffService(readModel, new HandoffCursorCodec('handoff-test-key'))
  return new CheckpointApiProjection(checkpoints, handoffs)
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

test('publishCheckpoint returns a MutationAck with the candidate id as objectId', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.addEvent(scope, handoffEvent(1))
  const projection = buildProjection(readModel)

  const ack = await projection.publishCheckpoint(ctx, {
    operationId: 'op-1',
    investigationId: INVESTIGATION,
    summary: 'Where is the latency coming from?',
    citedEventIds: ['evt-1']
  })

  assert.equal(ack.operationId, 'op-1')
  assert.equal(ack.acceptedServerSequence, 1)
  assert.ok(ack.objectId) // the immutable candidate id
})

test('readHandoff returns a safe projection without Object_Store or author internals', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 2 })
  const checkpoint: CheckpointRecord = {
    checkpointId: 'cp-sel',
    investigationId: INVESTIGATION,
    tenantId: TENANT,
    spaceId: SPACE,
    author: { tenantId: TENANT, entraObjectId: 'oid-1' },
    currentQuestion: 'Root cause?',
    citedEventIds: ['evt-1'],
    citedArtifactIds: [],
    coverageWatermark: 2,
    documentArtifactId: 'cpd-secret',
    serverSequence: 2,
    operationId: 'op-1',
    createdAt: '2024-01-01T00:00:00.000Z'
  }
  readModel.addCheckpoint(scope, checkpoint)
  readModel.selectCheckpoint(scope, 'cp-sel', 2)
  readModel.addEvent(scope, handoffEvent(3))

  const view = (await buildProjection(readModel).readHandoff(scope)) as SafeHandoffView
  assert.ok(view)
  assert.equal(view.revision, 2)
  assert.equal(view.selectedCheckpoint?.checkpointId, 'cp-sel')
  assert.equal(view.coverageWatermark, 2)
  assert.deepEqual(view.newerEvents.map((e) => e.serverSequence), [3])
  // The safe projection drops the Object_Store document id and author internals.
  const asRecord = view.selectedCheckpoint as unknown as Record<string, unknown>
  assert.equal(asRecord.documentArtifactId, undefined)
  assert.equal(asRecord.author, undefined)
  assert.equal(asRecord.operationId, undefined)
})

test('readHandoff returns null for an unknown Investigation', async () => {
  const projection = buildProjection(new InMemoryCheckpointReadModel())
  assert.equal(await projection.readHandoff(scope), null)
})

test('continueHandoff follows a scope-bound cursor and rejects a foreign cursor', async () => {
  const readModel = new InMemoryCheckpointReadModel()
  readModel.setInvestigation(scope, { revision: 0 })
  for (let s = 1; s <= 3; s++) readModel.addEvent(scope, handoffEvent(s))
  const projection = buildProjection(readModel)

  const first = (await projection.readHandoff(scope, { eventPageSize: 1 })) as SafeHandoffView
  assert.ok(first.newerEventsCursor)

  const next = await projection.continueHandoff(scope, first.newerEventsCursor!)
  assert.equal(next.stream, 'events')

  const foreign: InvestigationScope = { tenantId: TENANT, spaceId: SPACE, investigationId: 'inv-other' }
  await assert.rejects(
    () => projection.continueHandoff(foreign, first.newerEventsCursor!),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'not_found'
  )
})
