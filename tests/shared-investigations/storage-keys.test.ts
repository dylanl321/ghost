/**
 * Ghostv2 unit tests for the CollaborationRepository storage-key and
 * indexed-access-pattern layer (task 3.2).
 *
 * These verify:
 *  - Every collaboration key embeds Tenant + Team_Space and round-trips its
 *    scope; changing either scope produces a disjoint key (Requirement 7.2).
 *  - The key encoding is injective even when a component contains the
 *    structural delimiter (Stable_Source_ID is arbitrary text).
 *  - Presence keys are built from the STABLE Subject_Reference and the
 *    observer/gateway/activity tuple, independent of the mutable display label;
 *    optional Investigation/Run metadata is never part of the key
 *    (Requirements 6.6-6.10, 15.2-15.5, 15.11).
 *  - Every documented access pattern resolves to Get/Query/BatchGet — never a
 *    Scan — and direct record/presence reads are strongly consistent
 *    (Requirements 7.11, 7.12, 10.16-10.18, 15.4).
 *
 * Feature: shared-investigations (task 3.2).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import {
  CollaborationAccessPatterns,
  investigationBrowseAttributes,
  investigationBrowsePartition,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from '../../server/kirocrew/collaboration/access-patterns.ts'
import {
  changeFeedKey,
  GSI1_PK,
  GSI1_SK,
  checkFinishKey,
  checkpointKey,
  creationOperationKey,
  decodeComponent,
  deletionJobKey,
  encodeComponent,
  eventKey,
  idempotencyKey,
  investigationMetaKey,
  padSequence,
  presenceLeaseKey,
  presencePartition,
  runKey,
  scopeFromPartitionKey,
  sequenceCounterKey,
  subjectPointerKey,
  tombstoneKey,
  type InvestigationScope,
  type PresenceObserver,
  type SpaceScope
} from '../../server/kirocrew/collaboration/keys.ts'
import type { SubjectReference } from '../../server/kirocrew/collaboration/subject.ts'

const scope: SpaceScope = { tenantId: 'tenant-A', spaceId: 'space-1' }
const invScope: InvestigationScope = { ...scope, investigationId: 'inv-9' }
const subject: SubjectReference = {
  sourceBindingId: 'binding-x',
  sourceType: 'jira',
  stableSourceId: 'PROJ-123',
  displayLabel: 'Ticket about the printer'
}

const TABLE = 'ghost-collaboration'
const ap = new CollaborationAccessPatterns(TABLE)

/** Collect the partition keys produced by every space/investigation key. */
function everyKey(s: SpaceScope, i: InvestigationScope) {
  return [
    sequenceCounterKey(s),
    changeFeedKey(s, 42),
    creationOperationKey(s, 'op-1'),
    subjectPointerKey(s, subject, i.investigationId),
    investigationMetaKey(i),
    runKey(i, 'run-1'),
    eventKey(i, 7, 'evt-1'),
    checkFinishKey(i, 'chk-1'),
    checkpointKey(i, 'cp-1'),
    idempotencyKey(i, 'op-2'),
    presenceLeaseKey(s, subject, { subjectObjectId: 'oid-1', gatewayId: 'gw-1', activityKind: 'viewing' }),
    tombstoneKey(i),
    deletionJobKey(i, 'objects')
  ]
}

test('every collaboration key embeds and round-trips its Tenant + Team_Space', () => {
  for (const { pk } of everyKey(scope, invScope)) {
    const parsed = scopeFromPartitionKey(pk)
    assert.ok(parsed, `key ${pk} should parse to a scope`)
    assert.equal(parsed!.tenantId, scope.tenantId)
    assert.equal(parsed!.spaceId, scope.spaceId)
  }
})

test('changing Tenant or Team_Space produces disjoint keys', () => {
  const composite = (k: { pk: string; sk: string }) => `${k.pk}\u0000${k.sk}`
  const base = everyKey(scope, invScope)
  const otherTenant = everyKey({ tenantId: 'tenant-B', spaceId: 'space-1' }, {
    tenantId: 'tenant-B',
    spaceId: 'space-1',
    investigationId: 'inv-9'
  })
  const otherSpace = everyKey({ tenantId: 'tenant-A', spaceId: 'space-2' }, {
    tenantId: 'tenant-A',
    spaceId: 'space-2',
    investigationId: 'inv-9'
  })

  // Every key's partition key must change when its scope changes.
  for (let i = 0; i < base.length; i++) {
    assert.notEqual(base[i].pk, otherTenant[i].pk, `tenant change must alter key: ${base[i].pk}`)
    assert.notEqual(base[i].pk, otherSpace[i].pk, `space change must alter key: ${base[i].pk}`)
  }

  // No full-key collision across scopes: keys from one scope are disjoint from
  // the other scopes' keys. (Within a scope, many rows legitimately share one
  // partition key, so uniqueness is asserted per-scope on the composite key.)
  const baseSet = new Set(base.map(composite))
  const otherSets = [otherTenant, otherSpace].map((ks) => new Set(ks.map(composite)))
  for (const other of otherSets) {
    for (const k of other) {
      assert.ok(!baseSet.has(k), `cross-scope key collision on ${k}`)
    }
  }
})

