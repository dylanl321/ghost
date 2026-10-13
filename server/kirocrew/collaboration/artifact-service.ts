/**
 * Shared Investigations — Artifact collaboration API service (task 4.1).
 *
 * Owner: Ghostv2 collaboration API services.
 *
 * Coordinates the authenticated, authorized, write-once artifact protocol on
 * top of the {@link ArtifactStore} (bytes) and an {@link ArtifactManifestStore}
 * (manifests). The flow it implements:
 *
 *   1. reserve  — idempotently create a Pending_Manifest for an Operation_ID
 *                 and reserve an Artifact identifier (Requirement 8.4).
 *   2. upload   — stream declared bytes through this authorized route to a
 *                 write-once object; reconcile a lost prior response before
 *                 sending, and conflict (never replace) on differing bytes
 *                 (Requirements 8.5, 8.9, 8.10).
 *   3. download — stream stored bytes as an attachment after reauthorization,
 *                 with a non-disclosing denial on failure (Requirement 8.12,
 *                 8.13).
 *
 *   4. finalize — validate the post-redaction bytes against the manifest and
 *                 the Team_Space Evidence_Policy, then atomically commit a
 *                 Ready_Manifest and append the Artifact Event; only then is the
 *                 Artifact citable (task 4.2, Requirements 8.6-8.8, 11.2,
 *                 11.7-11.10, 11.13-11.15).
 *
 * Storage credentials and presigned storage access are never returned from any
 * method here (Requirement 8.1, 8.13): callers receive manifests, reconciliation
 * status, or a byte stream — never a bucket, key, or credential.
 */

import { randomUUID } from 'node:crypto'
import { artifactConflict, notFound, payloadMismatch, unresolved, validationFailed } from './errors'
import { sanitizeArtifactFilename } from './keys'
import type { InvestigationScope } from './keys'
import { sha256Hex } from './artifact-store'
import type { ArtifactStore } from './artifact-store'
import { validateArtifactForFinalization } from './artifact-validation'
import type {
  ArtifactDeclaration,
  ArtifactEvent,
  ArtifactEvidencePolicy,
  ArtifactManifest,
  ArtifactManifestStore,
  FinalizedArtifact,
  FinalizingArtifactManifestStore,
  Sha256Hex,
  StoredObjectState
} from './artifact-types'

/** The minimal authorship identity the service records on a reservation. */
export interface ArtifactAuthor {
  readonly tenantId: string
  readonly entraObjectId: string
}

/** Options for reserving an Artifact. */
export interface ReserveArtifactInput {
  scope: InvestigationScope
  operationId: string
  declaration: ArtifactDeclaration
  author: ArtifactAuthor
}

/** Outcome of an upload attempt, mapped to a non-disclosing wire result. */
export type UploadOutcome =
  | { status: 'stored'; manifest: ArtifactManifest; versionId?: string }
  | { status: 'already-stored'; manifest: ArtifactManifest; versionId?: string }

/**
 * Deterministic hash of the reservation payload, used to make reservation
 * idempotent by Operation_ID: the same Operation_ID with the same declaration
 * replays; a different declaration is a payload mismatch (Requirement 8.4).
 */
export function reservationPayloadHash(
  scope: InvestigationScope,
  declaration: ArtifactDeclaration
): Sha256Hex {
  const canonical = JSON.stringify({
    tenantId: scope.tenantId,
    spaceId: scope.spaceId,
    investigationId: scope.investigationId,
    originalFilename: declaration.originalFilename,
    sha256: declaration.sha256,
    byteCount: declaration.byteCount,
    mediaType: declaration.mediaType,
    provenance: declaration.provenance,
    redacted: declaration.redacted,
    truncated: declaration.truncated,
    producingRunId: declaration.producingRunId ?? null,
    checkId: declaration.checkId ?? null,
    sourceReferences: declaration.sourceReferences ?? null,
    collectedAt: declaration.collectedAt ?? null,
    collectorVersion: declaration.collectorVersion ?? null,
    sourceVersionOrEtag: declaration.sourceVersionOrEtag ?? null
  })
  return sha256Hex(Buffer.from(canonical, 'utf-8'))
}

export class ArtifactService {
  constructor(
    private readonly store: ArtifactStore,
    private readonly manifests: ArtifactManifestStore,
    /** Injectable ID/clock for deterministic tests. */
    private readonly newArtifactId: () => string = () => `art-${randomUUID()}`,
    private readonly now: () => Date = () => new Date(),
    private readonly newEventId: () => string = () => `evt-${randomUUID()}`
  ) {}

