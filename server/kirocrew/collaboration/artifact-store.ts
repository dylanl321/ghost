/**
 * Shared Investigations — ArtifactStore (task 4.1).
 *
 * Owner: Ghostv2 ArtifactStore.
 *
 * The ArtifactStore owns the dedicated private, versioned, KMS-encrypted,
 * TLS-only S3 bucket provisioned in task 3.1. It is the only component that
 * holds storage credentials: GHOST streams uploads and downloads through it,
 * and storage credentials / presigned access are never exposed to the
 * dashboard or Operator status (Requirements 8.1, 8.13).
 *
 * Responsibilities implemented here:
 *   - Compose opaque, scope-contained object keys (Requirement 8.2, 7.2).
 *   - Compute SHA-256 over the post-redaction bytes actually shared and refuse
 *     to overwrite an existing object (write-once) (Requirements 8.5, 8.10).
 *   - Report object existence / version / checksum for the repository's
 *     reconciliation protocol (Requirement 8.9).
 *   - Stream stored bytes back for authorized attachment downloads
 *     (Requirement 8.12).
 */

import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
  type S3Client
} from '@aws-sdk/client-s3'
import { artifactObjectKey } from './keys'
import type { InvestigationScope } from './keys'
import type {
  ObjectStorageBackend,
  Sha256Hex,
  StoredObjectResult,
  StoredObjectState
} from './artifact-types'

/** Metadata key under which the store records the shared-bytes SHA-256. */
const SHA256_METADATA_KEY = 'sha256'

