import { createHash } from 'node:crypto'
import { GetObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getKiroCrewPayloadBucketName, getKiroCrewPayloadSizeCap } from './config'

/**
 * A staged Installer_Payload artifact served read-scoped at
 * `GET /api/kirocrew/v1/payload/<revision>`.
 *
 * The artifact is code and app definitions only (installer `.py` files, each
 * app's `app.json`/`agents`/`skills`/`schema`, the committed `ui/dist/index.mjs`,
 * and `app-registry.json`). It never contains product binaries, model weights,
 * or secret material — those are excluded by the packaging tool before the bytes
 * are ever uploaded — so serving the bytes verbatim cannot leak a secret record
 * value. Any revision metadata surfaced alongside a payload goes through
 * `redactRevision`.
 */
export interface KiroCrewPayloadArtifact {
  /** The revision this artifact belongs to. */
  revision: number
  /** The artifact bytes (tar). */
  body: Uint8Array
  /** Total size of the artifact in bytes. */
  sizeBytes: number
  /** sha256 hex of the artifact bytes, used as the strong etag basis. */
  sha256: string
  /** Object content type; defaults to application/x-tar. */
  contentType: string
}

/** Metadata about a stored artifact, cheap to fetch without the body. */
export interface KiroCrewPayloadHead {
  revision: number
  sizeBytes: number
  sha256: string
  contentType: string
}

export class KiroCrewPayloadTooLarge extends Error {
  constructor(public readonly sizeBytes: number, public readonly cap: number) {
    super(`payload artifact of ${sizeBytes} bytes exceeds the ${cap} byte serve cap`)
    this.name = 'KiroCrewPayloadTooLarge'
  }
}

export interface KiroCrewPayloadStore {
  /** Return artifact metadata, or null when no artifact exists for the revision. */
  head(revision: number): Promise<KiroCrewPayloadHead | null>
  /** Return the artifact bytes + metadata, or null when it does not exist. */
  get(revision: number): Promise<KiroCrewPayloadArtifact | null>
}

/** Immutable, revision-addressed key: kirocrew/payload/<revision>.tar */
export function payloadObjectKey(revision: number): string {
  return `kirocrew/payload/${revision}.tar`
}

/**
 * In-memory store for tests. Populate it with
 * `setKiroCrewPayloadStoreForTest(new MemoryKiroCrewPayloadStore({...}))`.
 */
export class MemoryKiroCrewPayloadStore implements KiroCrewPayloadStore {
  private readonly artifacts = new Map<number, KiroCrewPayloadArtifact>()

  constructor(seed: Record<number, { body: Uint8Array; sha256?: string; contentType?: string }> = {}) {
    for (const [revision, value] of Object.entries(seed)) {
      this.put(Number(revision), value.body, value)
    }
  }

  put(
    revision: number,
    body: Uint8Array,
    options: { sha256?: string; contentType?: string } = {}
  ): void {
    this.artifacts.set(revision, {
      revision,
      body,
      sizeBytes: body.byteLength,
      sha256: options.sha256 || sha256Hex(body),
      contentType: options.contentType || 'application/x-tar'
    })
  }

  async head(revision: number): Promise<KiroCrewPayloadHead | null> {
    const artifact = this.artifacts.get(revision)
    if (!artifact) return null
    const { body: _body, ...head } = artifact
    return head
  }

  async get(revision: number): Promise<KiroCrewPayloadArtifact | null> {
    const artifact = this.artifacts.get(revision)
    return artifact ? { ...artifact, body: artifact.body.slice() } : null
  }
}

/** S3-backed store. Objects are write-once per revision in the Ghost account. */
export class S3KiroCrewPayloadStore implements KiroCrewPayloadStore {
  constructor(
    private readonly bucket: string,
    private readonly client = new S3Client({
      region: process.env.AWS_REGION || process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1',
      useFipsEndpoint: true
    })
  ) {}

  async head(revision: number): Promise<KiroCrewPayloadHead | null> {
    try {
      const result = await this.client.send(new HeadObjectCommand({
        Bucket: this.bucket,
        Key: payloadObjectKey(revision)
      }))
      return {
        revision,
        sizeBytes: Number(result.ContentLength || 0),
        sha256: metadataSha256(result.Metadata),
        contentType: result.ContentType || 'application/x-tar'
      }
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
  }

  async get(revision: number): Promise<KiroCrewPayloadArtifact | null> {
    let result
    try {
      result = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: payloadObjectKey(revision)
      }))
    } catch (error) {
      if (isNotFound(error)) return null
      throw error
    }
    const body = result.Body
      ? new Uint8Array(await result.Body.transformToByteArray())
      : new Uint8Array(0)
    const stored = metadataSha256(result.Metadata)
    return {
      revision,
      body,
      sizeBytes: Number(result.ContentLength || body.byteLength),
      sha256: stored || sha256Hex(body),
      contentType: result.ContentType || 'application/x-tar'
    }
  }
}

function metadataSha256(metadata: Record<string, string> | undefined): string {
  const value = metadata?.sha256 || metadata?.['sha-256'] || ''
  return /^[A-Fa-f0-9]{64}$/.test(value) ? value.toLowerCase() : ''
}

function isNotFound(error: unknown): boolean {
  const name = (error as { name?: string })?.name
  const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode
  return name === 'NoSuchKey' || name === 'NotFound' || status === 404
}

let store: KiroCrewPayloadStore | undefined

export function getKiroCrewPayloadStore(): KiroCrewPayloadStore {
  if (!store) {
    const bucket = getKiroCrewPayloadBucketName()
    store = bucket
      ? new S3KiroCrewPayloadStore(bucket)
      : new MemoryKiroCrewPayloadStore()
  }
  return store
}

export function setKiroCrewPayloadStoreForTest(value: KiroCrewPayloadStore | undefined): void {
  store = value
}

export { getKiroCrewPayloadSizeCap }

function sha256Hex(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex')
}