  /**
   * True when the injected manifest store can atomically finalize a manifest
   * (Ready_Manifest + Artifact Event) and record validation failures. The
   * production CollaborationRepository (task 3.3) implements this; a plain
   * reservation-only store does not.
   */
  private get finalizingStore(): FinalizingArtifactManifestStore | null {
    const candidate = this.manifests as Partial<FinalizingArtifactManifestStore>
    return typeof candidate.finalize === 'function' && typeof candidate.markValidationFailed === 'function'
      ? (this.manifests as FinalizingArtifactManifestStore)
      : null
  }

  /**
   * Reserve an Artifact identifier and Pending_Manifest for `operationId`.
   * Idempotent: the same Operation_ID with the same declaration returns the
   * existing manifest; a different declaration is rejected without disturbing
   * the existing reservation.
   */
  async reserve(input: ReserveArtifactInput): Promise<ArtifactManifest> {
    const { scope, operationId, declaration } = input
    const payloadHash = reservationPayloadHash(scope, declaration)
    const artifactId = this.newArtifactId()
    const reservedAt = this.now().toISOString()

    const manifest: ArtifactManifest = {
      artifactId,
      investigationId: scope.investigationId,
      state: 'pending',
      originalFilename: declaration.originalFilename,
      sanitizedFilename: sanitizeArtifactFilename(declaration.originalFilename),
      sha256: declaration.sha256,
      byteCount: declaration.byteCount,
      mediaType: declaration.mediaType,
      provenance: declaration.provenance,
      redacted: declaration.redacted,
      truncated: declaration.truncated,
      producingRunId: declaration.producingRunId,
      checkId: declaration.checkId,
      sourceReferences: declaration.sourceReferences,
      collectedAt: declaration.collectedAt,
      collectorVersion: declaration.collectorVersion,
      sourceVersionOrEtag: declaration.sourceVersionOrEtag,
      reservedAt,
      reservationOperationId: operationId,
      reservationPayloadHash: payloadHash
    }

    // The manifest store enforces Operation_ID idempotency: an identical replay
    // returns the stored manifest, and a mismatching payload throws.
    return this.manifests.reserve(scope, manifest)
  }

  /**
   * Read the current manifest and physical object reconciliation state. Used by
   * a client that lost an upload response to decide whether to resend bytes
   * (Requirement 8.9). Returns a non-disclosing not-found when the reservation
   * is unknown so callers cannot probe for other Investigations' artifacts.
   */
  async reconcile(
    scope: InvestigationScope,
    artifactId: string
  ): Promise<{ manifest: ArtifactManifest; object: StoredObjectState }> {
    const manifest = await this.manifests.get(scope, artifactId)
    if (!manifest || manifest.investigationId !== scope.investigationId) {
      throw notFound()
    }
    const object = await this.store.inspect(scope, artifactId)
    return { manifest, object }
  }

  /**
   * Stream declared bytes to the write-once object for a reserved Artifact.
   *
   * Reconciliation-first (Requirement 8.9): if an object already exists, the
   * service compares its checksum to the incoming bytes:
   *   - identical  -> idempotent success (the earlier upload was durable);
   *   - different  -> conflict; the stored object is NEVER replaced
   *                   (Requirement 8.10).
   * A brand-new object is written once (Requirement 8.5).
   *
   * `bytes` are the final post-redaction shared bytes; the store computes the
   * SHA-256 it actually persists. Full size/checksum validation and
   * finalization are task 4.2.
   */
  async upload(scope: InvestigationScope, artifactId: string, bytes: Buffer): Promise<UploadOutcome> {
    const manifest = await this.manifests.get(scope, artifactId)
    if (!manifest || manifest.investigationId !== scope.investigationId) {
      throw notFound()
    }

    const incomingDigest = sha256Hex(bytes)
    const result = await this.store.putOnce(scope, artifactId, bytes, manifest.mediaType)

    if ('alreadyExists' in result) {
      // An object is already stored. Reconcile by checksum rather than replacing.
      const storedDigest = result.state.sha256
      if (storedDigest && storedDigest === incomingDigest) {
        // The prior upload was durable; treat this as an idempotent replay.
        return { status: 'already-stored', manifest, versionId: result.state.versionId }
      }
      if (!storedDigest) {
        // Cannot yet determine the stored checksum; the client should retry
        // reconciliation before sending more bytes (Requirement 8.9).
        throw unresolved()
      }
      // Different bytes for the same Artifact identifier: conflict, no replace.
      throw artifactConflict()
    }

    return { status: 'stored', manifest, versionId: result.versionId }
  }

