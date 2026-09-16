/**
 * Shared Investigations — declarative Workflow_Profile validation, defaults, and
 * version retention (Ghostv2 shared domain/profile module).
 *
 * Feature: shared-investigations (task 1.4). Owner: Ghostv2 shared domain.
 *
 * A Workflow_Profile is an Administrator-published, versioned, DECLARATIVE
 * definition of Stages, transitions, checklist items, evidence expectations, and
 * a Checkpoint template (Requirement 18.1). This module owns the deep validation
 * that the strict Zod schema in `profile-schema.ts` cannot express, plus the
 * defaults and retention rules:
 *
 *  - Default Stages: Investigating, Waiting, Ready for handoff, Complete
 *    (Requirement 18.2). A profile version that declares no stages inherits the
 *    defaults; the defaults are also used to fill a missing default stage.
 *  - Referential integrity: every transition endpoint, default stage, checklist
 *    stage, and evidence-expectation stage/checklist reference resolves to a
 *    declared element (Requirement 18.1).
 *  - Immutable source commit: `sourceCommit` and the backward-compatible
 *    `gitlabSource.commit` are full 40-hex commits and, when both present, must
 *    agree (Requirement 18.13).
 *  - Non-executable definitions: definitions are validated as data only; no
 *    field carries executable content (design: "Definitions contain no
 *    executable code").
 *  - Version retention: every published `(workflowProfileId, version)` pair is a
 *    distinct, individually resolvable definition so that Investigations pinned
 *    to an older version keep their pinned Stage/checklist meaning
 *    (Requirements 18.3-18.5, 18.14). This module never prunes a published
 *    version.
 *
 * Validation failures raise {@link WorkflowProfileError} with a stable machine
 * reason and a safe, non-disclosing message. The atomic publisher must not
 * replace the last valid profile when this throws (Requirement 2.10).
 */
import type { CollaborationWorkflowProfile } from './profile-schema'

/** Raised when a Workflow_Profile version fails declarative validation. */
export class WorkflowProfileError extends Error {
  constructor(
    message: string,
    /** Machine-readable reason for callers/tests; never contains protected values. */
    public readonly reason: string
  ) {
    super(message)
    this.name = 'WorkflowProfileError'
  }
}

function fail(reason: string, message: string): never {
  throw new WorkflowProfileError(message, reason)
}

/**
 * Default Stages provided by the Shared_Investigation_System (Requirement 18.2).
 * Stage identifiers are stable; labels are Operator-visible.
 */
export const DEFAULT_WORKFLOW_STAGES: ReadonlyArray<{ stageId: string; label: string }> = [
  { stageId: 'investigating', label: 'Investigating' },
  { stageId: 'waiting', label: 'Waiting' },
  { stageId: 'ready-for-handoff', label: 'Ready for handoff' },
  { stageId: 'complete', label: 'Complete' }
]

/** The default Stage assigned to a newly created Investigation when unspecified. */
export const DEFAULT_STAGE_ID = 'investigating'

/**
 * Return a copy of a Workflow_Profile version with defaults applied where the
 * published definition omitted them: default Stages when none were declared, and
 * the default Stage id when the declared default is absent from the (now
 * defaulted) stages (Requirement 18.2). Declared values always win; this never
 * overrides an Administrator's explicit choice. Pure and non-mutating.
 */
export function withWorkflowDefaults(
  profile: CollaborationWorkflowProfile
): CollaborationWorkflowProfile {
  const stages = profile.stages.length > 0 ? profile.stages : DEFAULT_WORKFLOW_STAGES.map(s => ({ ...s }))
  const stageIds = new Set(stages.map(s => s.stageId))
  const defaultStageId = stageIds.has(profile.defaultStageId)
    ? profile.defaultStageId
    : stageIds.has(DEFAULT_STAGE_ID)
      ? DEFAULT_STAGE_ID
      : stages[0]!.stageId
  return { ...profile, stages, defaultStageId }
}

/**
 * Validate a single declarative Workflow_Profile version in isolation
 * (Requirement 18.1). Assumes the value already passed the strict Zod schema, so
 * this focuses on referential and cross-field rules the schema cannot express.
 *
 * @param profile the profile version to validate
 * @param permittedEvidenceClasses evidence classes permitted by the Team_Space
 *   Evidence_Policy this profile is offered in, when known. When provided, every
 *   evidence expectation must reference only permitted classes so a workflow
 *   cannot expect evidence the space can never hold.
 */
