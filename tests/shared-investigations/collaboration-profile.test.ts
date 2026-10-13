/**
 * Ghostv2 tests for Shared Investigations collaboration profile validation,
 * safe projection, and atomic publication (feature: shared-investigations,
 * task 1.3).
 *
 * Covers:
 *  - Structural validation of stable ids, source-instance fingerprints, Entra
 *    group object ids, source scopes, evidence policies, workflow versions
 *    (Requirements 2.1, 6.5, 6.7, 6.8, 18.13).
 *  - Disabled-by-default enablement (Requirements 2.8, 22.1).
 *  - Rejecting invalid revisions without replacing the last valid profile
 *    (Requirement 2.10).
 *  - Exposing only safe labels/capabilities to collaboration consumers
 *    (Requirements 2.3, 6.5).
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CollaborationProfileError,
  validateCollaborationSection
} from '../../server/kirocrew/collaboration/profile.ts'
import {
  isCollaborationActive,
  projectSafeSpaces
} from '../../server/kirocrew/collaboration/profile-projection.ts'
import {
  publishCollaborationRevision,
  readCurrentCollaborationSection,
  readCurrentSafeSpaces,
  validateIncomingCollaboration
} from '../../server/kirocrew/collaboration/profile-service.ts'
import { validateKiroCrewRecords } from '../../server/kirocrew/schema.ts'
import { publishKiroCrewRevision } from '../../server/kirocrew/service.ts'
import {
  KiroCrewRevisionConflict,
  setKiroCrewRepositoryForTest
} from '../../server/kirocrew/repository.ts'
import type { KiroCrewRepository, KiroCrewRevision } from '../../server/kirocrew/types.ts'

/**
 * A test-local, per-instance in-memory revision store. The production
 * MemoryKiroCrewRepository shares module-global state across instances, which
 * would leak revision numbers between tests; this isolated implementation gives
 * every test a clean CURRENT pointer.
 */
class IsolatedRepository implements KiroCrewRepository {
  private history = new Map<number, KiroCrewRevision>()
  private currentRevision = 0

  async current(): Promise<KiroCrewRevision | null> {
    const revision = this.currentRevision ? this.history.get(this.currentRevision) : null
    return revision ? structuredClone(revision) : null
  }

  async revision(revision: number): Promise<KiroCrewRevision | null> {
    const stored = this.history.get(revision)
    return stored ? structuredClone(stored) : null
  }

  async publish(input: {
    expectedRevision: number
    records: KiroCrewRevision['records']
    publishedBy: string
  }): Promise<KiroCrewRevision> {
    if (this.currentRevision !== input.expectedRevision) {
      throw new KiroCrewRevisionConflict(this.currentRevision)
    }
    const revision: KiroCrewRevision = {
      schemaVersion: 1,
      revision: this.currentRevision + 1,
      updatedAt: new Date().toISOString(),
      publishedBy: input.publishedBy,
      records: structuredClone(input.records)
    }
    this.history.set(revision.revision, revision)
    this.currentRevision = revision.revision
    return structuredClone(revision)
  }

  async repoint(revision: number): Promise<KiroCrewRevision> {
    const target = this.history.get(revision)
    if (!target) throw new Error(`cannot re-point to revision ${revision}`)
    this.currentRevision = revision
    return structuredClone(target)
  }
}

const TENANT = '11111111-1111-1111-1111-111111111111'
const GROUP_A = '22222222-2222-2222-2222-222222222222'
const GROUP_B = '33333333-3333-3333-3333-333333333333'
const FINGERPRINT = 'a'.repeat(64)
const COMMIT = 'b'.repeat(40)

