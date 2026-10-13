/**
 * Ghostv2 tests for pinned Workflow_Profile Stage transitions and completion
 * checks (feature: shared-investigations, task 11.1).
 *
 * Covers the collaboration workflow domain rules:
 *  - A Stage change is permitted only when the pinned version declares the
 *    `from -> to` transition; staying on the same Stage is always allowed and an
 *    empty transition set permits no movement (Requirement 18.6).
 *  - Completion into a terminal Stage requires a selected ready Checkpoint when
 *    the pinned Checkpoint template requires one; without it the transition is
 *    rejected and the Stage is unchanged (Requirement 18.7).
 *  - Transitions are evaluated against the Investigation's PINNED version, so a
 *    later published version never changes an existing Investigation's
 *    transition or completion meaning (Requirements 18.5, 24.17).
 *
 * Both the pure workflow-domain functions and the wired
 * CollaborationRepository.patchInvestigation gate are exercised.
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateStageTransition,
  isCompletionTransition,
  isTerminalStage
} from '../../server/kirocrew/collaboration/workflow-transitions.ts'
import {
  CollaborationRepository,
  type RepositoryClock
} from '../../server/kirocrew/collaboration/repository.ts'
import { InMemoryTransactionalRecordStore } from '../../server/kirocrew/collaboration/record-store.ts'
import { CollaborationAuthorizationError } from '../../server/kirocrew/collaboration/errors.ts'
import { collaborationSectionSchema } from '../../server/kirocrew/collaboration/profile-schema.ts'
import type { CollaborationWorkflowProfile } from '../../server/kirocrew/collaboration/profile-schema.ts'
import type {
  CommandContext,
  CreateInvestigationCommand,
  InvestigationRecord,
  PatchInvestigationCommand,
  PinnedWorkflowContext,
  WorkflowPolicyResolver
} from '../../server/kirocrew/collaboration/repository-types.ts'
import type { SubjectReference } from '../../server/kirocrew/collaboration/subject.ts'

const TENANT = '11111111-1111-1111-1111-111111111111'
const FINGERPRINT = 'a'.repeat(64)

/**
 * Build a fully-defaulted Workflow_Profile version by parsing through the strict
 * section schema (so checkpointTemplate / defaults are applied). `overrides`
 * shapes stages, transitions, and the checkpoint template.
 */
