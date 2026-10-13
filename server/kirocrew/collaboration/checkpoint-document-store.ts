/**
 * Shared Investigations — Checkpoint document Object_Store integration
 * (task 9.2).
 *
 * Owner: Ghostv2 collaboration domain and Object_Store integration.
 *
 * The detailed Checkpoint document is private, encrypted, versioned, write-once
 * content stored in the dedicated Object_Store — the same bucket the
 * ArtifactStore uses, under the checkpoint-document key shape from the design's
 * "Object_Store layout":
 *
 *   collaboration/{tenantOpaque}/{spaceOpaque}/{investigationOpaque}/{checkpointArtifactOpaque}/document
 *
 * This store composes that opaque, scope-contained key and writes the document
 * exactly once (Checkpoints are immutable — Requirement 12.2). It reuses the
 * pluggable {@link ObjectStorageBackend} so the same write-once, versioned,
 * credential-owning backend backs both Artifacts and Checkpoint documents;
 * storage credentials and object keys never leave this module.
 */

import {
  artifactObjectKey,
  type InvestigationScope
} from './keys'
import { sha256Hex } from './artifact-store'
import type { ObjectStorageBackend, Sha256Hex } from './artifact-types'
import type { CheckpointContent } from './checkpoint-types'

/** The media type Checkpoint documents are stored as. */
const CHECKPOINT_DOCUMENT_MEDIA_TYPE = 'application/json'

/** Result of writing (or idempotently re-writing) a Checkpoint document. */
export interface StoredCheckpointDocument {
  /** The opaque document identifier (the Object_Store `{checkpointArtifactOpaque}`). */
  documentArtifactId: string
  sha256: Sha256Hex
  byteCount: number
  versionId?: string
}

/**
 * The Checkpoint document Object_Store. It builds the write-once
 * `.../document` object key from opaque scope + document identifiers and stores
 * the serialized {@link CheckpointContent} bytes. It never overwrites an
 * existing document: an identical re-write is an idempotent replay, and a
 * different document for the same identifier is a conflict the caller surfaces
 * (Checkpoints are immutable).
 */
export class CheckpointDocumentStore {
  constructor(private readonly backend: ObjectStorageBackend) {}

  /**
   * The opaque, scope-contained Object_Store key for a Checkpoint document.
   * Reuses the Artifact object-key composer (identical opaque-id validation and
   * scope prefix) and appends the `/document` suffix from the design layout, so
   * a hostile identifier can never escape its Tenant + Team_Space prefix
   * (Requirement 7.2, 8.2).
   */
  keyFor(scope: InvestigationScope, documentArtifactId: string): string {
    return `${artifactObjectKey(scope, documentArtifactId)}/document`
  }

  /** Serialize a Checkpoint document to canonical bytes (stable key order). */
  private serialize(content: CheckpointContent): Buffer {
    return Buffer.from(JSON.stringify(canonicalize(content)), 'utf-8')
  }

  /**
   * Write the detailed Checkpoint document exactly once. If a document already
   * exists at the key:
   *   - identical bytes  -> idempotent replay (returns the stored state);
   *   - different bytes   -> a conflict is thrown (a Checkpoint is immutable and
   *                          its document is never replaced).
   */
  async put(
    scope: InvestigationScope,
    documentArtifactId: string,
    content: CheckpointContent
  ): Promise<StoredCheckpointDocument> {
    const objectKey = this.keyFor(scope, documentArtifactId)
    const bytes = this.serialize(content)
    const incomingDigest = sha256Hex(bytes)
    const result = await this.backend.putIfAbsent(objectKey, bytes, CHECKPOINT_DOCUMENT_MEDIA_TYPE)
    if ('alreadyExists' in result) {
      if (result.state.sha256 && result.state.sha256 === incomingDigest) {
        return {
          documentArtifactId,
          sha256: incomingDigest,
          byteCount: bytes.length,
          versionId: result.state.versionId
        }
      }
      throw new Error('a different checkpoint document is already stored for this identifier')
    }
    return {
      documentArtifactId,
      sha256: result.sha256,
      byteCount: result.byteCount,
      versionId: result.versionId
    }
  }

  /**
   * Read a stored Checkpoint document's bytes back. Returns `null` when no
   * document exists (so a caller can answer with a non-disclosing not-found).
   */
  async get(
    scope: InvestigationScope,
    documentArtifactId: string
  ): Promise<CheckpointContent | null> {
    const opened = await this.backend.get(this.keyFor(scope, documentArtifactId))
    if (!opened) return null
    const chunks: Buffer[] = []
    for await (const chunk of opened.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
    }
    const text = Buffer.concat(chunks).toString('utf-8')
    try {
      return JSON.parse(text) as CheckpointContent
    } catch {
      return null
    }
  }
}

/** Deterministic JSON value: object keys sorted, arrays in order, undefined dropped. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k]
      if (v !== undefined) out[k] = canonicalize(v)
    }
    return out
  }
  return value
}
