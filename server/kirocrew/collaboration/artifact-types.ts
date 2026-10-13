/**
 * Shared Investigations — Artifact storage domain and port types (task 4.1).
 *
 * Owner: Ghostv2 ArtifactStore and collaboration API services.
 *
 * TypeScript counterparts of the canonical wire-contract `ArtifactManifest`
 * model (`tests/shared-investigations/contract/wire-contract.v1.schema.json`
 * `$defs.ArtifactManifest`). Only the fields the ArtifactStore and the artifact
 * reservation/upload/download/reconciliation flow depend on are modeled here;
 * post-redaction validation and finalization semantics belong to task 4.2.
 *
 * Requirements: 8.1-8.5, 8.9, 8.10, 8.12, 8.13.
 */

import type { InvestigationScope } from './keys'

/** Lowercase SHA-256 hex digest over the shared (post-redaction) bytes. */
export type Sha256Hex = string

/** Stable client-generated idempotency key (Operation_ID). */
export type OperationId = string

/** Media types the Object_Store accepts for shared evidence. */
export type ArtifactMediaType =
  | 'text/plain; charset=utf-8'
  | 'text/markdown'
  | 'application/json'
  | 'text/csv'
  | 'application/pdf'
  | 'image/png'
  | 'image/jpeg'

export type ArtifactProvenance = 'automatic' | 'explicit' | 'legacy-import'

export type ArtifactState = 'pending' | 'ready' | 'validation-failed'

/**
 * Declared attributes a client supplies when reserving a Pending_Manifest.
 * `sha256`/`byteCount` are the client's declared values; the store verifies the
 * actual uploaded bytes against them at completion (task 4.2). The original
 * filename is retained only as sanitized metadata (Requirement 8.2, 8.3).
 */
export interface ArtifactDeclaration {
  originalFilename: string
  sha256: Sha256Hex
  byteCount: number
  mediaType: ArtifactMediaType
  provenance: ArtifactProvenance
  redacted: boolean
  truncated: boolean
  producingRunId?: string
  checkId?: string
  sourceReferences?: string[]
  collectedAt?: string
  collectorVersion?: string
  sourceVersionOrEtag?: string
}

/**
 * The persisted Artifact_Manifest. A `pending` manifest reserves an Artifact
 * identifier and is excluded from usable evidence/citations until finalized
 * (Requirement 8.4, 8.8). The store never mutates a manifest's identity fields.
 */
export interface ArtifactManifest {
  artifactId: string
  investigationId: string
  state: ArtifactState
  originalFilename: string
  /** Sanitized filename safe to echo in a Content-Disposition header. */
  sanitizedFilename: string
  sha256: Sha256Hex
  byteCount: number
  mediaType: ArtifactMediaType
  provenance: ArtifactProvenance
  redacted: boolean
  truncated: boolean
  producingEventId?: string
  producingRunId?: string
  checkId?: string
  sourceReferences?: string[]
  collectedAt?: string
  collectorVersion?: string
  sourceVersionOrEtag?: string
  reservedAt: string
  readyAt?: string
  /** Opaque idempotency key that reserved this manifest (server-internal). */
  reservationOperationId: OperationId
  /** Digest of the declared reservation payload, for idempotent replay. */
  reservationPayloadHash: Sha256Hex
}

/**
 * State the ArtifactStore reports about the physical object backing a manifest.
 * The reconciliation protocol uses this to recover a lost upload response
 * before any further bytes are sent (Requirement 8.9).
 */
export interface StoredObjectState {
  exists: boolean
  /** Object version identifier; present once a versioned object exists. */
  versionId?: string
  /** SHA-256 of the stored bytes, if the object exists. */
  sha256?: Sha256Hex
  byteCount?: number
}

/** Result of a write through the authorized route. */
export interface StoredObjectResult {
  versionId?: string
  sha256: Sha256Hex
  byteCount: number
}

/** A readable stream plus the metadata needed to serve it as an attachment. */
export interface ArtifactDownload {
  stream: NodeJS.ReadableStream
  byteCount: number
  mediaType: ArtifactMediaType
  /** Sanitized filename for the Content-Disposition attachment header. */
  sanitizedFilename: string
  sha256: Sha256Hex
}

/**
 * Low-level, credential-owning storage backend. This is the ONLY layer that
 * holds storage credentials; it is never surfaced to the dashboard, Operator
 * status, or any presigned-URL path (Requirement 8.1, 8.13). GHOST streams
 * bytes through this backend on behalf of authorized callers.
 */
export interface ObjectStorageBackend {
  /**
   * Write bytes to `objectKey` exactly once. Implementations MUST NOT overwrite
   * an existing object's bytes; when an object already exists they report its
   * current state so the service can compare and either treat the write as an
   * idempotent replay or a conflict (Requirement 8.5, 8.10).
   */
  putIfAbsent(
    objectKey: string,
    body: Buffer,
    mediaType: string
  ): Promise<StoredObjectResult | { alreadyExists: true; state: StoredObjectState }>
  head(objectKey: string): Promise<StoredObjectState>
  get(objectKey: string): Promise<{ stream: NodeJS.ReadableStream; byteCount: number } | null>
}

