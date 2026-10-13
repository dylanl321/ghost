/**
 * Shared Investigations — Checkpoint/Handoff API projection adapter (task 9.2).
 *
 * Owner: Ghostv2 collaboration domain and Object_Store integration.
 *
 * The Collaboration_API surface (task 9.1) depends on two narrow ports declared
 * in `api-runtime.ts`:
 *
 *   - `CollaborationWritePort.publishCheckpoint(ctx, command) -> MutationAck`
 *   - `CollaborationReadPort.readHandoff(scope, options) -> HandoffView | null`
 *     and `CollaborationReadPort.continueHandoff(scope, cursor) -> page`
 *
 * The DOMAIN services that actually own those behaviours are
 * {@link CheckpointService} (publish an immutable cited candidate, validate
 * citations, capture a Coverage_Watermark) and {@link HandoffService} (assemble
 * the Selected_Checkpoint + Coverage_Watermark + newer Events to a fixed
 * High_Water_Mark + paginated Evidence_Index, with scope-bound continuation
 * cursors). This module is the thin adapter that binds those services to the API
 * ports so the routes (task 9.1) reach the real domain logic instead of a stub.
 *
 * It performs only shape translation and safe projection; every domain rule
 * (immutability, citation validation, idempotency, fixed-mark pagination,
 * non-disclosing cursor errors) stays inside the two services.
 *
 * Requirements: 12.1-12.12, 16.1, 16.2.
 */

import type { CheckpointService, HandoffService } from './checkpoint-service'
import type {
  CheckpointRecord,
  EvidenceIndexEntry,
  HandoffEvent,
  HandoffOptions,
  HandoffView,
  PublishCheckpointCommand as DomainPublishCheckpointCommand
} from './checkpoint-types'
import type {
  CollaborationReadPort,
  Page,
  PublishCheckpointCommand as ApiPublishCheckpointCommand
} from './api-runtime'
import type { InvestigationScope } from './keys'
import type { CommandContext, MutationAck } from './repository-types'

/**
 * A safe Checkpoint candidate projection returned inside a Handoff view. The
 * durable {@link CheckpointRecord} carries the internal Object_Store document
 * identifier and the acting author's tenant/object ids; the Handoff only needs
 * the cited, immutable summary and the Coverage_Watermark it claims, so we drop
 * the storage detail before it crosses the API boundary (Requirement 12.10,
 * 19.13).
 */
export interface SafeCheckpointProjection {
  checkpointId: string
  investigationId: string
  runId?: string
  currentQuestion: string
  citedEventIds: string[]
  citedArtifactIds: string[]
  coverageWatermark: number
  serverSequence: number
  createdAt: string
}

/**
 * The safe Handoff response body the API returns. It mirrors {@link HandoffView}
 * but replaces the raw {@link CheckpointRecord} with a
 * {@link SafeCheckpointProjection} and keeps only the opaque continuation
 * cursors (never the internal cursor state).
 */
export interface SafeHandoffView {
  investigationId: string
  revision: number
  selectedCheckpoint: SafeCheckpointProjection | null
  coverageWatermark: number
  highWaterMark: number
  newerEvents: HandoffEvent[]
  newerEventsCursor?: string
  evidenceIndex: EvidenceIndexEntry[]
  evidenceIndexCursor?: string
}

/** A safe continuation page for either Handoff stream. */
export type SafeHandoffPage =
  | { stream: 'events'; items: HandoffEvent[]; highWaterMark: number; nextCursor?: string }
  | { stream: 'evidence'; items: EvidenceIndexEntry[]; highWaterMark: number; nextCursor?: string }

/**
 * Project a durable Checkpoint candidate record to the safe fields a continuing
 * Operator may see. Storage/author internals (`documentArtifactId`, `author`,
 * `tenantId`, `spaceId`, `operationId`) are dropped (Requirement 12.10, 19.13).
 */
export function projectCheckpoint(record: CheckpointRecord): SafeCheckpointProjection {
  return {
    checkpointId: record.checkpointId,
    investigationId: record.investigationId,
    runId: record.runId,
    currentQuestion: record.currentQuestion,
    citedEventIds: record.citedEventIds,
    citedArtifactIds: record.citedArtifactIds,
    coverageWatermark: record.coverageWatermark,
    serverSequence: record.serverSequence,
    createdAt: record.createdAt
  }
}