function collaborationSection(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    enabled: true,
    tenantId: TENANT,
    sourceBindings: [
      { bindingId: 'bind:jira:prod', sourceType: 'jira', instanceFingerprint: FINGERPRINT }
    ],
    evidencePolicies: [
      {
        policyId: 'pol:default',
        permittedEvidenceClasses: ['jira-issue', 'checkpoint-document'],
        permittedMediaTypes: ['application/json', 'text/markdown'],
        maxExplicitArtifactBytes: 5 * 1024 * 1024,
        requireRedaction: true
      }
    ],
    workflowProfiles: [
      {
        workflowProfileId: 'wf:landing-zone',
        version: 1,
        label: 'Landing Zone',
        stages: [
          { stageId: 'investigating', label: 'Investigating' },
          { stageId: 'complete', label: 'Complete' }
        ],
        transitions: [{ from: 'investigating', to: 'complete' }],
        defaultStageId: 'investigating',
        gitlabSource: { commit: COMMIT }
      }
    ],
    teamSpaces: [
      {
        spaceId: 'space:pilot',
        label: 'Pilot Team',
        enabled: true,
        memberGroupObjectIds: [GROUP_A, GROUP_B],
        sourceScopes: [{ bindingId: 'bind:jira:prod' }],
        evidencePolicyId: 'pol:default',
        workflowProfileIds: ['wf:landing-zone']
      }
    ],
    ...overrides
  }
}

function organizationRecords(collaboration: unknown, expectedRevision = 0): unknown {
  return {
    expectedRevision,
    records: [
      {
        name: 'kirocrew.bootstrap',
        type: 'setting',
        value: {
          schemaVersion: 1,
          identityCenter: {
            startUrl: 'https://example.awsapps.com/start',
            ssoRegion: 'us-east-1'
          }
        }
      },
      {
        name: 'kirocrew.organization',
        type: 'setting',
        value: collaboration === undefined ? {} : { collaboration }
      }
    ]
  }
}

test('a well-formed enabled collaboration section validates', () => {
  const section = validateCollaborationSection({ collaboration: collaborationSection() })
  assert.equal(section.enabled, true)
  assert.equal(section.tenantId, TENANT)
  assert.equal(section.teamSpaces.length, 1)
  assert.equal(section.teamSpaces[0]?.memberGroupObjectIds.length, 2)
  assert.ok(isCollaborationActive(section))
})

test('collaboration is disabled by default when the section is absent', () => {
  const section = validateCollaborationSection({ apps: {} })
  assert.equal(section.enabled, false)
  assert.equal(section.teamSpaces.length, 0)
  assert.equal(isCollaborationActive(section), false)
})

test('an omitted enabled flag does not activate collaboration', () => {
  const raw = collaborationSection()
  delete (raw as Record<string, unknown>).enabled
  const section = validateCollaborationSection({ collaboration: raw })
  assert.equal(section.enabled, false)
})

test('a pilot space stays disabled unless explicitly enabled', () => {
  const raw = collaborationSection()
  ;(raw.teamSpaces as Array<Record<string, unknown>>)[0]!.enabled = false
  const section = validateCollaborationSection({ collaboration: raw })
  assert.equal(section.enabled, true)
  // Enabled section but no enabled space => not active, no spaces exposed.
  assert.equal(isCollaborationActive(section), false)
  assert.equal(projectSafeSpaces(section).length, 0)
})

test('a group display name instead of an object id (GUID) is rejected', () => {
  const raw = collaborationSection()
  ;(raw.teamSpaces as Array<Record<string, unknown>>)[0]!.memberGroupObjectIds = ['Cloud Admins']
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'schema'
  )
})

test('a non-hex source instance fingerprint is rejected', () => {
  const raw = collaborationSection()
  ;(raw.sourceBindings as Array<Record<string, unknown>>)[0]!.instanceFingerprint = 'not-a-digest'
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'schema'
  )
})

test('a GitLab-sourced workflow profile without a full commit sha is rejected', () => {
  const raw = collaborationSection()
  ;(raw.workflowProfiles as Array<Record<string, unknown>>)[0]!.gitlabSource = { commit: 'abc123' }
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'schema'
  )
})