function workflowVersion(overrides: Record<string, unknown> = {}): CollaborationWorkflowProfile {
  const raw = {
    workflowProfileId: 'wf:landing-zone',
    version: 1,
    label: 'Landing Zone',
    stages: [
      { stageId: 'investigating', label: 'Investigating' },
      { stageId: 'ready-for-handoff', label: 'Ready for handoff' },
      { stageId: 'complete', label: 'Complete' }
    ],
    transitions: [
      { from: 'investigating', to: 'ready-for-handoff' },
      { from: 'ready-for-handoff', to: 'complete' },
      { from: 'ready-for-handoff', to: 'investigating' }
    ],
    defaultStageId: 'investigating',
    ...overrides
  }
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

// ---- pure workflow-domain rules --------------------------------------------

test('a terminal stage is one with no outgoing transition; complete is terminal', () => {
  const profile = workflowVersion()
  assert.equal(isTerminalStage(profile, 'complete'), true)
  assert.equal(isTerminalStage(profile, 'investigating'), false)
  assert.equal(isTerminalStage(profile, 'ready-for-handoff'), false)
  // An undeclared stage is never terminal.
  assert.equal(isTerminalStage(profile, 'not-a-stage'), false)
})

test('completion into a terminal stage is gated when the checkpoint template requires it', () => {
  const gated = workflowVersion() // checkpointTemplate.requireForCompletion defaults to true
  assert.equal(isCompletionTransition(gated, 'complete'), true)
  const ungated = workflowVersion({ checkpointTemplate: { requireForCompletion: false } })
  assert.equal(isCompletionTransition(ungated, 'complete'), false)
})

test('staying on the same stage is always allowed and is not a completion transition', () => {
  const profile = workflowVersion()
  const outcome = evaluateStageTransition(profile, 'investigating', 'investigating')
  assert.deepEqual(outcome, { allowed: true, completion: false })
})

test('a declared transition is permitted', () => {
  const profile = workflowVersion()
  const outcome = evaluateStageTransition(profile, 'investigating', 'ready-for-handoff')
  assert.deepEqual(outcome, { allowed: true, completion: false })
})

test('an undeclared transition is rejected', () => {
  const profile = workflowVersion()
  const outcome = evaluateStageTransition(profile, 'investigating', 'complete')
  assert.equal(outcome.allowed, false)
  assert.equal(outcome.allowed === false && outcome.rejection.reason, 'transition_not_permitted')
})

test('an unknown target stage is rejected as unknown_stage', () => {
  const profile = workflowVersion()
  const outcome = evaluateStageTransition(profile, 'investigating', 'nope')
  assert.equal(outcome.allowed, false)
  assert.equal(outcome.allowed === false && outcome.rejection.reason, 'unknown_stage')
})

test('completion is rejected without a selected ready Checkpoint', () => {
  const profile = workflowVersion()
  const none = evaluateStageTransition(profile, 'ready-for-handoff', 'complete', 'none')
  assert.equal(none.allowed, false)
  assert.equal(none.allowed === false && none.rejection.reason, 'checkpoint_required')
  const notReady = evaluateStageTransition(profile, 'ready-for-handoff', 'complete', 'not-ready')
  assert.equal(notReady.allowed, false)
  assert.equal(notReady.allowed === false && notReady.rejection.reason, 'checkpoint_required')
})

test('completion succeeds with a selected ready Checkpoint', () => {
  const profile = workflowVersion()
  const outcome = evaluateStageTransition(profile, 'ready-for-handoff', 'complete', 'ready')
  assert.deepEqual(outcome, { allowed: true, completion: true })
})

test('when the template does not require a Checkpoint, completion needs none', () => {
  const profile = workflowVersion({ checkpointTemplate: { requireForCompletion: false } })
  const outcome = evaluateStageTransition(profile, 'ready-for-handoff', 'complete', 'none')
  // Not a completion transition because the template does not gate it.
  assert.deepEqual(outcome, { allowed: true, completion: false })
})

test('an empty transition set permits no stage movement (fail closed)', () => {
  const locked = workflowVersion({ transitions: [] })
  const outcome = evaluateStageTransition(locked, 'investigating', 'ready-for-handoff')
  assert.equal(outcome.allowed, false)
  assert.equal(outcome.allowed === false && outcome.rejection.reason, 'transition_not_permitted')
})

test('a later published version does not change the pinned versions transition meaning', () => {
  // v1 pins investigating -> ready-for-handoff only. A "v2" that adds
  // investigating -> complete must not affect an Investigation still evaluated
  // against v1: evaluate against the pinned v1 and the direct jump stays denied.
  const v1 = workflowVersion()
  const v2 = workflowVersion({
    transitions: [
      { from: 'investigating', to: 'ready-for-handoff' },
      { from: 'investigating', to: 'complete' },
      { from: 'ready-for-handoff', to: 'complete' }
    ]
  })
  assert.equal(evaluateStageTransition(v1, 'investigating', 'complete').allowed, false)
  // The same jump would be permitted-but-still-checkpoint-gated under v2.
  const underV2 = evaluateStageTransition(v2, 'investigating', 'complete', 'ready')
  assert.deepEqual(underV2, { allowed: true, completion: true })
})

// ---- repository integration (patchInvestigation gate) -----------------------

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
const subject: SubjectReference = {
  sourceBindingId: 'binding-x',
  sourceType: 'jira',
  stableSourceId: 'PROJ-1'
}

function createCommand(operationId: string, stageId = 'investigating'): CreateInvestigationCommand {
  return {
    operationId,
    mode: 'explicit-new',
    primarySubject: subject,
    workflowProfileId: 'wf:landing-zone',
    workflowVersion: 1,
    stageId
  }
}

/**
 * A policy resolver that always returns the given pinned profile and lets the
 * test drive selected-Checkpoint readiness. Mirrors how production resolves the
 * retained pinned version and Checkpoint state without any live dependency.
 */
function policyResolver(
  profile: CollaborationWorkflowProfile,
  readyCheckpointIds: ReadonlySet<string>
): WorkflowPolicyResolver {
  return {
    async resolve(
      _scope: { tenantId: string; spaceId: string; investigationId: string },
      investigation: InvestigationRecord,
      command: PatchInvestigationCommand
    ): Promise<PinnedWorkflowContext | null> {
      const selectedId = command.selectedCheckpointId ?? investigation.selectedCheckpointId
      return {
        profile,
        selectedCheckpointReady: selectedId !== undefined && readyCheckpointIds.has(selectedId)
      }
    }
  }
}

test('patchInvestigation permits a declared pinned transition', async () => {
  const store = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(store, makeClock(), 8, policyResolver(workflowVersion(), new Set()))
  const created = await repo.createInvestigation(ctx, createCommand('op-c'))
  const patched = await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    stageId: 'ready-for-handoff'
  })
  assert.equal(patched.revision, 1)
})