/** Project a whole assembled {@link HandoffView} to its safe response body. */
export function projectHandoffView(view: HandoffView): SafeHandoffView {
  return {
    investigationId: view.investigationId,
    revision: view.revision,
    selectedCheckpoint: view.selectedCheckpoint ? projectCheckpoint(view.selectedCheckpoint) : null,
    coverageWatermark: view.coverageWatermark,
    highWaterMark: view.highWaterMark,
    newerEvents: view.newerEvents,
    newerEventsCursor: view.newerEventsCursor,
    evidenceIndex: view.evidenceIndex,
    evidenceIndexCursor: view.evidenceIndexCursor
  }
}

/**
 * Translate the API's flat `PublishCheckpointCommand` (task 9.1 wire shape:
 * `summary` + flat citation id lists) into the domain command. The domain
 * command's richer structured `content` is optional; the API surface currently
 * carries only the summary, so `currentQuestion` is derived from it. Ids are
 * passed through untouched — the CheckpointService validates them against
 * authorized Ready Artifacts / durable Events in the same Investigation
 * (Requirement 12.1).
 */
function toDomainPublish(command: ApiPublishCheckpointCommand): DomainPublishCheckpointCommand {
  return {
    operationId: command.operationId,
    investigationId: command.investigationId,
    citedEventIds: command.citedEventIds,
    citedArtifactIds: command.citedArtifactIds,
    summary: command.summary,
    content: { currentQuestion: command.summary }
  }
}

/**
 * The API write-port fragment this module satisfies. The runtime composes it
 * with the CollaborationRepository's other write methods (create/reserve/append/
 * patch) into the full `CollaborationWritePort`.
 */
export interface CheckpointWriteProjection {
  publishCheckpoint(ctx: CommandContext, command: ApiPublishCheckpointCommand): Promise<MutationAck>
}

/**
 * The API read-port fragment this module satisfies (`readHandoff` +
 * `continueHandoff`). The runtime composes it with the repository's other read
 * methods into the full `CollaborationReadPort`.
 */
export type CheckpointReadProjection = Pick<CollaborationReadPort, 'readHandoff' | 'continueHandoff'>

/**
 * Bind the {@link CheckpointService} and {@link HandoffService} domain services
 * to the API's Checkpoint/Handoff ports. Returns the two port fragments the
 * runtime wiring merges into `writes` and `reads`.
 */
export class CheckpointApiProjection implements CheckpointWriteProjection {
  constructor(
    private readonly checkpoints: CheckpointService,
    private readonly handoffs: HandoffService
  ) {}

  /**
   * Publish an immutable cited Checkpoint candidate through the domain service
   * and project its {@link CheckpointRecord}-shaped acknowledgement to the
   * generic `MutationAck` the API returns. The candidate's opaque id is carried
   * as `objectId`; the Coverage_Watermark stays available to the client via the
   * subsequent Handoff read (Requirement 12.2, 12.9).
   */
  async publishCheckpoint(
    ctx: CommandContext,
    command: ApiPublishCheckpointCommand
  ): Promise<MutationAck> {
    const ack = await this.checkpoints.publishCheckpoint(ctx, toDomainPublish(command))
    return {
      operationId: ack.operationId,
      acceptedServerSequence: ack.acceptedServerSequence,
      objectId: ack.checkpointId
    }
  }

  /**
   * Assemble the safe Handoff view for a continuing Operator (Requirement 12.5,
   * 16.1). Returns `null` when the Investigation is unknown / off-scope or a
   * selected Checkpoint has become unavailable, which the handler turns into a
   * non-disclosing not-found (Requirement 16.9).
   */
  async readHandoff(scope: InvestigationScope, options?: HandoffOptions): Promise<SafeHandoffView | null> {
    const view = await this.handoffs.readHandoff(scope, options ?? {})
    return view ? projectHandoffView(view) : null
  }

  /**
   * Follow a Handoff continuation cursor (Requirement 12.6, 12.7). A cursor
   * bound to another scope or tampered with raises a non-disclosing not-found
   * inside the domain service (Requirement 12.8).
   */
  async continueHandoff(scope: InvestigationScope, cursor: string): Promise<SafeHandoffPage> {
    return this.handoffs.continueHandoff(scope, cursor)
  }

  /** The read-port fragment (`readHandoff` + `continueHandoff`) for the runtime. */
  asReadProjection(): CheckpointReadProjection {
    return {
      readHandoff: (scope, options) => this.readHandoff(scope, options),
      continueHandoff: (scope, cursor) => this.continueHandoff(scope, cursor)
    }
  }
}