test('an unknown source-scope binding reference is rejected', () => {
  const raw = collaborationSection()
  ;(raw.teamSpaces as Array<Record<string, unknown>>)[0]!.sourceScopes = [{ bindingId: 'bind:missing' }]
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'unknown_source_binding'
  )
})

test('an unknown evidence policy reference is rejected', () => {
  const raw = collaborationSection()
  ;(raw.teamSpaces as Array<Record<string, unknown>>)[0]!.evidencePolicyId = 'pol:missing'
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'unknown_evidence_policy'
  )
})

test('an unknown workflow profile reference is rejected', () => {
  const raw = collaborationSection()
  ;(raw.teamSpaces as Array<Record<string, unknown>>)[0]!.workflowProfileIds = ['wf:missing']
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'unknown_workflow_profile'
  )
})

test('a duplicate workflow profile version is rejected', () => {
  const raw = collaborationSection()
  const wf = (raw.workflowProfiles as Array<Record<string, unknown>>)[0]!
  ;(raw.workflowProfiles as Array<unknown>).push({ ...wf })
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'duplicate_workflow_version'
  )
})

test('distinct versions of the same workflow profile are allowed', () => {
  const raw = collaborationSection()
  const wf = (raw.workflowProfiles as Array<Record<string, unknown>>)[0]!
  ;(raw.workflowProfiles as Array<unknown>).push({ ...wf, version: 2 })
  const section = validateCollaborationSection({ collaboration: raw })
  assert.equal(section.workflowProfiles.length, 2)
})

test('a default stage outside the declared stages is rejected', () => {
  const raw = collaborationSection()
  ;(raw.workflowProfiles as Array<Record<string, unknown>>)[0]!.defaultStageId = 'nope'
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'unknown_default_stage'
  )
})

test('a transition referencing an undeclared stage is rejected', () => {
  const raw = collaborationSection()
  ;(raw.workflowProfiles as Array<Record<string, unknown>>)[0]!.transitions = [
    { from: 'investigating', to: 'ghost-stage' }
  ]
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'unknown_transition_stage'
  )
})

test('a duplicate team space id is rejected', () => {
  const raw = collaborationSection()
  const space = (raw.teamSpaces as Array<Record<string, unknown>>)[0]!
  ;(raw.teamSpaces as Array<unknown>).push({ ...space })
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'duplicate_id'
  )
})

test('an unexpected key in the collaboration section is rejected (no smuggled endpoints)', () => {
  const raw = collaborationSection({ endpoint: 'https://collab.internal.example' })
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (error: unknown) => error instanceof CollaborationProfileError && error.reason === 'schema'
  )
})

test('the safe projection exposes only labels and capabilities', () => {
  const section = validateCollaborationSection({ collaboration: collaborationSection() })
  const spaces = projectSafeSpaces(section)
  assert.equal(spaces.length, 1)
  const [space] = spaces
  assert.deepEqual(Object.keys(space!).sort(), ['capabilities', 'label', 'spaceId'])
  const serialized = JSON.stringify(spaces)
  // No protected values leak: group object ids, fingerprints, tenant id.
  assert.equal(serialized.includes(GROUP_A), false)
  assert.equal(serialized.includes(GROUP_B), false)
  assert.equal(serialized.includes(FINGERPRINT), false)
  assert.equal(serialized.includes(TENANT), false)
  assert.ok(space!.capabilities.includes('read'))
  assert.ok(space!.capabilities.includes('contribute'))
})

test('a disabled collaboration section exposes no spaces', () => {
  const raw = collaborationSection({ enabled: false })
  const section = validateCollaborationSection({ collaboration: raw })
  assert.equal(projectSafeSpaces(section).length, 0)
})

test('validateIncomingCollaboration reads the organization record collaboration section', () => {
  const records = [
    {
      name: 'kirocrew.organization',
      type: 'setting' as const,
      value: { collaboration: collaborationSection() }
    }
  ]
  const section = validateIncomingCollaboration(records)
  assert.equal(section.enabled, true)
})

