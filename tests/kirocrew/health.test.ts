import assert from 'node:assert/strict'
import test from 'node:test'
import { createKiroCrewHealthReader, type KiroCrewHealthDependencies } from '../../server/kirocrew/health'
import type { KiroCrewRevision } from '../../server/kirocrew/types'

const secret = 'SYNTHETIC-PRIVATE-VALUE'
function revision(): KiroCrewRevision {
  return {
    schemaVersion: 1, revision: 3, updatedAt: '2026-09-16T00:00:00Z', publishedBy: secret,
    records: [
      { name: 'kirocrew.bootstrap', type: 'setting', value: {
        payload: { revision: 3, uri: `s3://${secret}/payload`, sizeBytes: 12, sha256: 'a'.repeat(64) }
      } },
      { name: 'kirocrew.organization', type: 'setting', value: {} },
      { name: 'service.password', type: 'secret', value: secret }
    ]
  }
}
function dependencies(overrides: Partial<KiroCrewHealthDependencies> = {}): KiroCrewHealthDependencies {
  return {
    current: async () => revision(),
    durableConfiguration: () => true,
    payloadHead: async value => ({ revision: value, sizeBytes: 12, sha256: 'a'.repeat(64), contentType: 'application/x-tar' }),
    durablePayload: () => true,
    payloadSizeCap: () => 4 * 1024 * 1024,
    runtimeInstalled: () => false,
    ...overrides
  }
}
function enabledRevision(): KiroCrewRevision {
  const value = revision()
  value.records[1] = { name: 'kirocrew.organization', type: 'setting', value: {
    collaboration: {
      schemaVersion: 1, enabled: true, tenantId: '11111111-1111-1111-1111-111111111111',
      sourceBindings: [{ bindingId: 'jira', sourceType: 'jira', instanceFingerprint: 'b'.repeat(64) }],
      evidencePolicies: [{ policyId: 'policy', permittedEvidenceClasses: ['jira-issue'], permittedMediaTypes: ['application/json'],
        maxExplicitArtifactBytes: 1024, requireRedaction: true }],
      workflowProfiles: [{ workflowProfileId: 'workflow', version: 1, label: 'Workflow',
        stages: [{ stageId: 'active', label: 'Active' }], transitions: [], defaultStageId: 'active' }],
      teamSpaces: [{ spaceId: 'pilot', label: secret, enabled: true,
        memberGroupObjectIds: ['22222222-2222-2222-2222-222222222222'],
        sourceScopes: [{ bindingId: 'jira' }], evidencePolicyId: 'policy', workflowProfileIds: ['workflow'] }]
    }
  } }
  return value
}

test('healthy configuration remains distinct from disabled collaboration and unknown workers', async () => {
  const health = await createKiroCrewHealthReader(dependencies())()
  assert.equal(health.configuration, 'healthy')
  assert.equal(health.collaboration, 'disabled')
  assert.equal(health.revision, 3)
  assert.equal(health.checks.find(check => check.id === 'lifecycle-workers')?.state, 'unverified')
  assert.equal(health.checks.find(check => check.id === 'pilot-acceptance')?.state, 'unverified')
  assert.ok(!JSON.stringify(health).includes(secret))
})

test('enabled profiles never turn disconnected or merely installed runtime green', async () => {
  for (const installed of [false, true]) {
    const health = await createKiroCrewHealthReader(dependencies({
      current: async () => enabledRevision(), runtimeInstalled: () => installed
    }))()
    assert.equal(health.configuration, 'healthy')
    assert.equal(health.collaboration, installed ? 'unverified' : 'not-ready')
    assert.equal(health.profile?.enabledSpaces, 1)
    assert.ok(!JSON.stringify(health).includes(secret))
    assert.ok(!JSON.stringify(health).includes('22222222'))
    assert.ok(!JSON.stringify(health).includes('b'.repeat(64)))
  }
})

test('empty, malformed and unreadable profiles report actionable non-green states', async () => {
  const empty = await createKiroCrewHealthReader(dependencies({ current: async () => null }))()
  assert.equal(empty.configuration, 'attention')
  assert.equal(empty.revision, null)
  const invalid = revision()
  invalid.records[1] = { name: 'kirocrew.organization', type: 'setting', value: { collaboration: { enabled: secret } } }
  const bad = await createKiroCrewHealthReader(dependencies({ current: async () => invalid }))()
  assert.equal(bad.profile, null)
  assert.equal(bad.configuration, 'attention')
  assert.equal(bad.collaboration, 'not-ready')
  const unreadable = await createKiroCrewHealthReader(dependencies({ current: async () => { throw new Error(secret) } }))()
  assert.equal(unreadable.configuration, 'unavailable')
  assert.equal(unreadable.collaboration, 'unknown')
  for (const health of [empty, bad, unreadable]) assert.ok(!JSON.stringify(health).includes(secret))
})

test('memory storage and missing, mismatched, oversized or inaccessible payloads cannot be verified', async () => {
  const overrides: Partial<KiroCrewHealthDependencies>[] = [
    { durableConfiguration: () => false },
    { durablePayload: () => false },
    { payloadHead: async () => null },
    { payloadHead: async () => ({ revision: 3, sizeBytes: 12, sha256: 'b'.repeat(64), contentType: '' }) },
    { payloadHead: async () => ({ revision: 3, sizeBytes: 11, sha256: 'a'.repeat(64), contentType: '' }) },
    { payloadSizeCap: () => 1 },
    { payloadHead: async () => { throw new Error(secret) } }
  ]
  for (const override of overrides) {
    const health = await createKiroCrewHealthReader(dependencies(override))()
    assert.equal(health.configuration, 'attention')
    assert.ok(!JSON.stringify(health).includes(secret))
  }
})

test('slow reads are bounded and coalesced, then recover on the next refresh', async () => {
  let calls = 0
  let release!: (value: KiroCrewRevision) => void
  const pending = new Promise<KiroCrewRevision>(resolve => { release = resolve })
  const read = createKiroCrewHealthReader(dependencies({ current: () => { calls++; return pending } }), 5)
  const results = await Promise.all([read(), read(), read()])
  assert.ok(results.every(result => result.configuration === 'unavailable'))
  assert.equal(calls, 1)
  release(revision())
  await new Promise(resolve => setImmediate(resolve))
  assert.equal((await read()).configuration, 'healthy')
  assert.equal(calls, 2)
})
