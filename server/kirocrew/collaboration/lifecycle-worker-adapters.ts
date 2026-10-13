/**
 * Shared Investigations — production adapters for the abandoned-upload cleanup
 * worker (task 4.3).
 *
 * Owner: Ghostv2 lifecycle workers and scheduling integration.
 *
 * `lifecycle-worker.ts` holds the storage-neutral sweep logic and three narrow
 * ports (lister, remover, durable claim store) plus in-memory implementations
 * for tests. This module binds those ports to the real infrastructure the
 * EventBridge schedule (`terraform/modules/collaboration/scheduler.tf`)
 * ultimately drives:
 *
 *   - {@link DynamoAbandonedUploadLister} — Queries the `PendingManifestLifecycle`
 *     GSI (task 3.1 infra + `keys.ts`) for `pending` manifests reserved on or
 *     before the seven-day threshold, in reservation-time order, WITHOUT a
 *     routine table scan (Requirements 8.11, 7.12). The opaque page cursor is
 *     the DynamoDB `LastEvaluatedKey`, base64-encoded, so a resumed sweep
 *     continues exactly where it left off.
 *
 *   - {@link S3AndRecordAbandonedUploadRemover} — deletes the manifest row, then
 *     enumerates and deletes EVERY version (and delete marker) of the backing
 *     object under its opaque, scope-contained key (Requirements 8.11, 20.4).
 *     Idempotent: a re-invocation after a crash is a no-op success.
 *
 *   - {@link DynamoWorkerClaimStore} — a durable, single-holder lease with a
 *     persisted restart-safe cursor, implemented as one conditional DynamoDB
 *     item. `acquire` succeeds only when the claim is unheld or its lease has
 *     expired; `saveProgress` extends the lease and persists the cursor only
 *     while this replica still holds it, so a replica that lost its lease can
 *     never overwrite the new holder's progress (Requirement 20.12).
 *
 * The worker never talks to AWS directly; it depends only on the ports. This
 * module is the single seam where the ports meet DynamoDB and S3, so the sweep
 * logic stays unit-testable against the in-memory backends.
 */

import {
  DeleteObjectCommand,
  ListObjectVersionsCommand,
  type S3Client
} from '@aws-sdk/client-s3'
import {
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
  QueryCommand,
  type AttributeValue,
  type DynamoDBClient
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { CollaborationAccessPatterns } from './access-patterns'
import {
  artifactKey,
  artifactObjectKey,
  PENDING_MANIFEST_LIFECYCLE_INDEX,
  type InvestigationScope,
  type SpaceScope
} from './keys'
import type {
  AbandonedUploadCandidate,
  AbandonedUploadLister,
  AbandonedUploadRemover,
  WorkerClaim,
  WorkerClaimStore
} from './lifecycle-worker'

/** Shape of the persisted Artifact manifest attributes the worker reads. */
interface PendingManifestItem {
  tenantId: string
  spaceId: string
  investigationId: string
  artifactId: string
  state: string
  reservedAt: string
  /**
   * Server-maintained flag: true only while NO durable Event references this
   * Artifact. The worker treats a missing flag as referenced (fail-safe): it
   * would rather skip a candidate than remove a referenced Artifact.
   */
  unreferenced?: boolean
}

/** Encode a DynamoDB LastEvaluatedKey as an opaque, restart-safe page cursor. */
function encodeCursor(lastKey: Record<string, AttributeValue> | undefined): string | undefined {
  if (!lastKey) return undefined
  return Buffer.from(JSON.stringify(lastKey), 'utf-8').toString('base64url')
}

/** Decode an opaque page cursor back into a DynamoDB ExclusiveStartKey. */
function decodeCursor(cursor: string | undefined): Record<string, AttributeValue> | undefined {
  if (!cursor) return undefined
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as Record<string, AttributeValue>
  } catch {
    // A malformed cursor restarts the sweep from the beginning rather than
    // throwing; the durable claim still prevents concurrent double-processing.
    return undefined
  }
}

/**
 * DynamoDB-backed {@link AbandonedUploadLister}. Reads the
 * `PendingManifestLifecycle` GSI for `pending` manifests reserved on or before
 * the threshold, in reservation-time order, one page at a time.
 */
