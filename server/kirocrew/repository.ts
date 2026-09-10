import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { getKiroCrewTableName } from './config'
import type { KiroCrewRepository, KiroCrewRevision } from './types'

const PROFILE_ID = 'PROFILE#default'
// Retain the full monotonic revision history plus a separate CURRENT pointer so
// the in-memory store mirrors the Dynamo store's retention (Requirement 23.1)
// and supports re-pointing CURRENT to a prior revision (Requirement 23.2).
const memory = {
  history: new Map<number, KiroCrewRevision>(),
  current: 0 as number
}

export class MemoryKiroCrewRepository implements KiroCrewRepository {
  async current(): Promise<KiroCrewRevision | null> {
    const revision = memory.current ? memory.history.get(memory.current) : null
    return revision ? structuredClone(revision) : null
  }

  async revision(revision: number): Promise<KiroCrewRevision | null> {
    const stored = memory.history.get(revision)
    return stored ? structuredClone(stored) : null
  }

  async publish(input: {
    expectedRevision: number
    records: KiroCrewRevision['records']
    publishedBy: string
  }): Promise<KiroCrewRevision> {
    const actual = memory.current
    if (actual !== input.expectedRevision) throw new KiroCrewRevisionConflict(actual)
    const revision: KiroCrewRevision = {
      schemaVersion: 1,
      revision: actual + 1,
      updatedAt: new Date().toISOString(),
      publishedBy: input.publishedBy,
      records: structuredClone(input.records)
    }
    // Immutable append: a revision number is written once and never reused.
    memory.history.set(revision.revision, revision)
    memory.current = revision.revision
    return structuredClone(revision)
  }

  async repoint(revision: number): Promise<KiroCrewRevision> {
    const target = memory.history.get(revision)
    if (!target) throw new Error(`cannot re-point to revision ${revision}: it was never published`)
    // Move CURRENT only; history and the target revision's records/publishedBy
    // are untouched (Requirement 23.2, 23.3).
    memory.current = revision
    return structuredClone(target)
  }
}

export class KiroCrewRevisionConflict extends Error {
  constructor(public readonly actualRevision: number) {
    super(`configuration revision changed; current revision is ${actualRevision}`)
    this.name = 'KiroCrewRevisionConflict'
  }
}

interface StoredRevision extends KiroCrewRevision {
  profileId: string
  recordId: string
}

export class DynamoKiroCrewRepository implements KiroCrewRepository {
  constructor(
    private readonly tableName: string,
    private readonly client = new DynamoDBClient({
      region: process.env.AWS_REGION || process.env.AWS_GOVCLOUD_REGION || 'us-gov-west-1',
      useFipsEndpoint: true
    })
  ) {}

  async current(): Promise<KiroCrewRevision | null> {
    const pointerResult = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ profileId: PROFILE_ID, recordId: 'CURRENT' }),
      ConsistentRead: true
    }))
    const pointer = pointerResult.Item
      ? unmarshall(pointerResult.Item) as { revision?: number }
      : null
    if (!pointer?.revision) return null
    const revision = await this.revision(pointer.revision)
    if (!revision) throw new Error('Kiro Crew current revision is missing')
    return revision
  }

  async revision(revision: number): Promise<KiroCrewRevision | null> {
    const revisionResult = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        profileId: PROFILE_ID,
        recordId: revisionKey(revision)
      }),
      ConsistentRead: true
    }))
    if (!revisionResult.Item) return null
    return stripStorageKeys(unmarshall(revisionResult.Item) as StoredRevision)
  }

  async publish(input: {
    expectedRevision: number
    records: KiroCrewRevision['records']
    publishedBy: string
  }): Promise<KiroCrewRevision> {
    const revision: KiroCrewRevision = {
      schemaVersion: 1,
      revision: input.expectedRevision + 1,
      updatedAt: new Date().toISOString(),
      publishedBy: input.publishedBy,
      records: input.records
    }
    const stored: StoredRevision = {
      profileId: PROFILE_ID,
      recordId: revisionKey(revision.revision),
      ...revision
    }
    const pointer = {
      profileId: PROFILE_ID,
      recordId: 'CURRENT',
      revision: revision.revision,
      updatedAt: revision.updatedAt
    }
    try {
      await this.client.send(new TransactWriteItemsCommand({
        TransactItems: [
          {
            Put: {
              TableName: this.tableName,
              Item: marshall(stored, { removeUndefinedValues: true }),
              ConditionExpression: 'attribute_not_exists(recordId)'
            }
          },
          {
            Put: {
              TableName: this.tableName,
              Item: marshall(pointer),
              ConditionExpression: input.expectedRevision === 0
                ? 'attribute_not_exists(recordId)'
                : 'revision = :expected',
              ExpressionAttributeValues: input.expectedRevision === 0
                ? undefined
                : marshall({ ':expected': input.expectedRevision })
            }
          }
        ]
      }))
    } catch (error: any) {
      if (error?.name === 'TransactionCanceledException' || error?.name === 'ConditionalCheckFailedException') {
        const current = await this.current()
        throw new KiroCrewRevisionConflict(current?.revision || 0)
      }
      throw error
    }
    return revision
  }

  async repoint(revision: number): Promise<KiroCrewRevision> {
    // The target must be an already-published, retained revision. Reading it
    // first also guards against re-pointing to a revision that never existed.
    const target = await this.revision(revision)
    if (!target) throw new Error(`cannot re-point to revision ${revision}: it was never published`)
    const pointer = {
      profileId: PROFILE_ID,
      recordId: 'CURRENT',
      revision: target.revision,
      updatedAt: new Date().toISOString()
    }
    // Move CURRENT only. The immutable `REV#` items (and their publishedBy) are
    // never rewritten, so history and attribution stay intact (Requirement
    // 23.1-23.3), and the prior revision's S3 payload object is reused as-is.
    // The pointer already exists (a re-point only happens after prior publishes),
    // so require attribute_exists to avoid racing an initial publish.
    await this.client.send(new TransactWriteItemsCommand({
      TransactItems: [
        {
          Put: {
            TableName: this.tableName,
            Item: marshall(pointer),
            ConditionExpression: 'attribute_exists(recordId)'
          }
        }
      ]
    }))
    return target
  }
}

function revisionKey(revision: number): string {
  return `REV#${String(revision).padStart(12, '0')}`
}

function stripStorageKeys(item: StoredRevision): KiroCrewRevision {
  return {
    schemaVersion: 1,
    revision: item.revision,
    updatedAt: item.updatedAt,
    publishedBy: item.publishedBy,
    records: item.records
  }
}

let repository: KiroCrewRepository | undefined

export function getKiroCrewRepository(): KiroCrewRepository {
  if (!repository) {
    const tableName = getKiroCrewTableName()
    repository = tableName
      ? new DynamoKiroCrewRepository(tableName)
      : new MemoryKiroCrewRepository()
  }
  return repository
}

export function setKiroCrewRepositoryForTest(value: KiroCrewRepository | undefined): void {
  repository = value
}