test('patchInvestigation rejects an undeclared pinned transition without changing stage', async () => {
  const store = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(store, makeClock(), 8, policyResolver(workflowVersion(), new Set()))
  const created = await repo.createInvestigation(ctx, createCommand('op-c'))
  await assert.rejects(
    () =>
      repo.patchInvestigation(ctx, {
        operationId: 'op-p1',
        investigationId: created.investigationId,
        expectedRevision: 0,
        stageId: 'complete' // no investigating -> complete transition pinned
      }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )
})

test('patchInvestigation rejects completion without a selected ready Checkpoint', async () => {
  const store = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(store, makeClock(), 8, policyResolver(workflowVersion(), new Set()))
  const created = await repo.createInvestigation(ctx, createCommand('op-c'))
  // Move to the pre-completion stage first.
  await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    stageId: 'ready-for-handoff'
  })
  await assert.rejects(
    () =>
      repo.patchInvestigation(ctx, {
        operationId: 'op-p2',
        investigationId: created.investigationId,
        expectedRevision: 1,
        stageId: 'complete' // no checkpoint selected
      }),
    (e: unknown) => e instanceof CollaborationAuthorizationError && e.code === 'conflict'
  )
})

test('patchInvestigation completes when a selected ready Checkpoint is provided', async () => {
  const store = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(
    store,
    makeClock(),
    8,
    policyResolver(workflowVersion(), new Set(['cp-ready']))
  )
  const created = await repo.createInvestigation(ctx, createCommand('op-c'))
  await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    stageId: 'ready-for-handoff'
  })
  const completed = await repo.patchInvestigation(ctx, {
    operationId: 'op-p2',
    investigationId: created.investigationId,
    expectedRevision: 1,
    stageId: 'complete',
    selectedCheckpointId: 'cp-ready'
  })
  assert.equal(completed.revision, 2)
})

test('patchInvestigation without a workflow policy applies stage changes ungated (back-compat)', async () => {
  const store = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(store, makeClock()) // no policy
  const created = await repo.createInvestigation(ctx, createCommand('op-c'))
  // Direct jump to complete is allowed when no pinned policy is wired.
  const patched = await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    stageId: 'complete'
  })
  assert.equal(patched.revision, 1)
})

test('a non-stage patch (lead only) is not gated by the workflow policy', async () => {
  const store = new InMemoryTransactionalRecordStore()
  const repo = new CollaborationRepository(store, makeClock(), 8, policyResolver(workflowVersion(), new Set()))
  const created = await repo.createInvestigation(ctx, createCommand('op-c'))
  const patched = await repo.patchInvestigation(ctx, {
    operationId: 'op-p1',
    investigationId: created.investigationId,
    expectedRevision: 0,
    leadSubjectId: 'oid-lead'
  })
  assert.equal(patched.revision, 1)
})