/**
 * Manifest persistence port. The concrete implementation is the
 * CollaborationRepository (task 3.x); the artifact service depends only on this
 * narrow surface so it can be tested in isolation and so reservation stays
 * idempotent by Operation_ID.
 */
export interface ArtifactManifestStore {
  /**
   * Idempotently reserve a Pending_Manifest for `operationId`. A retry with the
   * same Operation_ID and identical payload returns the existing manifest; a
   * retry with a different payload throws a payload-mismatch denial.
   */
  reserve(scope: InvestigationScope, manifest: ArtifactManifest): Promise<ArtifactManifest>
  get(scope: InvestigationScope, artifactId: string): Promise<ArtifactManifest | null>
}

/** The scope + Artifact identity a store/service operation targets. */
export interface ArtifactRef extends InvestigationScope {
  artifactId: string
}

// ---------------------------------------------------------------------------
// Task 4.2 — validation, finalization, and evidence limits.
// ---------------------------------------------------------------------------

/**
 * The absolute Explicit_Artifact size ceiling, in bytes (10 MiB). No upload is
 * accepted above this, and no truncation is applied to fit it (Requirements
 * 11.7, 11.8). A Team_Space Evidence_Policy may declare a *narrower* limit, but
 * never a wider one; this constant is the hard cap enforced regardless of
 * policy.
 */
export const MAX_EXPLICIT_ARTIFACT_BYTES = 10 * 1024 * 1024

/** The first-release Explicit_Artifact media allow-list (Requirement 11.9). */
export const SUPPORTED_ARTIFACT_MEDIA_TYPES: readonly ArtifactMediaType[] = [
  'text/plain; charset=utf-8',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/pdf',
  'image/png',
  'image/jpeg'
]

/**
 * The subset of a Team_Space Evidence_Policy that artifact finalization
 * enforces (Requirement 11.2). This mirrors the published
 * `CollaborationEvidencePolicy` (`profile-schema.ts`) but is declared narrowly
 * here so the artifact/domain validation layer depends only on the fields it
 * checks and can be unit-tested without a full Organization_Profile.
 */
export interface ArtifactEvidencePolicy {
  /** Media types permitted in this Team_Space (a subset of the allow-list). */
  permittedMediaTypes: readonly ArtifactMediaType[]
  /**
   * Team_Space upper bound for an Explicit_Artifact. Enforced in addition to
   * the hard {@link MAX_EXPLICIT_ARTIFACT_BYTES} ceiling; the effective limit is
   * the smaller of the two.
   */
  maxExplicitArtifactBytes: number
  /**
   * When true, an Explicit_Artifact must be marked `redacted` before it may be
   * finalized. Automatic evidence is always redacted client-side (Requirement
   * 11.1); this guards operator-supplied explicit files.
   */
  requireRedaction: boolean
}

/**
 * The immutable Artifact Event appended when a manifest is finalized. It is the
 * durable timeline record that makes a Ready_Manifest citable (Requirements
 * 8.6, 8.8). The finalizing store assigns the Server_Sequence and Event ID
 * atomically with the Ready_Manifest transition (task 3.3 transactional write).
 */
export interface ArtifactEvent {
  eventId: string
  investigationId: string
  kind: 'artifact-ready'
  artifactId: string
  sha256: Sha256Hex
  byteCount: number
  mediaType: ArtifactMediaType
  producingRunId?: string
  checkId?: string
  /** Server-assigned monotonic sequence within the Team_Space. */
  serverSequence: number
  /** Server timestamp the finalization committed. */
  occurredAt: string
}

/** The atomic result of finalizing an Artifact: Ready_Manifest + Artifact Event. */
export interface FinalizedArtifact {
  manifest: ArtifactManifest
  event: ArtifactEvent
}

/**
 * Manifest finalization port. Extends {@link ArtifactManifestStore} with the
 * single atomic transition the CollaborationRepository (task 3.3) implements as
 * one transactional write: flip the Pending_Manifest to `ready`, stamp its
 * verified integrity/`readyAt`/`producingEventId`, and append the Artifact
 * Event with the next Team_Space Server_Sequence. Either both land or neither
 * does, so a manifest is never `ready` without its citable Event and vice
 * versa.
 *
 * `markValidationFailed` records a terminal non-ready state so a manifest whose
 * bytes failed validation stays uncitable and is not retried into readiness
 * (Requirements 8.7, 8.8).
 */
export interface FinalizingArtifactManifestStore extends ArtifactManifestStore {
  /**
   * Atomically transition `artifactId` from `pending` to `ready` and append the
   * Artifact Event. Implementations MUST reject the transition if the manifest
   * is not currently `pending` (e.g. already ready or validation-failed) so
   * finalization is idempotent and never double-appends an Event.
   */
  finalize(
    scope: InvestigationScope,
    artifactId: string,
    verified: {
      sha256: Sha256Hex
      byteCount: number
      readyAt: string
    },
    event: ArtifactEvent
  ): Promise<FinalizedArtifact>

  /** Record a terminal `validation-failed` state for a pending manifest. */
  markValidationFailed(scope: InvestigationScope, artifactId: string): Promise<ArtifactManifest>
}
