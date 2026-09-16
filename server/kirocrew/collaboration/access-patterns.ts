/**
 * Shared Investigations — indexed access patterns (task 3.2).
 *
 * Owner: Ghostv2 CollaborationRepository.
 *
 * Every documented read is expressed here as a DynamoDB request descriptor
 * built from the scope-contained keys in `keys.ts`. The descriptors resolve to
 * `GetItem`, `Query`, or `BatchGetItem` operations only — there is deliberately
 * no `Scan` builder, which is how this layer enforces "no routine table scans"
 * (Requirements 7.11, 7.12). Direct record reads request strongly consistent
 * reads because the Change_Feed and strong direct reads are the authoritative
 * synchronization state (Requirement 7.11, 15.4 server-time presence reads).
 *
 * These are descriptors, not executions: tasks 3.3-3.5 own the transactional
 * writes and the code that sends these to DynamoDB. Isolating the descriptors
 * here keeps the access patterns provably scan-free and independently testable.
 */

import { marshall } from '@aws-sdk/util-dynamodb'
import {
  ARTIFACT_SK_PREFIX,
  artifactKey,
  CHANGE_FEED_SK_PREFIX,
  CHECKPOINT_SK_PREFIX,
  creationOperationKey,
  encodeComponent,
  EVENT_SK_PREFIX,
  GSI1_PK,
  GSI1_SK,
  INVESTIGATION_BROWSE_INDEX,
  investigationMetaKey,
  investigationPartition,
  padSequence,
  PRESENCE_SK_PREFIX,
  presencePartition,
  RUN_SK_PREFIX,
  spacePartition,
  subjectPointerPrefix,
  type InvestigationScope,
  type SpaceScope
} from './keys'
import type { SubjectReference } from './subject'

/** A `GetItem` request: exactly one keyed record, strongly consistent by default. */
export interface GetDescriptor {
  op: 'Get'
  tableName: string
  key: Record<string, unknown>
  consistentRead: boolean
}

/** A `Query` request against the base table or a GSI. */
export interface QueryDescriptor {
  op: 'Query'
  tableName: string
  indexName?: string
  keyConditionExpression: string
  expressionAttributeNames: Record<string, string>
  expressionAttributeValues: Record<string, unknown>
  /** Base-table Queries are strongly consistent; GSI Queries cannot be. */
  consistentRead: boolean
  scanIndexForward: boolean
  limit?: number
}

/** A `BatchGetItem` request across several keyed records. */
export interface BatchGetDescriptor {
  op: 'BatchGet'
  tableName: string
  keys: Array<Record<string, unknown>>
  consistentRead: boolean
}

export type ReadDescriptor = GetDescriptor | QueryDescriptor | BatchGetDescriptor

/** Change_Feed page defaults (Requirement 12.5-12.7 / 19.3). */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

function baseKeyQuery(
  tableName: string,
  pk: string,
  skPrefix: string,
  options: {
    consistentRead?: boolean
    scanIndexForward?: boolean
    limit?: number
  } = {}
): QueryDescriptor {
  return {
    op: 'Query',
    tableName,
    keyConditionExpression: '#pk = :pk AND begins_with(#sk, :skprefix)',
    expressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
    expressionAttributeValues: marshall({ ':pk': pk, ':skprefix': skPrefix }),
    consistentRead: options.consistentRead ?? true,
    scanIndexForward: options.scanIndexForward ?? true,
    limit: options.limit
  }
}

/**
 * Access-pattern descriptor builders. `tableName` is the dedicated
 * Cloud_Record_Store table provisioned in task 3.1.
 */
export class CollaborationAccessPatterns {
  constructor(private readonly tableName: string) {}

  // -- Direct strongly consistent record reads ------------------------------

  /** Read one Investigation's metadata (strong direct read). */
  getInvestigationMeta(scope: InvestigationScope): GetDescriptor {
    return {
      op: 'Get',
      tableName: this.tableName,
      key: marshall(investigationMetaKey(scope)),
      consistentRead: true
    }
  }