  /**
   * Validate the uploaded (post-redaction) bytes against the manifest and the
   * Team_Space Evidence_Policy, then atomically commit a Ready_Manifest and
   * append the Artifact Event (task 4.2). This is the ONLY path by which an
   * Artifact becomes citable.
   *
   * Flow:
   *   1. Load the reserved manifest (non-disclosing not-found off-scope).
   *   2. Idempotency: a manifest already `ready` returns its prior finalization
   *      without re-appending an Event (Requirement 24.8 shape); a manifest
   *      already `validation-failed` stays failed.
   *   3. Inspect the immutable stored object for its actual SHA-256/byte count.
   *   4. Validate size ceiling, media type, required metadata/provenance,
   *      redaction policy, and integrity against the stored bytes
   *      (Requirements 8.6, 8.7, 11.2, 11.7-11.10, 11.13-11.15).
   *   5. On success, atomically flip to `ready` and append the Artifact Event.
   *      On a validation failure, mark the manifest `validation-failed` so it
   *      stays uncitable, then rethrow the typed denial (Requirement 8.7, 8.8).
   *
   * Requires a {@link FinalizingArtifactManifestStore}; without one this throws
   * (finalization cannot be simulated by a reservation-only store).
   */
  async finalize(
    scope: InvestigationScope,
    artifactId: string,
    policy: ArtifactEvidencePolicy
  ): Promise<FinalizedArtifact> {
    const finalizing = this.finalizingStore
    if (!finalizing) {
      throw new Error('artifact finalization requires a FinalizingArtifactManifestStore')
    }

    const manifest = await this.manifests.get(scope, artifactId)
    if (!manifest || manifest.investigationId !== scope.investigationId) {
      throw notFound()
    }

    // A terminal validation failure never becomes ready again.
    if (manifest.state === 'validation-failed') {
      throw validationFailed()
    }

    // Idempotent finalization: an already-ready manifest returns its Event
    // without appending a duplicate.
    if (manifest.state === 'ready') {
      return finalizing.finalize(
        scope,
        artifactId,
        { sha256: manifest.sha256, byteCount: manifest.byteCount, readyAt: manifest.readyAt ?? this.now().toISOString() },
        this.artifactEventFor(manifest, manifest.sha256, manifest.byteCount, manifest.producingEventId ?? this.newEventId())
      )
    }

    // Inspect the actual stored bytes: validation is against what is durable,
    // not merely what was declared (Requirement 8.6, 11.13).
    const object = await this.store.inspect(scope, artifactId)

    let verified: { sha256: Sha256Hex; byteCount: number }
    try {
      verified = validateArtifactForFinalization(
        manifest,
        { sha256: object.sha256, byteCount: object.byteCount },
        policy
      )
    } catch (error) {
      // Retain a non-ready state so the Artifact stays uncitable, then surface
      // the typed, non-disclosing validation error (Requirement 8.7, 8.8).
      await finalizing.markValidationFailed(scope, artifactId)
      throw error
    }

    const readyAt = this.now().toISOString()
    const event = this.artifactEventFor(manifest, verified.sha256, verified.byteCount, this.newEventId())
    return finalizing.finalize(scope, artifactId, { ...verified, readyAt }, event)
  }

  /** Build the immutable Artifact Event that finalization appends. */
  private artifactEventFor(
    manifest: ArtifactManifest,
    sha256: Sha256Hex,
    byteCount: number,
    eventId: string
  ): ArtifactEvent {
    return {
      eventId,
      investigationId: manifest.investigationId,
      kind: 'artifact-ready',
      artifactId: manifest.artifactId,
      sha256,
      byteCount,
      mediaType: manifest.mediaType,
      producingRunId: manifest.producingRunId,
      checkId: manifest.checkId,
      // The store assigns the authoritative Server_Sequence/timestamp atomically
      // with the write; these are placeholders the finalizing store overwrites.
      serverSequence: 0,
      occurredAt: this.now().toISOString()
    }
  }

  /**
   * Open an authorized attachment download for a stored Artifact. The caller is
   * responsible for having reauthorized the request (Requirement 8.12); this
   * method returns only a byte stream plus safe attachment metadata and never a
   * storage credential or presigned URL. A missing object yields a
   * non-disclosing not-found (Requirement 8.13).
   */
  async download(
    scope: InvestigationScope,
    artifactId: string
  ): Promise<{
    stream: NodeJS.ReadableStream
    byteCount: number
    mediaType: string
    sanitizedFilename: string
    sha256: Sha256Hex
  }> {
    const manifest = await this.manifests.get(scope, artifactId)
    if (!manifest || manifest.investigationId !== scope.investigationId) {
      throw notFound()
    }
    const opened = await this.store.openStream(scope, artifactId)
    if (!opened) {
      // Reserved but no bytes yet, or already cleaned up: non-disclosing.
      throw notFound()
    }
    return {
      stream: opened.stream,
      byteCount: opened.byteCount,
      mediaType: manifest.mediaType,
      sanitizedFilename: manifest.sanitizedFilename,
      sha256: manifest.sha256
    }
  }
}