export class DynamoAbandonedUploadLister implements AbandonedUploadLister {
  private readonly access: CollaborationAccessPatterns

  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string,
    /**
     * The Team_Spaces to sweep. The GSI partitions pending manifests by
     * Tenant+Team_Space, so the worker enumerates known spaces rather than
     * scanning; enablement publishes this set (task 3.1 disabled-first).
     */
    private readonly spaces: readonly SpaceScope[]
  ) {
    this.access = new CollaborationAccessPatterns(tableName)
  }

  async listAbandonedPending(input: {
    reservedOnOrBefore: Date
    cursor?: string
    limit: number
  }): Promise<{ candidates: AbandonedUploadCandidate[]; nextCursor?: string }> {
    // The composite cursor carries which space we are in plus the GSI position.
    const decoded = decodeCursor(input.cursor)
    const spaceIndex = typeof decoded?.__spaceIndex === 'object' ? Number(decoded.__spaceIndex.N) : 0
    const startKey = decoded?.__startKey ? (decoded.__startKey as unknown as { M: Record<string, AttributeValue> }).M : undefined

    for (let i = Number.isFinite(spaceIndex) ? spaceIndex : 0; i < this.spaces.length; i++) {
      const scope = this.spaces[i]
      const descriptor = this.access.queryPendingManifestsReservedOnOrBefore(
        scope,
        input.reservedOnOrBefore.toISOString(),
        { limit: input.limit }
      )
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          IndexName: PENDING_MANIFEST_LIFECYCLE_INDEX,
          KeyConditionExpression: descriptor.keyConditionExpression,
          ExpressionAttributeNames: descriptor.expressionAttributeNames,
          ExpressionAttributeValues: descriptor.expressionAttributeValues as Record<string, AttributeValue>,
          ScanIndexForward: descriptor.scanIndexForward,
          Limit: descriptor.limit,
          ExclusiveStartKey: i === spaceIndex ? startKey : undefined
        })
      )

      const candidates = (response.Items ?? [])
        .map((item) => unmarshall(item) as PendingManifestItem)
        .map((item) => toCandidate(item))

      const more = response.LastEvaluatedKey
      if (more) {
        return { candidates, nextCursor: encodeCompositeCursor(i, more) }
      }
      // This space is exhausted; if there are more spaces, advance to the next.
      if (candidates.length > 0 && i < this.spaces.length - 1) {
        return { candidates, nextCursor: encodeCompositeCursor(i + 1, undefined) }
      }
      if (candidates.length > 0) {
        return { candidates, nextCursor: undefined }
      }
      // Empty page for this space: fall through to the next space in the loop.
    }
    return { candidates: [], nextCursor: undefined }
  }
}

/** Compose the (space index, GSI position) cursor into one opaque token. */
function encodeCompositeCursor(
  spaceIndex: number,
  startKey: Record<string, AttributeValue> | undefined
): string {
  const composite: Record<string, AttributeValue> = {
    __spaceIndex: { N: String(spaceIndex) }
  }
  if (startKey) {
    composite.__startKey = { M: startKey }
  }
  return encodeCursor(composite)!
}

/** Project a persisted manifest item to the safe candidate the worker sees. */
function toCandidate(item: PendingManifestItem): AbandonedUploadCandidate {
  return {
    scope: { tenantId: item.tenantId, spaceId: item.spaceId, investigationId: item.investigationId },
    artifactId: item.artifactId,
    reservedAt: item.reservedAt,
    pending: item.state === 'pending',
    // Missing flag is treated as referenced so a manifest is never removed
    // unless the server has affirmatively marked it unreferenced.
    referenced: item.unreferenced !== true
  }
}

/**
 * Removes an abandoned reservation and every version of its backing object.
 * Order: delete the manifest row first (so a partially-cleaned reservation is
 * never re-listed as a live pending manifest), then enumerate and delete every
 * object version and delete marker under the artifact's opaque key.
 */
export class S3AndRecordAbandonedUploadRemover implements AbandonedUploadRemover {
  constructor(
    private readonly dynamo: DynamoDBClient,
    private readonly s3: S3Client,
    private readonly config: { tableName: string; bucket: string }
  ) {}

  async removeReservationAndObjectVersions(scope: InvestigationScope, artifactId: string): Promise<void> {
    // 1) Remove the manifest row. Unconditional delete is idempotent: deleting
    //    an already-absent row is a no-op success, so a retry after a crash
    //    never fails on the second pass.
    const { pk, sk } = artifactKey(scope, artifactId)
    await this.dynamo.send(
      new DeleteItemCommand({ TableName: this.config.tableName, Key: marshall({ pk, sk }) })
    )

    // 2) Delete every version and delete marker of the backing object.
    const prefix = artifactObjectKey(scope, artifactId)
    let keyMarker: string | undefined
    let versionIdMarker: string | undefined
    do {
      const listed = await this.s3.send(
        new ListObjectVersionsCommand({
          Bucket: this.config.bucket,
          Prefix: prefix,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker
        })
      )

      const targets = [
        ...(listed.Versions ?? []),
        ...(listed.DeleteMarkers ?? [])
      ].filter((entry) => entry.Key === prefix && entry.VersionId)

      for (const entry of targets) {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.config.bucket,
            Key: entry.Key!,
            VersionId: entry.VersionId
          })
        )
      }

      keyMarker = listed.IsTruncated ? listed.NextKeyMarker : undefined
      versionIdMarker = listed.IsTruncated ? listed.NextVersionIdMarker : undefined
    } while (keyMarker || versionIdMarker)
  }
}

