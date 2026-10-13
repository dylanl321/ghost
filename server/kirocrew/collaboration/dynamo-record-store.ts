/**
 * Shared Investigations — DynamoDB transactional record store (task 3.3).
 *
 * Owner: Ghostv2 CollaborationRepository.
 *
 * Maps a storage-engine-neutral {@link TransactionPlan} onto DynamoDB
 * `TransactWriteItems` with conditional expressions, and single-item strongly
 * consistent `GetItem` reads (Requirement 7.11). Every op becomes exactly one
 * transaction item so the whole mutation commits all-or-nothing
 * (Requirement 7.3):
 *
 *   - `putIfAbsent`      -> Put with `attribute_not_exists(pk)`
 *   - `put`              -> Put (no condition)
 *   - `updateIfRevision` -> Put with `#rev = :expected` on the stored item
 *   - `incrementCounter` -> Update `SET #v = :next` with the current-value
 *                           condition (`attribute_not_exists` when starting at 0)
 *   - `check`            -> ConditionCheck on existence
 *
 * A `TransactionCanceledException` (any condition failed) is normalized into a
 * {@link TransactionConflictError} carrying the best-known reason so the
 * repository can decide replay vs. retry vs. caller-conflict. This module holds
 * no idempotency or Revision *policy*; it only executes conditions.
 */

import {
  GetItemCommand,
  TransactWriteItemsCommand,
  type DynamoDBClient,
  type TransactWriteItem
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
  TransactionConflictError,
  type RecordKey,
  type StoredRecord,
  type TransactionalRecordStore,
  type TransactionOp,
  type TransactionPlan,
  type TransactionConflictReason
} from './record-store'

/** Options for the DynamoDB store. */
export interface DynamoRecordStoreConfig {
  tableName: string
}

export class DynamoTransactionalRecordStore implements TransactionalRecordStore {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly config: DynamoRecordStoreConfig
  ) {}

  async transactWrite(plan: TransactionPlan): Promise<void> {
    if (plan.ops.length === 0) return
    const items = plan.ops.map((op) => this.toTransactItem(op))
    try {
      await this.client.send(
        new TransactWriteItemsCommand({ TransactItems: items })
      )
    } catch (error: unknown) {
      const reason = conflictReason(error)
      if (reason) {
        throw new TransactionConflictError(reason)
      }
      throw error
    }
  }

  async get(key: RecordKey): Promise<StoredRecord | null> {
    const response = await this.client.send(
      new GetItemCommand({
        TableName: this.config.tableName,
        Key: marshall({ pk: key.pk, sk: key.sk }),
        ConsistentRead: true
      })
    )
    if (!response.Item) return null
    return unmarshall(response.Item) as StoredRecord
  }

  private toTransactItem(op: TransactionOp): TransactWriteItem {
    const TableName = this.config.tableName
    switch (op.op) {
      case 'putIfAbsent':
        return {
          Put: {
            TableName,
            Item: marshall(op.item, { removeUndefinedValues: true }),
            // First writer wins: reject if any item already exists at this key.
            ConditionExpression: 'attribute_not_exists(pk)'
          }
        }
      case 'put':
        return {
          Put: {
            TableName,
            Item: marshall(op.item, { removeUndefinedValues: true })
          }
        }
      case 'updateIfRevision':
        return {
          Put: {
            TableName,
            Item: marshall(op.item, { removeUndefinedValues: true }),
            // Optimistic concurrency: the stored Revision must match.
            ConditionExpression: 'attribute_exists(pk) AND #rev = :expected',
            ExpressionAttributeNames: { '#rev': 'revision' },
            ExpressionAttributeValues: marshall({ ':expected': op.expectedRevision })
          }
        }
      case 'incrementCounter': {
        // Starting at 0 means the counter row may not exist yet.
        const condition =
          op.expectedCurrent === 0
            ? 'attribute_not_exists(#v) OR #v = :current'
            : '#v = :current'
        return {
          Update: {
            TableName,
            Key: marshall({ pk: op.key.pk, sk: op.key.sk }),
            UpdateExpression: 'SET #v = :next',
            ConditionExpression: condition,
            ExpressionAttributeNames: { '#v': 'value' },
            ExpressionAttributeValues: marshall({ ':next': op.next, ':current': op.expectedCurrent })
          }
        }
      }
      case 'check':
        return {
          ConditionCheck: {
            TableName,
            Key: marshall({ pk: op.key.pk, sk: op.key.sk }),
            ConditionExpression: op.mustExist
              ? 'attribute_exists(pk)'
              : 'attribute_not_exists(pk)'
          }
        }
    }
  }
}

/**
 * Best-effort classification of a DynamoDB transaction failure into a conflict
 * reason. A `TransactionCanceledException` lists per-item cancellation reasons;
 * any `ConditionalCheckFailed` means a condition we set was violated.
 */
function conflictReason(error: unknown): TransactionConflictReason | null {
  if (!error || typeof error !== 'object') return null
  const name = 'name' in error ? String((error as { name?: unknown }).name) : undefined
  if (name !== 'TransactionCanceledException') {
    return null
  }
  const reasons = (error as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons
  if (Array.isArray(reasons) && reasons.some((r) => r?.Code === 'ConditionalCheckFailed')) {
    // The plan knows which specific condition matters; the repository maps the
    // generic conflict to replay/retry/caller-conflict using its own state.
    return 'unknown'
  }
  // Some conflicts surface as a bare ConditionalCheckFailedException.
  return 'unknown'
}
