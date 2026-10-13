/**
 * Shared Investigations — concrete pinned Workflow_Profile policy resolver
 * (Ghostv2 collaboration workflow domain).
 *
 * Feature: shared-investigations (task 11.1). Owner: Ghostv2 collaboration
 * workflow domain.
 *
 * `repository-types.ts` declares the {@link WorkflowPolicyResolver} port and the
 * {@link PinnedWorkflowContext} the {@link CollaborationRepository} needs to
 * evaluate a Stage change against the exact Workflow_Profile version an
 * Investigation was pinned to at creation (Requirements 18.5, 18.6, 18.7,
 * 24.17). `workflow-transitions.ts` owns the pure evaluation; `workflow-profile.ts`
 * owns version retention/resolution. This module is the thin adapter that wires
 * those together so the repository can actually run the pinned-transition gate
 * instead of falling through with no policy:
 *
 *   1. Resolve the pinned `(workflowProfileId, workflowVersion)` recorded on the
 *      Investigation to its retained {@link CollaborationWorkflowProfile} using
 *      {@link resolvePinnedWorkflowVersion}. A later published version is never
 *      consulted, so a publication cannot change an existing Investigation's
 *      transition or completion meaning (Requirement 18.5).
 *   2. Resolve whether the Checkpoint the transition selects is READY. A
 *      Checkpoint candidate becomes a durable {@link CheckpointRecord} only
 *      after `CheckpointService` validates its citations, so an existing record
 *      for the effective selected id is exactly "a selected ready Checkpoint"
 *      (Requirement 18.7). The effective id is the command's
 *      `selectedCheckpointId` when the command sets one, otherwise the
 *      Investigation's already-selected Checkpoint.
 *
 * Returning `null` (pinned version not retained) makes the repository fail
 * closed with a non-disclosing conflict rather than applying an unvalidated
 * Stage change — a pinned version that is not retained is a retention violation
 * (Requirement 18.14), never a reason to skip the rules.
 *
 * The resolver holds no live workflow state itself; it reads the pinned version
 * from an injected retained source and Checkpoint readiness from an injected
 * read port, keeping the repository decoupled from where those live.
 */
import type { InvestigationScope } from './keys'
import type { CollaborationWorkflowProfile } from './profile-schema'
import type {
  InvestigationRecord,
  PatchInvestigationCommand,
  PinnedWorkflowContext,
  WorkflowPolicyResolver
} from './repository-types'
import { resolvePinnedWorkflowVersion } from './workflow-profile'

/**
 * A retained set of published Workflow_Profile versions, grouped by
 * `workflowProfileId` then `version` — the shape produced by
 * `assertRetainedWorkflowVersions`. A pinned Investigation resolves its exact
 * version out of this set (Requirements 18.3-18.5, 18.14).
 */
export type RetainedWorkflowVersions = ReadonlyMap<
  string,
  ReadonlyMap<number, CollaborationWorkflowProfile>
>

/**
 * Supplies the retained Workflow_Profile versions for the Team_Space an
 * Investigation belongs to. Kept async so an implementation may read the
 * current published Organization_Profile lazily; a static in-memory source can
 * resolve synchronously.
 */
export interface RetainedWorkflowSource {
  /**
   * Every retained Workflow_Profile version visible to this scope's Team_Space,
   * grouped by id and version. Must include every version any Investigation in
   * the space could be pinned to.
   */
  retainedVersions(scope: InvestigationScope): Promise<RetainedWorkflowVersions>
}

/**
 * The minimal Checkpoint read the resolver needs to decide readiness: does a
 * durable Checkpoint candidate with this id exist in this Investigation? A
 * subset of `HandoffReadPort`, so an existing read model satisfies it directly.
 */
export interface SelectedCheckpointReadPort {
  /**
   * True iff a durable Checkpoint candidate with `checkpointId` exists in this
   * Investigation. Existence implies ready, because a candidate is persisted
   * only after its citations are validated at publication.
   */
  isCheckpointReady(scope: InvestigationScope, checkpointId: string): Promise<boolean>
}

/**
 * Adapt any port exposing `getCheckpoint` (for example a `HandoffReadPort` /
 * checkpoint read model) into a {@link SelectedCheckpointReadPort}. A non-null
 * record means the Checkpoint is a validated, ready candidate.
 */
export function checkpointReadinessFrom(port: {
  getCheckpoint(scope: InvestigationScope, checkpointId: string): Promise<unknown | null>
}): SelectedCheckpointReadPort {
  return {
    async isCheckpointReady(scope, checkpointId) {
      return (await port.getCheckpoint(scope, checkpointId)) !== null
    }
  }
}

/**
 * The effective Checkpoint a Stage transition selects: the command's
 * `selectedCheckpointId` when the command sets one (including selecting a new
 * Checkpoint as part of the same completion request), otherwise the
 * Investigation's already-selected Checkpoint. `undefined` when neither selects
 * one — completion then has no ready Checkpoint and is rejected.
 */
export function effectiveSelectedCheckpointId(
  investigation: InvestigationRecord,
  command: PatchInvestigationCommand
): string | undefined {
  return command.selectedCheckpointId !== undefined
    ? command.selectedCheckpointId
    : investigation.selectedCheckpointId
}

/**
 * Concrete {@link WorkflowPolicyResolver} that resolves the pinned version from
 * a {@link RetainedWorkflowSource} and Checkpoint readiness from a
 * {@link SelectedCheckpointReadPort}.
 */
export class DefaultWorkflowPolicyResolver implements WorkflowPolicyResolver {
  constructor(
    private readonly retained: RetainedWorkflowSource,
    private readonly checkpoints: SelectedCheckpointReadPort
  ) {}

  async resolve(
    scope: InvestigationScope,
    investigation: InvestigationRecord,
    command: PatchInvestigationCommand
  ): Promise<PinnedWorkflowContext | null> {
    // 1) Resolve the EXACT pinned version. A missing version is a retention
    //    violation: fail closed by returning null rather than guessing.
    const retained = await this.retained.retainedVersions(scope)
    const profile = resolvePinnedWorkflowVersion(
      retained,
      investigation.workflowProfileId,
      investigation.workflowVersion
    )
    if (!profile) return null

    // 2) Resolve selected-Checkpoint readiness for the effective selection. No
    //    selection means no ready Checkpoint, so a completion transition is
    //    rejected downstream (Requirement 18.7).
    const selectedId = effectiveSelectedCheckpointId(investigation, command)
    const selectedCheckpointReady =
      selectedId !== undefined && (await this.checkpoints.isCheckpointReady(scope, selectedId))

    return { profile, selectedCheckpointReady }
  }
}

/**
 * Build a {@link RetainedWorkflowSource} from a single static set of retained
 * versions shared by every Team_Space (the common case where one published
 * Organization_Profile is in effect). The map is captured by reference; publish
 * a new profile by constructing a new source.
 */
export function staticRetainedWorkflowSource(
  versions: RetainedWorkflowVersions
): RetainedWorkflowSource {
  return {
    async retainedVersions() {
      return versions
    }
  }
}
