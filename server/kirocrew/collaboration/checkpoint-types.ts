/**
 * Shared Investigations — Checkpoint, Handoff, and continuation domain types
 * (task 9.2).
 *
 * Owner: Ghostv2 collaboration domain and Object_Store integration.
 *
 * TypeScript counterparts of the canonical wire-contract `Checkpoint` /
 * `Handoff` models (`tests/shared-investigations/contract/wire-contract.v1.schema.json`)
 * for the services this task owns:
 *
 *   - `PublishCheckpointCommand` -> `CheckpointAck`  (immutable cited candidate)
 *   - `HandoffView`                                  (selected Checkpoint,
 *     Coverage_Watermark, newer Events to a fixed High_Water_Mark, and the first
 *     paginated Evidence_Index page)
 *
 * Design invariants encoded here (design.md "Artifact and Checkpoint" and
 * Requirements 12.1-12.12, 16.1, 16.2):
 *   - Checkpoint candidates are IMMUTABLE. Publishing appends a new candidate; a
 *     conflict never rewrites or drops an existing candidate.
 *   - Citations resolve ONLY to authorized Ready Artifacts or durable Events in
 *     the SAME Investigation (Requirement 12.1).
 *   - Selecting a Checkpoint as the shared Handoff is a mutable-metadata update
 *     under an expected Revision (Requirement 12.3, 12.4) — that transition is
 *     owned by `patchInvestigation` (task 3.3) via `selectedCheckpointId`; this
 *     module supplies the candidate and the Handoff read that consumes it.
 *   - A Checkpoint carries a `coverageWatermark` (a Server_Sequence). Events are
 *     "newer than the Checkpoint" iff their Server_Sequence exceeds it
 *     (Requirement 12.9).
 *   - The detailed Checkpoint document is stored in the Object_Store; the
 *     durable record carries only its opaque document identifier plus the safe
 *     structured summary needed for the timeline/feed (design "Object_Store
 *     layout").
 *
 * Requirements: 12.1-12.12, 16.1, 16.2.
 */

import type { AuthenticatedSubject } from './types'
import type { OperationId, ServerSequence } from './repository-types'

/**
 * A cited fact/interpretation fragment. Each `citationIds` entry MUST resolve to
 * an authorized Ready Artifact or durable Event in the same Investigation; the
 * CheckpointService rejects a candidate whose citations do not
 * (Requirement 12.1).
 */
export interface CitedText {
  text: string
  citationIds?: string[]
}

/** An attempted approach and its observed outcome, with supporting citations. */
export interface AttemptedApproach {
  description: string
  outcome: string
  citationIds?: string[]
}

/** A Source_System action summary and its observed outcome (never executable). */
export interface SourceActionOutcome {
  summary: string
  outcome: string
  citationIds?: string[]
}

/**
 * The structured Checkpoint content an Operator publishes. This is the detailed
 * document stored in the Object_Store; only a safe summary and the citation set
 * are mirrored onto the durable record and feed.
 *
 * The minimal API contract (task 9.1) sends `summary` plus flat citation id
 * lists; the richer structured fields below are optional so the same command
 * can carry a full design-shaped Checkpoint without breaking the existing wire
 * schema.
 */
export interface CheckpointContent {
  /** A required human summary / current question (Requirement 12.1). */
  currentQuestion: string
  observedFacts?: CitedText[]
  interpretations?: string[]
  attemptedApproaches?: AttemptedApproach[]
  unresolvedQuestions?: string[]
  proposedNextActions?: string[]
  sourceActionOutcomes?: SourceActionOutcome[]
}

/**
 * Publish an immutable Checkpoint candidate (Requirement 12.2). Idempotent by
 * Operation_ID. Citations are the union of `citedEventIds` and
 * `citedArtifactIds` plus any ids embedded in the structured content; every one
 * is validated against authorized Ready Artifacts / durable Events in the same
 * Investigation before the candidate is appended (Requirement 12.1).
 */