test('component encoding is injective across the structural delimiter', () => {
  // A stableSourceId that itself contains the delimiter must not collide with a
  // different subject whose components split at a different boundary.
  const a: SubjectReference = { sourceBindingId: 'b', sourceType: 'gitlab', stableSourceId: 'a#b' }
  const bb: SubjectReference = { sourceBindingId: 'b', sourceType: 'gitlab', stableSourceId: 'a', displayLabel: 'x' }
  const cc: SubjectReference = { sourceBindingId: 'b#type', sourceType: 'gitlab', stableSourceId: 'b' }
  const keys = new Set([
    presencePartition(scope, a),
    presencePartition(scope, bb),
    presencePartition(scope, cc)
  ])
  assert.equal(keys.size, 3)
})

test('encode/decode component round-trips delimiter and escape chars', () => {
  for (const raw of ['plain', 'has#hash', 'has~tilde', '~1literal', 'a#b~c#~0d', '']) {
    assert.equal(decodeComponent(encodeComponent(raw)), raw)
  }
})

test('presence key ignores the mutable display label', () => {
  const observer: PresenceObserver = { subjectObjectId: 'oid-1', gatewayId: 'gw-1', activityKind: 'viewing' }
  const withLabel = presenceLeaseKey(scope, subject, observer)
  const relabeled = presenceLeaseKey(
    scope,
    { ...subject, displayLabel: 'A COMPLETELY DIFFERENT LABEL' },
    observer
  )
  assert.deepEqual(withLabel, relabeled)
})

test('presence partition is stable per subject; observer tuple distinguishes leases', () => {
  const viewing = presenceLeaseKey(scope, subject, {
    subjectObjectId: 'oid-1',
    gatewayId: 'gw-1',
    activityKind: 'viewing'
  })
  const working = presenceLeaseKey(scope, subject, {
    subjectObjectId: 'oid-1',
    gatewayId: 'gw-1',
    activityKind: 'working'
  })
  const otherGateway = presenceLeaseKey(scope, subject, {
    subjectObjectId: 'oid-1',
    gatewayId: 'gw-2',
    activityKind: 'viewing'
  })
  // Same subject partition...
  assert.equal(viewing.pk, working.pk)
  assert.equal(viewing.pk, otherGateway.pk)
  // ...but three distinct leases.
  assert.equal(new Set([viewing.sk, working.sk, otherGateway.sk]).size, 3)
})

test('scopeFromPartitionKey rejects unrelated strings', () => {
  assert.equal(scopeFromPartitionKey('PROFILE#default'), null)
  assert.equal(scopeFromPartitionKey('SPACE#only-two'), null)
  assert.equal(scopeFromPartitionKey(''), null)
})

test('padded sequences sort lexically in numeric order', () => {
  const seqs = [1, 2, 10, 100, 9999].map(padSequence)
  const sorted = [...seqs].sort()
  assert.deepEqual(sorted, seqs)
})

// --- Access patterns: no Scan, correct consistency ---------------------------

test('direct record reads are strongly consistent GetItem requests', () => {
  const gets = [
    ap.getInvestigationMeta(invScope),
    ap.getCreationOperationLookup(scope, 'op-1'),
    ap.getArtifact(invScope, 'art-1')
  ]
  for (const g of gets) {
    assert.equal(g.op, 'Get')
    assert.equal(g.tableName, TABLE)
    assert.equal(g.consistentRead, true)
    const key = unmarshall(g.key as any)
    assert.ok(key.pk && key.sk, 'GetItem must target a full primary key')
  }
})