  /**
   * Resolve a creation result by Operation_ID before the Investigation ID is
   * known (Creation_Operation_Lookup, Requirement 10.16, 14.14). Strong read so
   * a just-committed creation is always visible to its own retry.
   */
  getCreationOperationLookup(scope: SpaceScope, operationId: string): GetDescriptor {
    return {
      op: 'Get',
      tableName: this.tableName,
      key: marshall(creationOperationKey(scope, operationId)),
      consistentRead: true
    }
  }

  /** Read one Artifact manifest (strong direct read). */
  getArtifact(scope: InvestigationScope, artifactId: string): GetDescriptor {
    return {
      op: 'Get',
      tableName: this.tableName,
      key: marshall(artifactKey(scope, artifactId)),
      consistentRead: true
    }
  }

  // -- Investigation-partition Queries (timeline, runs, checkpoints, artifacts)

  /**
   * Ordered Event timeline for one Investigation, in Server_Sequence order.
   * Client timestamps never define this order.
   */
  queryTimeline(
    scope: InvestigationScope,
    options: { scanIndexForward?: boolean; limit?: number } = {}
  ): QueryDescriptor {
    return baseKeyQuery(this.tableName, investigationPartition(scope), EVENT_SK_PREFIX, {
      scanIndexForward: options.scanIndexForward ?? true,
      limit: options.limit
    })
  }

  /**
   * Read the Event timeline strictly after a Server_Sequence, bounded by a
   * fixed High_Water_Mark. Supports incremental reads and Handoff windows
   * without scanning (Requirement 12.5-12.7, 15.1).
   */
  queryTimelineBetween(
    scope: InvestigationScope,
    exclusiveStartSequence: number,
    highWaterMark: number,
    options: { limit?: number } = {}
  ): QueryDescriptor {
    return {
      op: 'Query',
      tableName: this.tableName,
      keyConditionExpression: '#pk = :pk AND #sk BETWEEN :lo AND :hi',
      expressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      expressionAttributeValues: marshall({
        ':pk': investigationPartition(scope),
        // Exclusive lower bound: next lexical value after the padded sequence.
        ':lo': `${EVENT_SK_PREFIX}${padSequence(exclusiveStartSequence)}~`,
        ':hi': `${EVENT_SK_PREFIX}${padSequence(highWaterMark)}#\uffff`
      }),
      consistentRead: true,
      scanIndexForward: true,
      limit: options.limit
    }
  }

  /** All Runs in one Investigation. */
  queryRuns(scope: InvestigationScope): QueryDescriptor {
    return baseKeyQuery(this.tableName, investigationPartition(scope), RUN_SK_PREFIX)
  }

  /** All Checkpoint candidates in one Investigation. */
  queryCheckpoints(scope: InvestigationScope): QueryDescriptor {
    return baseKeyQuery(this.tableName, investigationPartition(scope), CHECKPOINT_SK_PREFIX)
  }

  /** All Artifact manifests in one Investigation. */
  queryArtifacts(scope: InvestigationScope): QueryDescriptor {
    return baseKeyQuery(this.tableName, investigationPartition(scope), ARTIFACT_SK_PREFIX)
  }

  // -- Space-partition Queries (Change_Feed) --------------------------------

  /**
   * Fixed-high-water Change_Feed page in Server_Sequence order. The caller
   * supplies the fixed High_Water_Mark and an exclusive start (the last applied
   * sequence). Default page size 50, capped at 200.
   */
  queryChangeFeed(
    scope: SpaceScope,
    exclusiveStartSequence: number,
    highWaterMark: number,
    pageSize: number = DEFAULT_PAGE_SIZE
  ): QueryDescriptor {
    const limit = Math.max(1, Math.min(pageSize, MAX_PAGE_SIZE))
    return {
      op: 'Query',
      tableName: this.tableName,
      keyConditionExpression: '#pk = :pk AND #sk BETWEEN :lo AND :hi',
      expressionAttributeNames: { '#pk': 'pk', '#sk': 'sk' },
      expressionAttributeValues: marshall({
        ':pk': spacePartition(scope),
        ':lo': `${CHANGE_FEED_SK_PREFIX}${padSequence(exclusiveStartSequence)}~`,
        ':hi': `${CHANGE_FEED_SK_PREFIX}${padSequence(highWaterMark)}`
      }),
      consistentRead: true,
      scanIndexForward: true,
      limit
    }
  }