export interface PublishCheckpointCommand {
  operationId: OperationId
  investigationId: string
  /** The current Run that authored this Checkpoint, when known. */
  runId?: string
  /** Flat citation lists carried by the minimal API contract. */
  citedEventIds?: string[]
  citedArtifactIds?: string[]
  /**
   * A short safe summary (the current question). Kept for the minimal API
   * contract; when `content` is present its `currentQuestion` takes precedence.
   */
  summary?: string
  /** The full structured Checkpoint document (optional richer form). */
  content?: CheckpointContent
}

/** Acknowledgement for a published Checkpoint candidate (a MutationAck shape). */
export interface CheckpointAck {
  operationId: OperationId
  /** The immutable candidate's opaque id. */
  checkpointId: string
  acceptedServerSequence: ServerSequence
  /** The Coverage_Watermark captured at publication (Requirement 12.9). */
  coverageWatermark: ServerSequence
  objectId: string
}

/**
 * The durable Checkpoint candidate record. Immutable once written. The detailed
 * document lives in the Object_Store; this record carries the opaque document
 * identifier and the safe fields needed to render the candidate and to bound a
 * Handoff (Requirement 12.2, 12.9, design "Object_Store layout").
 */
export interface CheckpointRecord {
  checkpointId: string
  investigationId: string
  tenantId: string
  spaceId: string
  runId?: string
  author: AuthenticatedSubject
  /** Safe current-question summary mirrored from the document. */
  currentQuestion: string
  /** The validated citation set (Ready Artifact / durable Event ids). */
  citedEventIds: string[]
  citedArtifactIds: string[]
  /** The Server_Sequence coverage the Checkpoint claims (Requirement 12.9). */
  coverageWatermark: ServerSequence
  /** Opaque Object_Store document identifier for the detailed content. */
  documentArtifactId: string
  /** Server_Sequence at which the candidate was accepted. */
  serverSequence: ServerSequence
  operationId: OperationId
  createdAt: string
}

/** A single Evidence_Index entry: a Ready Artifact citable in the Handoff. */
export interface EvidenceIndexEntry {
  artifactId: string
  sanitizedFilename: string
  mediaType: string
  byteCount: number
  sha256: string
  producingRunId?: string
  checkId?: string
  producingEventId?: string
  readyAt?: string
}

/** An Event projected into the Handoff's "newer than the Checkpoint" window. */
export interface HandoffEvent {
  eventId: string
  investigationId: string
  runId?: string
  type: string
  checkId?: string
  serverSequence: ServerSequence
  occurredAt: string
  provenance: string
  /** Safe body projection (never raw private state). */
  body?: Record<string, unknown>
  artifactIds?: string[]
}

/**
 * The assembled Handoff a continuing Operator receives (Requirement 12.5,
 * 16.1). It contains:
 *   - the Selected_Checkpoint (or `null` when none has been selected yet);
 *   - the Coverage_Watermark the selected Checkpoint claims;
 *   - the fixed High_Water_Mark the whole read is bounded by;
 *   - the Events newer than the Coverage_Watermark up to the fixed mark;
 *   - the first Evidence_Index page.
 *
 * When the Events or Evidence_Index exceed one page, a continuation cursor bound
 * to the fixed High_Water_Mark and the authorization scope is returned
 * (Requirement 12.6, 12.7).
 */
export interface HandoffView {
  investigationId: string
  revision: number
  selectedCheckpoint: CheckpointRecord | null
  /** Coverage the selected Checkpoint claims; 0 when none is selected. */
  coverageWatermark: ServerSequence
  /** The fixed High_Water_Mark this Handoff read is bounded by. */
  highWaterMark: ServerSequence
  /** Events newer than the Coverage_Watermark, ordered by Server_Sequence. */
  newerEvents: HandoffEvent[]
  /** Opaque cursor for more newer Events, bound to the fixed mark + scope. */
  newerEventsCursor?: string
  /** First Evidence_Index page. */
  evidenceIndex: EvidenceIndexEntry[]
  /** Opaque cursor for more Evidence_Index entries, bound to the fixed mark. */
  evidenceIndexCursor?: string
}

/** Options controlling a Handoff read (page sizes clamp to [1, 200]). */
export interface HandoffOptions {
  eventPageSize?: number
  evidencePageSize?: number
  /** Continuation cursor from a prior page (either Events or Evidence). */
  cursor?: string
}
