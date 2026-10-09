/**
 * Shared Investigations — CollaborationRepository domain types (task 3.3).
 *
 * Owner: Ghostv2 CollaborationRepository / domain command handlers.
 *
 * TypeScript counterparts of the canonical wire-contract command / record
 * models (`tests/shared-investigations/contract/wire-contract.v1.schema.json`)
 * for the durable-mutation surface this task owns:
 *
 *   - `CreateInvestigationCommand`  -> `InvestigationAck`
 *   - `ReserveRunCommand`           -> `MutationAck`
 *   - `AppendEventCommand`          -> `MutationAck`
 *   - `PatchInvestigationCommand`   -> `MutationAck`
 *   - `CreationOperationLookup` / `IdempotencyRecord` (server-internal records)
 *
 * Only the fields the transactional command handlers depend on are modeled
 * here. Authorization (task 2.x), pagination/cursors (task 3.4), rich read
 * projections and Handoff assembly (task 3.5), and Artifacts (task 4.x) live in
 * their own modules and are intentionally out of scope.
 *
 * Requirements: 7.3-7.10, 10.16, 10.17, 12.2-12.4, 14.2-14.5, 14.14, 19.11,
 * 24.6-24.8, 24.26.
 */

import type { AuthenticatedSubject } from './types'
import type { SubjectReference } from './subject'
// `OperationId` and `Sha256Hex` are the same aliases the Artifact layer already
// defines; re-use them so the collaboration barrel has one canonical export.
import type { OperationId, Sha256Hex } from './artifact-types'

export type { OperationId, Sha256Hex }

/** Monotonically increasing within a Team_Space; controls synchronization order. */
export type ServerSequence = number

/** Expected-Revision optimistic concurrency for mutable Investigation metadata. */
export type Revision = number

/** Event categories recognized by the durable timeline. */
export type EventType =
  | 'check-started'
  | 'check-finished'
  | 'finding'
  | 'decision'
  | 'source-action-outcome'
  | 'coverage-gap'
  | 'self-reported'
  | 'lifecycle'

export type EventProvenance = 'adapter' | 'self-reported' | 'system'

export type CoverageLimitation = {
  kind:
    | 'denied'
    | 'incomplete'
    | 'capture-failed'
    | 'unsafe-projection'
    | 'truncated'
    | 'interrupted'
    | 'unsupported'
    | 'stale'
  safeMessage: string
  originalOutcome?: 'failed' | 'denied' | 'interrupted' | 'unknown'
}

/** Change_Feed item kinds (Requirement 19.3, wire `ChangeFeedItem.kind`). */
export type ChangeFeedKind =
  | 'investigation'
  | 'run'
  | 'event'
  | 'checkpoint'
  | 'artifact'
  | 'deletion'

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/**
 * Reserve a default-first or explicit-new Investigation for a subject
 * (Requirement 14.2-14.4). The `operationId` makes the reservation idempotent
 * and keys the Creation_Operation_Lookup used for pre-ID recovery
 * (Requirement 14.14, 24.6).
 */
export interface CreateInvestigationCommand {
  operationId: OperationId
  mode: 'default-first' | 'explicit-new'
  primarySubject: SubjectReference
  relatedSubjects?: SubjectReference[]
  workflowProfileId: string
  workflowVersion: number
  /** Initial stage from the pinned Workflow_Profile. */
  stageId: string
}

/** Reserve the current contributor's Run idempotently (Requirement 14.5). */
export interface ReserveRunCommand {
  operationId: OperationId
  investigationId: string
  parentCheckpointId?: string
}

/**
 * Append one immutable durable Event (Requirement 7.3, 7.10). A
 * `check-finished` Event additionally enforces `(Investigation_ID, Check_ID)`
 * uniqueness (Requirement 10.16, 10.17).
 */
export interface AppendEventCommand {
  operationId: OperationId
  investigationId: string
  type: EventType
  runId?: string
  checkId?: string
  sourceSubject?: SubjectReference
  occurredAt?: string
  body?: Record<string, unknown>
  artifactIds?: string[]
  provenance: EventProvenance
  limitations?: CoverageLimitation[]
}

/**
 * Update mutable Investigation metadata under an expected Revision
 * (Requirement 7.8, 12.3). A stale Revision returns a conflict without changing
 * state (Requirement 7.9, 12.4).
 */
export interface PatchInvestigationCommand {
  operationId: OperationId
  investigationId: string
  expectedRevision: Revision
  stageId?: string
  leadSubjectId?: string
  selectedCheckpointId?: string
  archived?: boolean
}

// ---------------------------------------------------------------------------
// Acknowledgements
// ---------------------------------------------------------------------------

/** Acknowledgement for a creation (Requirement 14.2, wire `InvestigationAck`). */
export interface InvestigationAck {
  operationId: OperationId
  investigationId: string
  revision: Revision
  acceptedServerSequence: ServerSequence
}