  // -- Subject lookup (base-table Query over subject pointers) ----------------

  /**
   * All Investigations for one live subject. This is a Query over the subject
   * pointer rows in the space partition; the pointer SK embeds the *stable*
   * Subject_Reference (never the display label), so a label change still
   * resolves the same subject (Requirement 6.10, 7.12).
   */
  queryInvestigationsBySubject(scope: SpaceScope, subject: SubjectReference): QueryDescriptor {
    return baseKeyQuery(this.tableName, spacePartition(scope), subjectPointerPrefix(subject))
  }

  // -- Active / archived browsing (InvestigationBrowse GSI) ------------------

  /**
   * Browse a Team_Space's active or archived Investigations, ordered by
   * recency. This uses the `InvestigationBrowse` GSI (a Query, not a Scan);
   * GSI reads are eventually consistent by definition, which is acceptable for
   * browse lists (Requirement 7.12).
   */
  browseInvestigations(
    scope: SpaceScope,
    partition: 'active' | 'archived',
    options: { limit?: number } = {}
  ): QueryDescriptor {
    return {
      op: 'Query',
      tableName: this.tableName,
      indexName: INVESTIGATION_BROWSE_INDEX,
      keyConditionExpression: '#gpk = :gpk',
      expressionAttributeNames: { '#gpk': GSI1_PK },
      expressionAttributeValues: marshall({
        ':gpk': investigationBrowsePartition(scope, partition)
      }),
      // GSIs cannot be strongly consistent.
      consistentRead: false,
      // Most-recent first.
      scanIndexForward: false,
      limit: options.limit
    }
  }

  // -- Batch presence (Query per subject; no scan) ---------------------------

  /**
   * Current presence for one live subject: a Query over that subject's presence
   * partition, strongly consistent so freshly renewed leases and server-time
   * expiry are read correctly (Requirement 15.4, 15.5). Optional Investigation
   * / Run filtering is applied on the returned items, never in the key, so it
   * cannot change subject identity (Requirement 15.11).
   */
  queryPresenceForSubject(scope: SpaceScope, subject: SubjectReference): QueryDescriptor {
    return baseKeyQuery(this.tableName, presencePartition(scope, subject), PRESENCE_SK_PREFIX, {
      consistentRead: true
    })
  }

  /**
   * Batch presence across many subjects without a table scan: one strongly
   * consistent Query per subject partition. The repository fans these out and
   * merges the results; there is no cross-subject scan.
   */
  batchPresenceQueries(scope: SpaceScope, subjects: SubjectReference[]): QueryDescriptor[] {
    return subjects.map((subject) => this.queryPresenceForSubject(scope, subject))
  }
}

/**
 * The GSI1 partition value for active/archived browsing. Encodes Tenant and
 * Team_Space so browse Queries remain scope-contained (Requirement 7.2).
 */
export function investigationBrowsePartition(
  scope: SpaceScope,
  partition: 'active' | 'archived'
): string {
  return `BROWSE#${encodeComponent(scope.tenantId)}#${encodeComponent(scope.spaceId)}#${partition}`
}

/**
 * Derive the base + GSI attributes an Investigation metadata item must carry so
 * `InvestigationBrowse` orders it by recency within its active/archived
 * partition. Returned as a marshalled attribute map fragment for the writer
 * (tasks 3.3/3.5) to merge into the item.
 */
export function investigationBrowseAttributes(input: {
  scope: SpaceScope
  archived: boolean
  updatedAt: string
  investigationId: string
}): Record<string, unknown> {
  const partition = input.archived ? 'archived' : 'active'
  return marshall({
    [GSI1_PK]: investigationBrowsePartition(input.scope, partition),
    // `updatedAt#investigationId` keeps the sort key unique and recency-ordered.
    [GSI1_SK]: `${input.updatedAt}#${encodeComponent(input.investigationId)}`
  })
}