/** Compute the lowercase hex SHA-256 of a buffer (the shared bytes). */
export function sha256Hex(bytes: Buffer): Sha256Hex {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * The ArtifactStore. It composes object keys and enforces write-once semantics
 * on top of a pluggable {@link ObjectStorageBackend}. Callers never learn the
 * bucket name, region, or credentials.
 */
export class ArtifactStore {
  constructor(private readonly backend: ObjectStorageBackend) {}

  /** The opaque object key for an Artifact within its scope. */
  keyFor(scope: InvestigationScope, artifactId: string): string {
    return artifactObjectKey(scope, artifactId)
  }

  /**
   * Read the current physical object state for reconciliation. Returns
   * `{ exists: false }` when nothing has been written yet.
   */
  async inspect(scope: InvestigationScope, artifactId: string): Promise<StoredObjectState> {
    return this.backend.head(this.keyFor(scope, artifactId))
  }

  /**
   * Write bytes exactly once. The store computes the SHA-256 of the bytes it
   * actually persists and returns it alongside the object version. If an object
   * already exists at the key, the backend reports its state instead of
   * overwriting; the caller decides idempotent-replay vs. conflict.
   */
  async putOnce(
    scope: InvestigationScope,
    artifactId: string,
    bytes: Buffer,
    mediaType: string
  ): Promise<StoredObjectResult | { alreadyExists: true; state: StoredObjectState }> {
    const objectKey = this.keyFor(scope, artifactId)
    const result = await this.backend.putIfAbsent(objectKey, bytes, mediaType)
    return result
  }

  /**
   * Open a stream of the stored bytes for an authorized attachment download.
   * Returns `null` when no object exists (so the caller can answer with a
   * non-disclosing not-found).
   */
  async openStream(
    scope: InvestigationScope,
    artifactId: string
  ): Promise<{ stream: NodeJS.ReadableStream; byteCount: number } | null> {
    return this.backend.get(this.keyFor(scope, artifactId))
  }
}

/**
 * In-memory storage backend for tests and local development. It faithfully
 * models write-once behavior (a second write to an existing key returns the
 * existing state rather than replacing bytes) and versioning (a monotonic
 * version id), without any AWS dependency.
 */
export class InMemoryObjectStorageBackend implements ObjectStorageBackend {
  private readonly objects = new Map<
    string,
    { bytes: Buffer; sha256: Sha256Hex; versionId: string }
  >()

  private versionCounter = 0

  async putIfAbsent(
    objectKey: string,
    body: Buffer,
    _mediaType: string
  ): Promise<StoredObjectResult | { alreadyExists: true; state: StoredObjectState }> {
    const existing = this.objects.get(objectKey)
    if (existing) {
      // Write-once: never replace stored bytes (Requirement 8.5, 8.10).
      return {
        alreadyExists: true,
        state: {
          exists: true,
          versionId: existing.versionId,
          sha256: existing.sha256,
          byteCount: existing.bytes.length
        }
      }
    }
    const versionId = `v${++this.versionCounter}`
    const digest = sha256Hex(body)
    this.objects.set(objectKey, { bytes: Buffer.from(body), sha256: digest, versionId })
    return { versionId, sha256: digest, byteCount: body.length }
  }

  async head(objectKey: string): Promise<StoredObjectState> {
    const existing = this.objects.get(objectKey)
    if (!existing) return { exists: false }
    return {
      exists: true,
      versionId: existing.versionId,
      sha256: existing.sha256,
      byteCount: existing.bytes.length
    }
  }

  async get(objectKey: string): Promise<{ stream: NodeJS.ReadableStream; byteCount: number } | null> {
    const existing = this.objects.get(objectKey)
    if (!existing) return null
    return { stream: Readable.from(existing.bytes), byteCount: existing.bytes.length }
  }
}

/**
 * Configuration for the S3-backed store. The bucket/region/KMS key come from
 * the disabled-by-default infrastructure (task 3.1); credentials are provided
 * by the injected {@link S3Client} and never leave this module.
 */
export interface S3ArtifactBackendConfig {
  bucket: string
  /** Optional KMS key id/arn for SSE-KMS (the bucket also enforces a default). */
  kmsKeyId?: string
}

/**
 * S3-backed {@link ObjectStorageBackend}. Write-once is enforced with an
 * `If-None-Match: *` precondition so a concurrent or repeated write can never
 * silently replace stored bytes; the store falls back to reading the existing
 * object's state so the service can compare checksums (Requirement 8.5, 8.10).
 */
export class S3ObjectStorageBackend implements ObjectStorageBackend {
  constructor(
    private readonly client: S3Client,
    private readonly config: S3ArtifactBackendConfig
  ) {}

  async putIfAbsent(
    objectKey: string,
    body: Buffer,
    mediaType: string
  ): Promise<StoredObjectResult | { alreadyExists: true; state: StoredObjectState }> {
    const digest = sha256Hex(body)
    const input: PutObjectCommandInput = {
      Bucket: this.config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: mediaType,
      // Write-once: reject the PUT if any object already exists at this key.
      IfNoneMatch: '*',
      Metadata: { [SHA256_METADATA_KEY]: digest },
      ChecksumSHA256: Buffer.from(digest, 'hex').toString('base64')
    }
    if (this.config.kmsKeyId) {
      input.ServerSideEncryption = 'aws:kms'
      input.SSEKMSKeyId = this.config.kmsKeyId
    }
    try {
      const response = await this.client.send(new PutObjectCommand(input))
      return { versionId: response.VersionId, sha256: digest, byteCount: body.length }
    } catch (error: unknown) {
      if (isPreconditionFailed(error)) {
        // An object already exists. Report its state; the service compares.
        const state = await this.head(objectKey)
        return { alreadyExists: true, state }
      }
      throw error
    }
  }

  async head(objectKey: string): Promise<StoredObjectState> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: objectKey })
      )
      return {
        exists: true,
        versionId: response.VersionId,
        sha256: response.Metadata?.[SHA256_METADATA_KEY],
        byteCount: typeof response.ContentLength === 'number' ? response.ContentLength : undefined
      }
    } catch (error: unknown) {
      if (isNotFound(error)) return { exists: false }
      throw error
    }
  }

  async get(objectKey: string): Promise<{ stream: NodeJS.ReadableStream; byteCount: number } | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: objectKey })
      )
      if (!response.Body) return null
      return {
        stream: response.Body as unknown as NodeJS.ReadableStream,
        byteCount: typeof response.ContentLength === 'number' ? response.ContentLength : 0
      }
    } catch (error: unknown) {
      if (isNotFound(error)) return null
      throw error
    }
  }
}

function errorName(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'name' in error) {
    return String((error as { name?: unknown }).name)
  }
  return undefined
}

function statusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'httpStatusCode' in error) {
    const code = (error as { httpStatusCode?: unknown }).httpStatusCode
    if (typeof code === 'number') return code
  }
  if (error && typeof error === 'object' && '$metadata' in error) {
    const meta = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
    if (meta && typeof meta.httpStatusCode === 'number') return meta.httpStatusCode
  }
  return undefined
}

function isPreconditionFailed(error: unknown): boolean {
  return errorName(error) === 'PreconditionFailed' || statusCode(error) === 412
}

function isNotFound(error: unknown): boolean {
  const name = errorName(error)
  return name === 'NotFound' || name === 'NoSuchKey' || statusCode(error) === 404
}
