/**
 * Ghostv2 tests for declarative Workflow_Profile validation, defaults, and
 * version retention (feature: shared-investigations, task 1.4).
 *
 * Covers:
 *  - Deep declarative validation of stages, transitions, checklist items,
 *    evidence expectations, checkpoint templates, and immutable source commits
 *    (Requirements 18.1, 18.13).
 *  - Default Stages Investigating / Waiting / Ready for handoff / Complete
 *    (Requirement 18.2).
 *  - Per-id version uniqueness and retention so pinned Investigations resolve
 *    their version and no published version is pruned (Requirements 18.3-18.5,
 *    18.14).
 *  - The same rules enforced through the full profile boundary
 *    (validateCollaborationSection), which raises CollaborationProfileError
 *    while preserving the workflow reason.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_STAGE_ID,
  DEFAULT_WORKFLOW_STAGES,
  WorkflowProfileError,
  assertRetainedWorkflowVersions,
  resolvePinnedWorkflowVersion,
  validateWorkflowProfileVersion,
  withWorkflowDefaults
} from '../../server/kirocrew/collaboration/workflow-profile.ts'
import {
  CollaborationProfileError,
  validateCollaborationSection
} from '../../server/kirocrew/collaboration/profile.ts'
import { collaborationSectionSchema } from '../../server/kirocrew/collaboration/profile-schema.ts'
import type { CollaborationWorkflowProfile } from '../../server/kirocrew/collaboration/profile-schema.ts'

const COMMIT = 'b'.repeat(40)
const OTHER_COMMIT = 'c'.repeat(40)
const TENANT = '11111111-1111-1111-1111-111111111111'
const GROUP_A = '22222222-2222-2222-2222-222222222222'
const FINGERPRINT = 'a'.repeat(64)

/** Build a fully-defaulted workflow profile version by parsing through the schema. */
function workflowVersion(overrides: Record<string, unknown> = {}): CollaborationWorkflowProfile {
  const raw = {
    workflowProfileId: 'wf:landing-zone',
    version: 1,
    label: 'Landing Zone',
    stages: [
      { stageId: 'investigating', label: 'Investigating' },
      { stageId: 'complete', label: 'Complete' }
    ],
    transitions: [{ from: 'investigating', to: 'complete' }],
    defaultStageId: 'investigating',
    ...overrides
  }
  // Parse just the workflow slice through the full section schema so defaults
  // (checklistItems, evidenceExpectations, checkpointTemplate) are applied.
  const section = collaborationSectionSchema.parse({
    schemaVersion: 1,
    enabled: false,
    tenantId: TENANT,
    sourceBindings: [{ bindingId: 'b1', sourceType: 'jira', instanceFingerprint: FINGERPRINT }],
    evidencePolicies: [
      {
        policyId: 'p1',
        permittedEvidenceClasses: ['jira-issue'],
        permittedMediaTypes: ['application/json'],
        maxExplicitArtifactBytes: 1024,
        requireRedaction: false
      }
    ],
    workflowProfiles: [raw],
    teamSpaces: []
  })
  return section.workflowProfiles[0]!
}

// ---- defaults (Requirement 18.2) --------------------------------------------

test('default stages cover Investigating, Waiting, Ready for handoff, and Complete', () => {
  const ids = DEFAULT_WORKFLOW_STAGES.map(s => s.stageId)
  assert.deepEqual(ids, ['investigating', 'waiting', 'ready-for-handoff', 'complete'])
  assert.equal(DEFAULT_STAGE_ID, 'investigating')
})

test('withWorkflowDefaults preserves declared stages and default stage', () => {
  const profile = workflowVersion()
  const defaulted = withWorkflowDefaults(profile)
  assert.deepEqual(defaulted.stages.map(s => s.stageId), ['investigating', 'complete'])
  assert.equal(defaulted.defaultStageId, 'investigating')
})

test('withWorkflowDefaults falls back to the default stage when the declared default is missing', () => {
  const profile = { ...workflowVersion(), defaultStageId: 'not-declared' }
  const defaulted = withWorkflowDefaults(profile)
  // 'investigating' is a declared stage, so it is chosen over the invalid default.
  assert.equal(defaulted.defaultStageId, 'investigating')
})

// ---- single-version declarative validation (Requirement 18.1) ---------------

test('a valid workflow version with checklist, expectations, and checkpoint validates', () => {
  const profile = workflowVersion({
    checklistItems: [{ checklistItemId: 'c1', label: 'Gather evidence', required: true, stageId: 'investigating' }],
    evidenceExpectations: [
      { expectationId: 'e1', label: 'Jira issue', evidenceClasses: ['jira-issue'], checklistItemId: 'c1' }
    ],
    checkpointTemplate: { requireForCompletion: true, sections: [{ sectionId: 's1', label: 'Summary' }] }
  })
  assert.doesNotThrow(() => validateWorkflowProfileVersion(profile))
})

test('a checklist item referencing an undeclared stage is rejected', () => {
  const profile = workflowVersion({
    checklistItems: [{ checklistItemId: 'c1', label: 'x', stageId: 'ghost-stage' }]
  })
  assert.throws(
    () => validateWorkflowProfileVersion(profile),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'unknown_checklist_stage'
  )
})

test('an evidence expectation referencing an undeclared checklist item is rejected', () => {
  const profile = workflowVersion({
    evidenceExpectations: [{ expectationId: 'e1', label: 'x', evidenceClasses: ['jira-issue'], checklistItemId: 'missing' }]
  })
  assert.throws(
    () => validateWorkflowProfileVersion(profile),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'unknown_expectation_checklist_item'
  )
})

