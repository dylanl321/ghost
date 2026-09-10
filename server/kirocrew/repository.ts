import {
  DynamoDBClient,
  GetItemCommand,
  TransactWriteItemsCommand
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { getKiroCrewTableName } from './config'
import type { KiroCrewRepository, KiroCrewRevision } from './types'

const PROFILE_ID = 'PROFILE#default'
const memory = { revision: null as KiroCrewRevision | null }

export class MemoryKiroCrewRepository implements KiroCrewRepository {
  async current(): Promise<KiroCrewRevision | null> {
    return memory.revision ? structuredClone(memory.revision) : null
  }

  async publish(input: {
    expectedRevision: number
    records: KiroCrewRevision['records']
    publishedBy: string
  }): Promise<KiroCrewRevision> {
    const actual = memory.revision?.revision || 0
    if (actual !== input.expectedRevision) throw new KiroCrewRevisionConflict(actual)
    const revision: KiroCrewRevision = {
      schemaVersion: 1,
      revision: actual + 1,
      updatedAt: new Date().toISOString(),
      publishedBy: input.publishedBy,
      records: structuredClone(input.records)
    }
    memory.revision = revision
    return structuredClone(revision)
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
    const revisionResult = await this.client.send(new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({
        profileId: PROFILE_ID,
        recordId: revisionKey(pointer.revision)
      }),
      ConsistentRead: true
    }))
    if (!revisionResult.Item) throw new Error('Kiro Crew current revision is missing')
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