/**
 * In-memory {@link ArtifactManifestStore} for tests and local development. It
 * models Operation_ID idempotency (identical replay returns the stored
 * manifest; a different payload for a used Operation_ID throws payloadMismatch)
 * and per-scope, per-artifact manifest storage.
 */
export class InMemoryArtifactManifestStore implements FinalizingArtifactManifestStore {
  private readonly byArtifact = new Map<string, ArtifactManifest>()
  private readonly byOperation = new Map<string, ArtifactManifest>()
  /** Monotonic Server_Sequence per Team_Space, mirroring the cloud counter. */
  private readonly sequenceBySpace = new Map<string, number>()
  /** Appended Artifact Events, keyed by scope, for test assertions. */
  private readonly eventsByArtifact = new Map<string, ArtifactEvent>()

  private scopeKey(scope: InvestigationScope): string {
    return `${scope.tenantId}\u0000${scope.spaceId}\u0000${scope.investigationId}`
  }

  private spaceKey(scope: InvestigationScope): string {
    return `${scope.tenantId}\u0000${scope.spaceId}`
  }

  async reserve(scope: InvestigationScope, manifest: ArtifactManifest): Promise<ArtifactManifest> {
    const opKey = `${this.scopeKey(scope)}\u0000${manifest.reservationOperationId}`
    const existing = this.byOperation.get(opKey)
    if (existing) {
      if (existing.reservationPayloadHash !== manifest.reservationPayloadHash) {
        throw payloadMismatch()
      }
      return structuredClone(existing)
    }
    const stored = structuredClone(manifest)
    this.byOperation.set(opKey, stored)
    this.byArtifact.set(`${this.scopeKey(scope)}\u0000${manifest.artifactId}`, stored)
    return structuredClone(stored)
  }

  async get(scope: InvestigationScope, artifactId: string): Promise<ArtifactManifest | null> {
    const stored = this.byArtifact.get(`${this.scopeKey(scope)}\u0000${artifactId}`)
    return stored ? structuredClone(stored) : null
  }

  /**
   * Atomically flip a pending manifest to `ready` and append its Artifact
   * Event. Idempotent for an already-ready manifest: it returns the existing
   * Event without allocating a new Server_Sequence, so a retried finalization
   * never double-appends (Requirement 8.6, 24.8).
   */
  async finalize(
    scope: InvestigationScope,
    artifactId: string,
    verified: { sha256: Sha256Hex; byteCount: number; readyAt: string },
    event: ArtifactEvent
  ): Promise<FinalizedArtifact> {
    const artKey = `${this.scopeKey(scope)}\u0000${artifactId}`
    const stored = this.byArtifact.get(artKey)
    if (!stored || stored.investigationId !== scope.investigationId) {
      throw notFound()
    }

    if (stored.state === 'ready') {
      const priorEvent = this.eventsByArtifact.get(artKey)
      if (priorEvent) {
        return { manifest: structuredClone(stored), event: structuredClone(priorEvent) }
      }
    }
    if (stored.state === 'validation-failed') {
      throw validationFailed()
    }

    const nextSequence = (this.sequenceBySpace.get(this.spaceKey(scope)) ?? 0) + 1
    this.sequenceBySpace.set(this.spaceKey(scope), nextSequence)

    const committedEvent: ArtifactEvent = { ...event, serverSequence: nextSequence, occurredAt: verified.readyAt }
    stored.state = 'ready'
    stored.sha256 = verified.sha256
    stored.byteCount = verified.byteCount
    stored.readyAt = verified.readyAt
    stored.producingEventId = committedEvent.eventId

    this.eventsByArtifact.set(artKey, structuredClone(committedEvent))
    return { manifest: structuredClone(stored), event: structuredClone(committedEvent) }
  }

  async markValidationFailed(scope: InvestigationScope, artifactId: string): Promise<ArtifactManifest> {
    const artKey = `${this.scopeKey(scope)}\u0000${artifactId}`
    const stored = this.byArtifact.get(artKey)
    if (!stored || stored.investigationId !== scope.investigationId) {
      throw notFound()
    }
    // Never demote an already-ready manifest; validation failure is terminal
    // only for a still-pending manifest.
    if (stored.state === 'pending') {
      stored.state = 'validation-failed'
    }
    return structuredClone(stored)
  }
}
