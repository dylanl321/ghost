/**
 * Shared Investigations — pinned Workflow_Profile Stage transitions and
 * completion checks (Ghostv2 collaboration workflow domain).
 *
 * Feature: shared-investigations (task 11.1). Owner: Ghostv2 collaboration
 * workflow domain.
 *
 * A Workflow_Profile version is pinned onto an Investigation at creation
 * (Requirement 18.3); `workflow-profile.ts` owns validation, defaults, and
 * retention. This module owns the *runtime rules* that evaluate a Stage change
 * for an already-pinned Investigation, purely against the pinned version, so a
 * later published version can never change the meaning of an existing
 * Investigation's stages, transitions, or completion rule (Requirements 18.5,
 * 18.6, 24.17):
 *
 *   - Permitted transitions: a Stage change is allowed only when the pinned
 *     version declares a transition `from -> to`. Staying on the same Stage is
 *     always allowed. An empty transition set means the pinned workflow permits
 *     no Stage movement (fail closed), never "anything goes".
 *   - Completion: transitioning INTO a completion Stage requires a selected
 *     ready Checkpoint whenever the pinned Checkpoint template requires one
 *     (Requirements 18.7). A completion Stage is a terminal Stage — one with no
 *     outgoing transition in the pinned version — which is the declarative
 *     signal the default `complete` Stage carries.
 *
 * These are pure functions over declarative data; they never execute profile
 * content and never read live state. The repository resolves the pinned version
 * and the selected-Checkpoint readiness and passes them in.
 */
import type { CollaborationWorkflowProfile } from './profile-schema'

/**
 * Why a requested Stage transition was rejected under the pinned Workflow
 * version. Stable machine reasons for callers/tests; carry no protected content.
 */
export type WorkflowTransitionRejection =
  /** The requested current/target Stage is not declared in the pinned version. */
  | { reason: 'unknown_stage'; stageId: string }
  /** No `from -> to` transition is declared in the pinned version. */
  | { reason: 'transition_not_permitted'; from: string; to: string }
  /** Completion into a terminal Stage requires a selected ready Checkpoint. */
  | { reason: 'checkpoint_required'; to: string }

/** Successful evaluation: the transition is permitted under the pinned version. */
export type WorkflowTransitionOutcome =
  | { allowed: true; completion: boolean }
  | { allowed: false; rejection: WorkflowTransitionRejection }

/**
 * The state of the Checkpoint a completion transition selects, resolved by the
 * caller from the pinned Investigation. `none` means no Checkpoint is selected;
 * `ready` means a selected Checkpoint exists in a finalized/ready state; any
 * non-ready selection is `not-ready`.
 */
export type SelectedCheckpointState = 'none' | 'ready' | 'not-ready'

/** Return the set of Stage ids declared by the pinned Workflow version. */
export function pinnedStageIds(profile: CollaborationWorkflowProfile): Set<string> {
  return new Set(profile.stages.map(s => s.stageId))
}

/**
 * A Stage is terminal (a completion Stage) when the pinned version declares no
 * outgoing transition from it. The default `complete` Stage is terminal because
 * nothing transitions out of it. A Stage that is not declared is never terminal.
 */
export function isTerminalStage(profile: CollaborationWorkflowProfile, stageId: string): boolean {
  if (!pinnedStageIds(profile).has(stageId)) return false
  return !profile.transitions.some(t => t.from === stageId)
}

/**
 * Whether a transition into `toStageId` is a completion transition that the
 * pinned version gates on a selected ready Checkpoint. Completion is gated only
 * when the pinned Checkpoint template requires it AND the target Stage is a
 * terminal (completion) Stage (Requirement 18.7).
 */
export function isCompletionTransition(
  profile: CollaborationWorkflowProfile,
  toStageId: string
): boolean {
  return profile.checkpointTemplate.requireForCompletion && isTerminalStage(profile, toStageId)
}

/**
 * Evaluate a requested Stage transition for an Investigation pinned to
 * `profile`, purely against that pinned version (Requirements 18.5, 18.6, 24.17).
 *
 * @param profile the pinned Workflow_Profile version (never a later version)
 * @param fromStageId the Investigation's current Stage
 * @param toStageId the requested Stage
 * @param selectedCheckpoint the readiness of the Checkpoint the transition
 *   selects, when the caller can resolve it. Only consulted for a completion
 *   transition.
 *
 * The result distinguishes an ordinary permitted transition from a completion
 * transition so the caller can apply completion-specific side effects, and
 * carries a stable rejection reason otherwise. This function never mutates and
 * never throws for a business rejection — the caller maps a rejection to the
 * non-disclosing error it prefers.
 */
export function evaluateStageTransition(
  profile: CollaborationWorkflowProfile,
  fromStageId: string,
  toStageId: string,
  selectedCheckpoint: SelectedCheckpointState = 'none'
): WorkflowTransitionOutcome {
  const stageIds = pinnedStageIds(profile)

  // Both endpoints must be Stages declared by the pinned version. A Stage that
  // the pinned version never declared has no meaning for this Investigation.
  if (!stageIds.has(fromStageId)) {
    return { allowed: false, rejection: { reason: 'unknown_stage', stageId: fromStageId } }
  }
  if (!stageIds.has(toStageId)) {
    return { allowed: false, rejection: { reason: 'unknown_stage', stageId: toStageId } }
  }

  // Staying on the same Stage is always allowed and is never a completion
  // transition (no Stage change happens, so no completion gate applies).
  if (fromStageId === toStageId) {
    return { allowed: true, completion: false }
  }

  // A Stage change is permitted only when the pinned version declares it. An
  // empty transition set therefore permits no movement (fail closed).
  const permitted = profile.transitions.some(t => t.from === fromStageId && t.to === toStageId)
  if (!permitted) {
    return {
      allowed: false,
      rejection: { reason: 'transition_not_permitted', from: fromStageId, to: toStageId }
    }
  }

  // Completion into a terminal Stage requires a selected ready Checkpoint when
  // the pinned Checkpoint template requires one (Requirement 18.7). Without a
  // ready selection, reject WITHOUT changing Stage.
  if (isCompletionTransition(profile, toStageId) && selectedCheckpoint !== 'ready') {
    return { allowed: false, rejection: { reason: 'checkpoint_required', to: toStageId } }
  }

  return { allowed: true, completion: isCompletionTransition(profile, toStageId) }
}