/**
 * Persisted shape of the durable worker claim row. One item per claim name;
 * `leaseExpiresAt`/`owner` implement the single-holder lease and `cursor`
 * carries restart-safe progress.
 */
interface WorkerClaimItem {
  pk: string
  sk: string
  owner: string
  /** Lease expiry as epoch milliseconds. */
  leaseExpiresAt: number
  cursor?: string
}

/** DynamoDB partition/sort key for a named worker claim. */
function claimKey(claimName: string): { pk: string; sk: string } {
  return { pk: `WORKERCLAIM#${claimName}`, sk: 'CLAIM' }
}

/**
 * DynamoDB-backed {@link WorkerClaimStore}. The claim is a single item written
 * with conditional expressions so exactly one replica holds it at a time and a
 * lost lease can never clobber the new holder's progress (Requirement 20.12).
 */
export class DynamoWorkerClaimStore implements WorkerClaimStore {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly config: { tableName: string }
  ) {}

  async acquire(input: {
    claimName: string
    ownerToken: string
    leaseExpiresAt: Date
    now: Date
  }): Promise<WorkerClaim | null> {
    const key = claimKey(input.claimName)
    const existing = await this.readClaim(input.claimName)
    const nowMs = input.now.getTime()

    if (existing && existing.owner !== input.ownerToken && existing.leaseExpiresAt > nowMs) {
      // A different, still-live holder owns the claim; stand down.
      return null
    }

    const item: WorkerClaimItem = {
      pk: key.pk,
      sk: key.sk,
      owner: input.ownerToken,
      leaseExpiresAt: input.leaseExpiresAt.getTime(),
      cursor: existing?.cursor
    }

    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.config.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          // Acquire only if the claim is unheld, already ours, or its lease has
          // lapsed. This closes the race between reading and writing: a
          // concurrent acquirer's write fails this condition.
          ConditionExpression:
            'attribute_not_exists(pk) OR #owner = :owner OR #lease <= :now',
          ExpressionAttributeNames: { '#owner': 'owner', '#lease': 'leaseExpiresAt' },
          ExpressionAttributeValues: marshall({ ':owner': input.ownerToken, ':now': nowMs })
        })
      )
    } catch (error: unknown) {
      if (isConditionalCheckFailed(error)) {
        // Another replica won the race between our read and write.
        return null
      }
      throw error
    }

    return { ownerToken: input.ownerToken, cursor: existing?.cursor }
  }

  async saveProgress(input: {
    claimName: string
    ownerToken: string
    cursor: string | undefined
    leaseExpiresAt: Date
    now: Date
  }): Promise<boolean> {
    const key = claimKey(input.claimName)
    const item: WorkerClaimItem = {
      pk: key.pk,
      sk: key.sk,
      owner: input.ownerToken,
      leaseExpiresAt: input.leaseExpiresAt.getTime(),
      cursor: input.cursor
    }
    try {
      await this.client.send(
        new PutItemCommand({
          TableName: this.config.tableName,
          Item: marshall(item, { removeUndefinedValues: true }),
          // Persist progress only while we still hold the claim.
          ConditionExpression: 'attribute_exists(pk) AND #owner = :owner',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: marshall({ ':owner': input.ownerToken })
        })
      )
      return true
    } catch (error: unknown) {
      if (isConditionalCheckFailed(error)) {
        // Lost the lease to another replica; do not overwrite its progress.
        return false
      }
      throw error
    }
  }

  async release(input: { claimName: string; ownerToken: string }): Promise<void> {
    const key = claimKey(input.claimName)
    try {
      await this.client.send(
        new DeleteItemCommand({
          TableName: this.config.tableName,
          Key: marshall(key),
          ConditionExpression: 'attribute_not_exists(pk) OR #owner = :owner',
          ExpressionAttributeNames: { '#owner': 'owner' },
          ExpressionAttributeValues: marshall({ ':owner': input.ownerToken })
        })
      )
    } catch (error: unknown) {
      // Releasing a claim we no longer hold is a benign no-op.
      if (isConditionalCheckFailed(error)) return
      throw error
    }
  }

  private async readClaim(claimName: string): Promise<WorkerClaimItem | null> {
    const key = claimKey(claimName)
    const response = await this.client.send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: marshall(key),
        ConsistentRead: true
      })
    )
    return response.Item ? (unmarshall(response.Item) as WorkerClaimItem) : null
  }
}

function isConditionalCheckFailed(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String((error as { name?: unknown }).name) : undefined
  return name === 'ConditionalCheckFailedException'
}