/** Acknowledgement for a Run/Event/patch (wire `MutationAck`). */
export interface MutationAck {
  operationId: OperationId
  acceptedServerSequence?: ServerSequence
  revision?: Revision
  objectId?: string
}

/** Resolution of a Creation_Operation_Lookup before the ID is known. */
export type CreationResolution =
  | { status: 'resolved'; ack: InvestigationAck }
  | { status: 'unresolved' }
  | { status: 'conflict' }

// ---------------------------------------------------------------------------
// Persisted domain records (subset used by the transactional writer).
// ---------------------------------------------------------------------------

export interface InvestigationRecord {
  investigationId: string
  tenantId: string
  spaceId: string
  primarySubject: SubjectReference
  relatedSubjects?: SubjectReference[]
  workflowProfileId: string
  workflowVersion: number
  stageId: string
  leadSubjectId?: string
  selectedCheckpointId?: string
  revision: Revision
  archived: boolean
  createdAt: string
  updatedAt: string
  /** Server_Sequence at which the current metadata state was accepted. */
  lastMutationSequence: ServerSequence
}

export interface RunRecord {
  runId: string
  investigationId: string
  author: AuthenticatedSubject
  gatewayId: string
  parentCheckpointId?: string
  state: 'active' | 'finished' | 'interrupted'
  startedAt: string
  finishedAt?: string
  serverSequence: ServerSequence
}

export interface EventRecord {
  eventId: string
  investigationId: string
  runId?: string
  type: EventType
  checkId?: string
  sourceSubject?: SubjectReference
  author: AuthenticatedSubject
  gatewayId: string
  occurredAt: string
  receivedAt: string
  serverSequence: ServerSequence
  operationId: OperationId
  body?: Record<string, unknown>
  artifactIds?: string[]
  provenance: EventProvenance
  limitations?: CoverageLimitation[]
}

/** Server-internal idempotency record keyed by Operation_ID. */
export interface IdempotencyRecord {
  tenantId: string
  spaceId: string
  operationId: OperationId
  payloadHash: Sha256Hex
  statusCode: number
  responseProjection?: Record<string, unknown>
  acceptedServerSequence?: ServerSequence
  acceptedRevision?: Revision
}

/**
 * Team_Space-scoped Creation_Operation_Lookup. Written atomically with every
 * default-first and explicit-new creation so a client that never received an
 * Investigation identifier can recover by `(Tenant, Team_Space, Operation_ID)`
 * (Requirement 10.16, 14.14, 24.6, 24.8, 24.26).
 */
export interface CreationOperationLookupRecord {
  tenantId: string
  spaceId: string
  operationId: OperationId
  payloadHash: Sha256Hex
  investigationId: string
  responseProjection: InvestigationAck
  acceptedServerSequence: ServerSequence
  acceptedRevision: Revision
}

/** One Change_Feed entry (Requirement 7.3, 19.3). */
export interface ChangeFeedRecord {
  tenantId: string
  spaceId: string
  serverSequence: ServerSequence
  kind: ChangeFeedKind
  objectId: string
  safeProjection: Record<string, unknown>
}

/** The context every command handler needs about the acting identity. */
export interface CommandContext {
  tenantId: string
  spaceId: string
  author: AuthenticatedSubject
  gatewayId: string
}

// ---------------------------------------------------------------------------
// Pinned Workflow_Profile policy port (task 11.1).
// ---------------------------------------------------------------------------

/**
 * The pinned-workflow inputs a metadata update needs to evaluate a Stage
 * transition purely against the version an Investigation was pinned to at
 * creation (Requirements 18.5, 18.6, 24.17). Resolved by the caller so the
 * repository stays decoupled from where the retained Workflow_Profile versions
 * and Checkpoint readiness live.
 */
export interface PinnedWorkflowContext {
  /** The exact pinned Workflow_Profile version for this Investigation. */
  readonly profile: import('./profile-schema').CollaborationWorkflowProfile
  /**
   * Whether the Checkpoint the transition selects (the command's
   * `selectedCheckpointId`, or the Investigation's already-selected Checkpoint
   * when the command does not change it) is in a finalized/ready state.
   */
  readonly selectedCheckpointReady: boolean
}

/**
 * Resolves the pinned Workflow_Profile version and selected-Checkpoint readiness
 * for a Stage transition. Returning `null` means the pinned version could not be
 * resolved; the caller treats that as a non-disclosing rejection rather than
 * silently skipping the pinned transition rules.
 */
export interface WorkflowPolicyResolver {
  resolve(
    scope: { tenantId: string; spaceId: string; investigationId: string },
    investigation: InvestigationRecord,
    command: PatchInvestigationCommand
  ): Promise<PinnedWorkflowContext | null>
}