export function validateWorkflowProfileVersion(
  profile: CollaborationWorkflowProfile,
  permittedEvidenceClasses?: ReadonlySet<string>
): void {
  // Immutable source commit: when both `sourceCommit` and `gitlabSource.commit`
  // are present they must agree; the schema already guarantees each is 40-hex.
  if (
    profile.sourceCommit !== undefined &&
    profile.gitlabSource !== undefined &&
    profile.sourceCommit !== profile.gitlabSource.commit
  ) {
    fail('inconsistent_source_commit', 'workflow profile source commit references disagree')
  }

  // Stage identifiers must be unique within the version.
  const stageIds = new Set<string>()
  for (const stage of profile.stages) {
    if (stageIds.has(stage.stageId)) {
      fail('duplicate_workflow_stage', 'workflow profile declares a duplicate stage')
    }
    stageIds.add(stage.stageId)
  }

  // The default Stage must be one of the declared Stages.
  if (!stageIds.has(profile.defaultStageId)) {
    fail('unknown_default_stage', 'workflow default stage is not a declared stage')
  }

  // Every transition endpoint must reference a declared Stage.
  for (const transition of profile.transitions) {
    if (!stageIds.has(transition.from) || !stageIds.has(transition.to)) {
      fail('unknown_transition_stage', 'workflow transition references an undeclared stage')
    }
  }

  // Checklist item ids are unique; any stage reference resolves to a Stage.
  const checklistIds = new Set<string>()
  for (const item of profile.checklistItems) {
    if (checklistIds.has(item.checklistItemId)) {
      fail('duplicate_checklist_item', 'workflow profile declares a duplicate checklist item')
    }
    checklistIds.add(item.checklistItemId)
    if (item.stageId !== undefined && !stageIds.has(item.stageId)) {
      fail('unknown_checklist_stage', 'workflow checklist item references an undeclared stage')
    }
  }

  // Evidence expectation ids are unique; stage/checklist references resolve; and
  // evidence classes stay within the Team_Space Evidence_Policy when known.
  const expectationIds = new Set<string>()
  for (const expectation of profile.evidenceExpectations) {
    if (expectationIds.has(expectation.expectationId)) {
      fail('duplicate_evidence_expectation', 'workflow profile declares a duplicate evidence expectation')
    }
    expectationIds.add(expectation.expectationId)
    if (expectation.stageId !== undefined && !stageIds.has(expectation.stageId)) {
      fail('unknown_expectation_stage', 'workflow evidence expectation references an undeclared stage')
    }
    if (expectation.checklistItemId !== undefined && !checklistIds.has(expectation.checklistItemId)) {
      fail('unknown_expectation_checklist_item', 'workflow evidence expectation references an undeclared checklist item')
    }
    if (permittedEvidenceClasses) {
      for (const evidenceClass of expectation.evidenceClasses) {
        if (!permittedEvidenceClasses.has(evidenceClass)) {
          fail(
            'expectation_outside_policy',
            'workflow evidence expectation references an evidence class outside the space policy'
          )
        }
      }
    }
  }

  // Checkpoint template section ids are unique.
  const sectionIds = new Set<string>()
  for (const section of profile.checkpointTemplate.sections) {
    if (sectionIds.has(section.sectionId)) {
      fail('duplicate_checkpoint_section', 'workflow checkpoint template declares a duplicate section')
    }
    sectionIds.add(section.sectionId)
  }
}

/**
 * Validate the retention and version rules across every published version of a
 * `workflowProfileId` (Requirements 18.3-18.5, 18.14). Each `(id, version)` pair
 * must be unique so a pinned Investigation can resolve exactly the version it was
 * created against, and every published version is retained — this function never
 * removes a version. Returns the versions grouped by id for callers that keep a
 * retained history.
 */
export function assertRetainedWorkflowVersions(
  profiles: ReadonlyArray<CollaborationWorkflowProfile>
): Map<string, Map<number, CollaborationWorkflowProfile>> {
  const byId = new Map<string, Map<number, CollaborationWorkflowProfile>>()
  for (const profile of profiles) {
    const versions = byId.get(profile.workflowProfileId) ?? new Map<number, CollaborationWorkflowProfile>()
    if (versions.has(profile.version)) {
      fail('duplicate_workflow_version', 'duplicate workflow profile version')
    }
    versions.set(profile.version, profile)
    byId.set(profile.workflowProfileId, versions)
  }
  return byId
}

/**
 * Resolve the pinned definition for a `(workflowProfileId, version)` pair from a
 * retained set of published versions. Returns `undefined` when the pinned
 * version is not retained — callers treat that as a retention violation, since a
 * pinned Investigation must always be able to resolve its version
 * (Requirement 18.14).
 */
export function resolvePinnedWorkflowVersion(
  retained: ReadonlyMap<string, ReadonlyMap<number, CollaborationWorkflowProfile>>,
  workflowProfileId: string,
  version: number
): CollaborationWorkflowProfile | undefined {
  return retained.get(workflowProfileId)?.get(version)
}