test('an evidence expectation outside the space evidence policy is rejected', () => {
  const profile = workflowVersion({
    evidenceExpectations: [{ expectationId: 'e1', label: 'x', evidenceClasses: ['gitlab-pipeline'] }]
  })
  assert.throws(
    () => validateWorkflowProfileVersion(profile, new Set(['jira-issue'])),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'expectation_outside_policy'
  )
})

test('duplicate checklist item ids are rejected', () => {
  const profile = workflowVersion({
    checklistItems: [
      { checklistItemId: 'c1', label: 'a' },
      { checklistItemId: 'c1', label: 'b' }
    ]
  })
  assert.throws(
    () => validateWorkflowProfileVersion(profile),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'duplicate_checklist_item'
  )
})

test('duplicate checkpoint template section ids are rejected', () => {
  const profile = workflowVersion({
    checkpointTemplate: { sections: [{ sectionId: 's1', label: 'a' }, { sectionId: 's1', label: 'b' }] }
  })
  assert.throws(
    () => validateWorkflowProfileVersion(profile),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'duplicate_checkpoint_section'
  )
})

// ---- immutable source commit (Requirement 18.13) ----------------------------

test('sourceCommit and gitlabSource.commit must agree when both are present', () => {
  const profile = workflowVersion({ sourceCommit: COMMIT, gitlabSource: { commit: OTHER_COMMIT } })
  assert.throws(
    () => validateWorkflowProfileVersion(profile),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'inconsistent_source_commit'
  )
})

test('agreeing source commit references validate', () => {
  const profile = workflowVersion({ sourceCommit: COMMIT, gitlabSource: { commit: COMMIT } })
  assert.doesNotThrow(() => validateWorkflowProfileVersion(profile))
})

// ---- retention and pinned resolution (Requirements 18.3-18.5, 18.14) --------

test('every published version is retained and resolvable by (id, version)', () => {
  const v1 = workflowVersion({ version: 1 })
  const v2 = workflowVersion({ version: 2, label: 'Landing Zone v2' })
  const retained = assertRetainedWorkflowVersions([v1, v2])
  assert.equal(retained.get('wf:landing-zone')?.size, 2)
  assert.equal(resolvePinnedWorkflowVersion(retained, 'wf:landing-zone', 1)?.label, 'Landing Zone')
  assert.equal(resolvePinnedWorkflowVersion(retained, 'wf:landing-zone', 2)?.label, 'Landing Zone v2')
})

test('a pinned version that was never published does not resolve', () => {
  const retained = assertRetainedWorkflowVersions([workflowVersion({ version: 1 })])
  assert.equal(resolvePinnedWorkflowVersion(retained, 'wf:landing-zone', 99), undefined)
})

test('a duplicate (id, version) pair is rejected', () => {
  assert.throws(
    () => assertRetainedWorkflowVersions([workflowVersion({ version: 1 }), workflowVersion({ version: 1 })]),
    (e: unknown) => e instanceof WorkflowProfileError && e.reason === 'duplicate_workflow_version'
  )
})

// ---- through the full profile boundary --------------------------------------

function fullSection(workflowOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    enabled: true,
    tenantId: TENANT,
    sourceBindings: [{ bindingId: 'bind:jira', sourceType: 'jira', instanceFingerprint: FINGERPRINT }],
    evidencePolicies: [
      {
        policyId: 'pol:default',
        permittedEvidenceClasses: ['jira-issue', 'checkpoint-document'],
        permittedMediaTypes: ['application/json'],
        maxExplicitArtifactBytes: 1024 * 1024,
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
        ...workflowOverrides
      }
    ],
    teamSpaces: [
      {
        spaceId: 'space:pilot',
        label: 'Pilot',
        enabled: true,
        memberGroupObjectIds: [GROUP_A],
        sourceScopes: [{ bindingId: 'bind:jira' }],
        evidencePolicyId: 'pol:default',
        workflowProfileIds: ['wf:landing-zone']
      }
    ]
  }
}

test('deep workflow errors surface through validateCollaborationSection as CollaborationProfileError', () => {
  const raw = fullSection({
    evidenceExpectations: [{ expectationId: 'e1', label: 'x', evidenceClasses: ['gitlab-pipeline'] }]
  })
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (e: unknown) => e instanceof CollaborationProfileError && e.reason === 'expectation_outside_policy'
  )
})

test('an inconsistent source commit is rejected through the full boundary', () => {
  const raw = fullSection({ sourceCommit: COMMIT, gitlabSource: { commit: OTHER_COMMIT } })
  assert.throws(
    () => validateCollaborationSection({ collaboration: raw }),
    (e: unknown) => e instanceof CollaborationProfileError && e.reason === 'inconsistent_source_commit'
  )
})

test('a valid deep workflow definition validates through the full boundary', () => {
  const raw = fullSection({
    checklistItems: [{ checklistItemId: 'c1', label: 'Gather', required: true, stageId: 'investigating' }],
    evidenceExpectations: [{ expectationId: 'e1', label: 'Jira', evidenceClasses: ['jira-issue'], checklistItemId: 'c1' }],
    checkpointTemplate: { requireForCompletion: true, sections: [{ sectionId: 's1', label: 'Summary', required: true }] },
    sourceCommit: COMMIT
  })
  const section = validateCollaborationSection({ collaboration: raw })
  assert.equal(section.workflowProfiles[0]?.checklistItems.length, 1)
  assert.equal(section.workflowProfiles[0]?.checkpointTemplate.requireForCompletion, true)
})