test('publishing a valid collaboration revision advances CURRENT', async () => {
  setKiroCrewRepositoryForTest(new IsolatedRepository())
  try {
    const revision = await publishCollaborationRevision(
      organizationRecords(collaborationSection()),
      'admin@example.test'
    )
    assert.equal(revision.revision, 1)
    const section = await readCurrentCollaborationSection()
    assert.equal(section.enabled, true)
    const spaces = await readCurrentSafeSpaces()
    assert.equal(spaces.length, 1)
    assert.equal(spaces[0]?.label, 'Pilot Team')
  } finally {
    setKiroCrewRepositoryForTest(undefined)
  }
})

test('the existing admin publisher rejects invalid collaboration without advancing CURRENT', async () => {
  const repository = new IsolatedRepository()
  setKiroCrewRepositoryForTest(repository)
  try {
    // Configuration-only publishers retain their existing behavior.
    await publishKiroCrewRevision(organizationRecords(undefined), 'admin@example.test')
    const before = await repository.current()
    const bad = collaborationSection()
    ;(bad.teamSpaces as Array<Record<string, unknown>>)[0]!.memberGroupObjectIds = ['invalid-group']
    await assert.rejects(
      publishKiroCrewRevision(organizationRecords(bad, 1), 'admin@example.test'),
      (error: unknown) => {
        const response = error as { statusCode?: number; statusMessage?: string }
        assert.equal(response.statusCode, 400)
        assert.equal(response.statusMessage, 'Invalid collaboration profile')
        return true
      }
    )
    assert.deepEqual(await repository.current(), before)
    assert.equal(await repository.revision(2), null)
    const accepted = await publishKiroCrewRevision(
      organizationRecords(collaborationSection({ enabled: false }), 1),
      'admin@example.test'
    )
    assert.equal(accepted.revision, 2)
  } finally {
    setKiroCrewRepositoryForTest(undefined)
  }
})

test('a rejected collaboration revision does not replace the last valid profile', async () => {
  setKiroCrewRepositoryForTest(new IsolatedRepository())
  try {
    // Establish a valid CURRENT profile at revision 1.
    await publishCollaborationRevision(
      organizationRecords(collaborationSection({ enabled: false })),
      'admin@example.test'
    )
    const before = await readCurrentCollaborationSection()
    assert.equal(before.enabled, false)

    // Attempt to publish an invalid collaboration section (bad group id).
    const bad = collaborationSection()
    ;(bad.teamSpaces as Array<Record<string, unknown>>)[0]!.memberGroupObjectIds = ['Cloud Admins']
    const badInput = organizationRecords(bad, 1)
    await assert.rejects(
      publishCollaborationRevision(badInput, 'admin@example.test'),
      (error: unknown) => error instanceof CollaborationProfileError
    )

    // CURRENT is unchanged: still the valid revision 1 disabled profile.
    const after = await readCurrentCollaborationSection()
    assert.equal(after.enabled, false)
  } finally {
    setKiroCrewRepositoryForTest(undefined)
  }
})

test('the disabled organization record without collaboration reads as disabled', async () => {
  setKiroCrewRepositoryForTest(new IsolatedRepository())
  try {
    await publishCollaborationRevision(organizationRecords(undefined), 'admin@example.test')
    const section = await readCurrentCollaborationSection()
    assert.equal(section.enabled, false)
    assert.equal((await readCurrentSafeSpaces()).length, 0)
  } finally {
    setKiroCrewRepositoryForTest(undefined)
  }
})

test('published organization records still satisfy the base Kiro Crew record validator', () => {
  const input = organizationRecords(collaborationSection()) as { records: unknown }
  // The collaboration section is nested under kirocrew.organization.value and
  // must not trip the credential/secret-shape guards.
  assert.doesNotThrow(() => validateKiroCrewRecords(input.records))
})