test('investigation-partition queries are strongly consistent base-table Queries', () => {
  const queries = [
    ap.queryTimeline(invScope),
    ap.queryRuns(invScope),
    ap.queryCheckpoints(invScope),
    ap.queryArtifacts(invScope),
    ap.queryPresenceForSubject(scope, subject)
  ]
  for (const q of queries) {
    assert.equal(q.op, 'Query')
    assert.equal(q.indexName, undefined, 'base-table read must not use a GSI')
    assert.equal(q.consistentRead, true)
    assert.match(q.keyConditionExpression, /#pk = :pk/)
  }
})

test('subject lookup is a scope-contained Query over the stable subject prefix', () => {
  const q = ap.queryInvestigationsBySubject(scope, subject)
  assert.equal(q.op, 'Query')
  assert.equal(q.indexName, undefined)
  const values = unmarshall(q.expressionAttributeValues as any)
  const parsed = scopeFromPartitionKey(values[':pk'])
  assert.deepEqual(parsed, scope)
  // The prefix must be built from stable identity, not the display label.
  assert.ok(!String(values[':skprefix']).includes(subject.displayLabel!))
  assert.ok(String(values[':skprefix']).includes(encodeComponent(subject.stableSourceId)))
})

test('active/archived browsing uses the InvestigationBrowse GSI, not a scan', () => {
  const active = ap.browseInvestigations(scope, 'active')
  const archived = ap.browseInvestigations(scope, 'archived')
  for (const q of [active, archived]) {
    assert.equal(q.op, 'Query')
    assert.equal(q.indexName, 'InvestigationBrowse')
    // GSIs cannot be strongly consistent.
    assert.equal(q.consistentRead, false)
    // Most-recent first.
    assert.equal(q.scanIndexForward, false)
  }
  const activeValues = unmarshall(active.expressionAttributeValues as any)
  const archivedValues = unmarshall(archived.expressionAttributeValues as any)
  assert.notEqual(activeValues[':gpk'], archivedValues[':gpk'])
  assert.ok(String(activeValues[':gpk']).includes('active'))
  assert.ok(String(archivedValues[':gpk']).includes('archived'))
})

test('browse GSI attributes are scope-contained and recency-ordered', () => {
  const attrs = unmarshall(
    investigationBrowseAttributes({
      scope,
      archived: false,
      updatedAt: '2024-01-02T03:04:05.000Z',
      investigationId: 'inv-9'
    }) as any
  )
  assert.equal(attrs[GSI1_PK], investigationBrowsePartition(scope, 'active'))
  assert.ok(String(attrs[GSI1_SK]).startsWith('2024-01-02T03:04:05.000Z#'))
  // Disjoint from another space.
  assert.notEqual(
    investigationBrowsePartition(scope, 'active'),
    investigationBrowsePartition({ tenantId: 'tenant-A', spaceId: 'space-2' }, 'active')
  )
})

test('change feed page defaults to 50 and caps at 200', () => {
  assert.equal(DEFAULT_PAGE_SIZE, 50)
  assert.equal(MAX_PAGE_SIZE, 200)
  const dflt = ap.queryChangeFeed(scope, 0, 1000)
  assert.equal(dflt.limit, 50)
  assert.equal(dflt.consistentRead, true)
  assert.equal(ap.queryChangeFeed(scope, 0, 1000, 500).limit, 200)
  assert.equal(ap.queryChangeFeed(scope, 0, 1000, 10).limit, 10)
  // Scope-contained partition.
  const values = unmarshall(dflt.expressionAttributeValues as any)
  assert.deepEqual(scopeFromPartitionKey(values[':pk']), scope)
})

test('timeline-between excludes the start sequence and includes the high-water mark', () => {
  const q = ap.queryTimelineBetween(invScope, 5, 9)
  const values = unmarshall(q.expressionAttributeValues as any)
  // Lower bound sorts after EVENT#{000..005}#<anything>.
  assert.ok(values[':lo'] > `EVENT#${padSequence(5)}#zzzz`)
  // Upper bound sorts after every event at sequence 9.
  assert.ok(values[':hi'] > `EVENT#${padSequence(9)}#zzzz`)
  // And before sequence 10.
  assert.ok(values[':hi'] < `EVENT#${padSequence(10)}`)
})

test('batch presence fans out to one strong Query per subject with no scan', () => {
  const subjects: SubjectReference[] = [
    subject,
    { sourceBindingId: 'binding-y', sourceType: 'aws', stableSourceId: '123456789012' }
  ]
  const queries = ap.batchPresenceQueries(scope, subjects)
  assert.equal(queries.length, 2)
  for (const q of queries) {
    assert.equal(q.op, 'Query')
    assert.equal(q.consistentRead, true)
    assert.equal(q.indexName, undefined)
  }
  // Distinct subject partitions.
  const v0 = unmarshall(queries[0].expressionAttributeValues as any)
  const v1 = unmarshall(queries[1].expressionAttributeValues as any)
  assert.notEqual(v0[':pk'], v1[':pk'])
})
