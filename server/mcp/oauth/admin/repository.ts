/**
 * OAuth Administration — DynamoDB-backed repository.
 *
 * Implements {@link OAuthAdminRepository} against the isolated
 * `ghost-oauth-administration-<env>` table (terraform/oauth-administration.tf).
 *
 * SAFETY / invariants (design "Components and Interfaces" + Requirements
 * 16.1/16.3):
 *   - Bounded, indexed queries ONLY. This module never issues a `Scan`, and it
 *     never touches the provider artifact table (`GHOST_OAUTH_TABLE_NAME`).
 *   - Every method binds to the server-derived {@link OAuthDeploymentContext};
 *     partition keys are scoped `ENV#<deployment>#...` so a caller cannot cross
 *     deployment boundaries.
 *   - 90-day logical expiry is applied to activity/audit rows BEFORE they are
 *     returned; DynamoDB TTL performs only asynchronous physical cleanup.
 *   - Conditional writes provide optimistic concurrency (`If-Match`
 *     revision / require-absent) via {@link OAuthConditionalWrite}.
 *
 * Row shape: each persisted item is the DTO spread alongside the derived base
 * key attributes (PK/SK) and any sparse GSI attributes. Reads reconstruct the
 * DTO by stripping the storage-only key attributes.
 */

import { PutItemCommand, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type {
  IsoDateTime,
  OAuthAdminOperation,
  OAuthAlert,
  OAuthApplicationDetail,
  OAuthApplicationSummary,
  OAuthAuditRecord,
  OAuthDeploymentContext,
  OAuthDiagnosticJob,
  OAuthEvent,
  OAuthGrantSummary,
  OAuthIssue,
  OAuthListQuery,
  OAuthObservation,
  OAuthPagedResult,
  OAuthQuotaObservation,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type {
  OAuthAdminCheckpoint,
  OAuthAdminRecordKind,
  OAuthAdminRepository,
  OAuthAdminTableConfig,
  OAuthConditionalWrite
} from './types'
import { getDynamoDBClient } from '../../../lib/aws-client-factory'
import { queryItems } from '../../../utils/dynamodb'
import {
  ATTR,
  OAUTH_ADMIN_INDEXES,
  applicationKey,
  clientTimePartition,
  dayPartitionsInRange,
  dayStreamKey,
  dayStreamPartition,
  referencePartition,
  singletonKey,
  singletonPartition,
  subjectTimePartition,
  timeSortKey
} from './record-layout'
import {
  buildPageMetadata,
  filterRetained,
  logicalExpiryFor,
  resolveLimit,
  resolveOrder,
  resolveWindow,
  toPagedResult
} from './repository-support'

/** Storage-only attributes stripped from a DTO on read. */
const KEY_ATTRS = new Set<string>([
  ATTR.pk, ATTR.sk, ATTR.gsi1pk, ATTR.gsi1sk, ATTR.gsi2pk, ATTR.gsi2sk, ATTR.gsi3pk, ATTR.gsi3sk
])

function raiseConflict(code: string, message: string): never {
  const error = new Error(message) as Error & { code: string, statusCode: number }
  error.name = code
  error.code = code
  error.statusCode = 409
  throw error
}

export class DynamoOAuthAdminRepository implements OAuthAdminRepository {
  constructor(private readonly config: OAuthAdminTableConfig) {}

  // --- low-level helpers --------------------------------------------------

  private async client() {
    return getDynamoDBClient(this.config.environment, undefined, this.config.accountId)
  }

  /** Strip storage-only key attributes, returning the pure DTO. */
  private toDto<T>(item: Record<string, any>): T {
    const dto: Record<string, any> = {}
    for (const [key, value] of Object.entries(item)) {
      if (!KEY_ATTRS.has(key)) dto[key] = value
    }
    return dto as T
  }

  /**
   * Conditional/unconditional put of a single item (DTO + derived keys).
   * Translates a DynamoDB conditional-check failure into a typed 409 conflict.
   */
  private async put(
    item: Record<string, any>,
    keyFieldForAbsent: string,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    const client = await this.client()
    let conditionExpression: string | undefined
    const names: Record<string, string> = {}
    const values: Record<string, any> = {}

    if (write?.requireAbsent) {
      conditionExpression = `attribute_not_exists(${keyFieldForAbsent})`
    } else if (write?.expectedRevision !== undefined) {
      conditionExpression = '#rev = :expectedRevision'
      names['#rev'] = 'revision'
      values[':expectedRevision'] = write.expectedRevision
    }

    try {
      await client.send(new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall(item, { removeUndefinedValues: true, convertEmptyValues: true }),
        ConditionExpression: conditionExpression,
        ExpressionAttributeNames: Object.keys(names).length ? names : undefined,
        ExpressionAttributeValues: Object.keys(values).length
          ? marshall(values, { removeUndefinedValues: true })
          : undefined
      }))
    } catch (error: any) {
      if (error?.name === 'ConditionalCheckFailedException') {
        if (write?.requireAbsent) raiseConflict('OPERATION_IN_PROGRESS', 'A record already exists for this key.')
        raiseConflict('REVISION_CONFLICT', 'The record was modified concurrently; reload and retry.')
      }
      throw error
    }
  }

  private async getByKey<T>(key: Record<string, any>): Promise<T | null> {
    const client = await this.client()
    const response = await client.send(new GetItemCommand({
      TableName: this.config.tableName,
      Key: marshall(key, { removeUndefinedValues: true })
    }))
    if (!response.Item) return null
    return this.toDto<T>(unmarshall(response.Item, { wrapNumbers: false }))
  }

  /**
   * Query one day-partitioned stream partition, ordered by time. Bounded by
   * `limit`; never scans.
   */
  private async queryDayPartition(partition: string, order: 'asc' | 'desc', limit: number) {
    const result = await queryItems({
      tableName: this.config.tableName,
      queryExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': ATTR.pk },
      expressionAttributeValues: { ':pk': partition },
      scanIndexForward: order === 'asc',
      limit
    }, this.config.environment, this.config.accountId)
    return result.items
  }

  /**
   * Query a set of day partitions across the bounded window, merge, retain, and
   * bound to `limit`. Time-stream reads (events/audit) fan out across at most
   * 90 day partitions (the enforced max range) and never scan.
   */
  private async queryTimeStream<T extends { timestamp?: IsoDateTime, logicalExpiresAt?: IsoDateTime }>(
    ctx: OAuthDeploymentContext,
    kind: OAuthAdminRecordKind,
    query: OAuthListQuery
  ): Promise<{ items: T[], hasMore: boolean, limit: number }> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const { fromIso, toIso } = resolveWindow(query)
    const days = dayPartitionsInRange(fromIso, toIso)
    // Query newest-first day partitions first for desc order so we can stop early.
    const orderedDays = order === 'desc' ? [...days].reverse() : days

    const collected: T[] = []
    for (const day of orderedDays) {
      const partition = dayStreamPartition(ctx, kind, day)
      // Fetch up to limit+1 per partition to detect "hasMore" without a full scan.
      const rows = await this.queryDayPartition(partition, order, limit + 1)
      for (const row of rows) {
        const dto = this.toDto<T>(row)
        collected.push(dto)
      }
      if (collected.length > limit + 1) break
    }

    // Apply the exact window bound (day partitions are coarse), retention, and
    // ordering, then bound to the page limit.
    const fromMs = new Date(fromIso).getTime()
    const toMs = new Date(toIso).getTime()
    const windowed = collected.filter((row) => {
      const ts = row.timestamp ? new Date(row.timestamp).getTime() : NaN
      return !Number.isFinite(ts) || (ts >= fromMs && ts <= toMs)
    })
    const retained = filterRetained(windowed)
    retained.sort((a, b) => {
      const at = a.timestamp || ''
      const bt = b.timestamp || ''
      return order === 'asc' ? at.localeCompare(bt) : bt.localeCompare(at)
    })
    const hasMore = retained.length > limit
    return { items: retained.slice(0, limit), hasMore, limit }
  }

  /** Query a sparse GSI partition, retain, and bound. */
  private async querySparseIndex<T extends { timestamp?: IsoDateTime, logicalExpiresAt?: IsoDateTime }>(
    indexName: string,
    pkAttr: string,
    partition: string,
    query: OAuthListQuery
  ): Promise<{ items: T[], hasMore: boolean, limit: number }> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const result = await queryItems({
      tableName: this.config.tableName,
      indexName,
      queryExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': pkAttr },
      expressionAttributeValues: { ':pk': partition },
      scanIndexForward: order === 'asc',
      limit: limit + 1
    }, this.config.environment, this.config.accountId)
    const retained = filterRetained(result.items.map(row => this.toDto<T>(row)))
    const hasMore = retained.length > limit
    return { items: retained.slice(0, limit), hasMore, limit }
  }

  private paged<T>(
    ctx: OAuthDeploymentContext,
    items: T[],
    hasMore: boolean,
    limit: number
  ): OAuthPagedResult<T> {
    return toPagedResult(items, buildPageMetadata({
      ctx,
      limit,
      returned: items.length,
      hasMore,
      // Cursor issuance is added in task 5.2; the repository returns no cursor.
      nextCursor: null,
      coverage: 'complete',
      freshness: 'fresh'
    }))
  }

  // --- Health observations ------------------------------------------------

  async putObservation(ctx: OAuthDeploymentContext, observation: OAuthObservation): Promise<void> {
    // Observations are a small per-stage set; keyed by stage within a singleton
    // partition so the latest write per stage is authoritative.
    const key = singletonKey(ctx, 'events', `OBSERVATION#${observation.stage}`)
    await this.put({ ...observation, ...key }, ATTR.pk)
  }

  async listObservations(ctx: OAuthDeploymentContext): Promise<OAuthObservation[]> {
    const result = await queryItems({
      tableName: this.config.tableName,
      queryExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      expressionAttributeNames: { '#pk': ATTR.pk, '#sk': ATTR.sk },
      expressionAttributeValues: { ':pk': singletonPartition(ctx, 'events'), ':sk': 'OBSERVATION#' },
      limit: 50
    }, this.config.environment, this.config.accountId)
    return result.items.map(item => this.toDto<OAuthObservation>(item))
  }

  // --- Events / activity --------------------------------------------------

  async putEvent(ctx: OAuthDeploymentContext, event: OAuthEvent): Promise<void> {
    const expiry = logicalExpiryFor(event.timestamp)
    const item: Record<string, any> = {
      ...event,
      ...expiry,
      ...dayStreamKey(ctx, 'events', event.timestamp, event.eventId)
    }
    // Sparse GSI links, only populated when the supported reference exists.
    if (event.clientReference) {
      item[ATTR.gsi1pk] = clientTimePartition(ctx, event.clientReference, 'events')
      item[ATTR.gsi1sk] = timeSortKey(event.timestamp, event.eventId)
    } else if (event.subjectReference) {
      item[ATTR.gsi1pk] = subjectTimePartition(ctx, event.subjectReference, 'events')
      item[ATTR.gsi1sk] = timeSortKey(event.timestamp, event.eventId)
    }
    const correlation = event.correlationReference || event.referenceId
    if (correlation) {
      item[ATTR.gsi2pk] = referencePartition(ctx, 'correlation', correlation)
      item[ATTR.gsi2sk] = timeSortKey(event.timestamp, event.eventId)
    } else if (event.diagnosticReference) {
      item[ATTR.gsi2pk] = referencePartition(ctx, 'diagnostic', event.diagnosticReference)
      item[ATTR.gsi2sk] = timeSortKey(event.timestamp, event.eventId)
    }
    await this.put(item, ATTR.pk)
  }

  async queryEvents(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthEvent>> {
    // Prefer the sparse client/subject index when the caller filters by one.
    if (query.clientId) {
      const { items, hasMore, limit } = await this.querySparseIndex<OAuthEvent>(
        OAUTH_ADMIN_INDEXES.clientSubjectTime, ATTR.gsi1pk,
        clientTimePartition(ctx, query.clientId, 'events'), query)
      return this.paged(ctx, this.applyEventFilters(items, query), hasMore, limit)
    }
    if (query.subject) {
      const { items, hasMore, limit } = await this.querySparseIndex<OAuthEvent>(
        OAUTH_ADMIN_INDEXES.clientSubjectTime, ATTR.gsi1pk,
        subjectTimePartition(ctx, query.subject, 'events'), query)
      return this.paged(ctx, this.applyEventFilters(items, query), hasMore, limit)
    }
    if (query.diagnosticReference) {
      const { items, hasMore, limit } = await this.querySparseIndex<OAuthEvent>(
        OAUTH_ADMIN_INDEXES.reference, ATTR.gsi2pk,
        referencePartition(ctx, 'diagnostic', query.diagnosticReference), query)
      return this.paged(ctx, this.applyEventFilters(items, query), hasMore, limit)
    }
    const { items, hasMore, limit } = await this.queryTimeStream<OAuthEvent>(ctx, 'events', query)
    return this.paged(ctx, this.applyEventFilters(items, query), hasMore, limit)
  }

  /** Apply documented in-memory filters (stage/outcome/resource) to a bounded page. */
  private applyEventFilters(items: OAuthEvent[], query: OAuthListQuery): OAuthEvent[] {
    return items.filter((event) => {
      if (query.stage && event.stage !== query.stage) return false
      if (query.outcome && event.outcome !== query.outcome) return false
      if (query.resource && event.resourceReference !== query.resource) return false
      return true
    })
  }

  async getEvent(ctx: OAuthDeploymentContext, eventId: OpaqueReference): Promise<OAuthEvent | null> {
    // Events are day-partitioned; a direct get needs the timestamp. We query the
    // correlation index by the event id as a fallback single-item lookup.
    const result = await queryItems({
      tableName: this.config.tableName,
      indexName: OAUTH_ADMIN_INDEXES.reference,
      queryExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': ATTR.gsi2pk },
      expressionAttributeValues: { ':pk': referencePartition(ctx, 'event', eventId) },
      limit: 1
    }, this.config.environment, this.config.accountId)
    const row = result.items[0]
    if (!row) return null
    const dto = this.toDto<OAuthEvent>(row)
    return filterRetained([dto])[0] || null
  }

  // --- Application inventory ----------------------------------------------

  async upsertApplication(
    ctx: OAuthDeploymentContext,
    application: OAuthApplicationDetail,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    // Active inventory carries NO logical expiry: it follows provider state.
    const item: Record<string, any> = { ...application, ...applicationKey(ctx, application.clientId) }
    await this.put(item, ATTR.sk, write)
  }

  async queryApplications(
    ctx: OAuthDeploymentContext,
    query: OAuthListQuery
  ): Promise<OAuthPagedResult<OAuthApplicationSummary>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const result = await queryItems({
      tableName: this.config.tableName,
      queryExpression: '#pk = :pk AND begins_with(#sk, :sk)',
      expressionAttributeNames: { '#pk': ATTR.pk, '#sk': ATTR.sk },
      expressionAttributeValues: { ':pk': `ENV#${ctx.deploymentId}#APPLICATIONS`, ':sk': 'CLIENT#' },
      scanIndexForward: order === 'asc',
      limit: limit + 1
    }, this.config.environment, this.config.accountId)
    // Inventory has no logical expiry, so no retention filter is applied.
    const items = result.items.map(row => this.toDto<OAuthApplicationSummary>(row))
    const hasMore = items.length > limit
    return this.paged(ctx, items.slice(0, limit), hasMore, limit)
  }

  async getApplication(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<OAuthApplicationDetail | null> {
    return this.getByKey<OAuthApplicationDetail>(applicationKey(ctx, clientId))
  }

  async tombstoneApplication(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<void> {
    const existing = await this.getApplication(ctx, clientId)
    if (!existing) return
    // Mark the projection tombstoned (retired) so divergence is visible; the
    // provider remains authoritative.
    const tombstoned: OAuthApplicationDetail = {
      ...existing,
      lifecycle: 'retired',
      metadata: { ...existing.metadata, coverage: 'partial' },
      updatedAt: new Date().toISOString()
    }
    await this.upsertApplication(ctx, tombstoned)
  }

  // --- Grants -------------------------------------------------------------

  async upsertGrant(ctx: OAuthDeploymentContext, grant: OAuthGrantSummary): Promise<void> {
    // Live grants follow provider state; no logical expiry.
    const item: Record<string, any> = {
      ...grant,
      ...singletonKey(ctx, 'grants', grant.grantReference)
    }
    item[ATTR.gsi1pk] = clientTimePartition(ctx, grant.clientReference, 'grants')
    item[ATTR.gsi1sk] = timeSortKey(grant.consentedAt || new Date().toISOString(), grant.grantReference)
    await this.put(item, ATTR.sk)
  }

  async queryGrants(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthGrantSummary>> {
    if (query.clientId) {
      const limit = resolveLimit(query.limit)
      const order = resolveOrder(query.order)
      const result = await queryItems({
        tableName: this.config.tableName,
        indexName: OAUTH_ADMIN_INDEXES.clientSubjectTime,
        queryExpression: '#pk = :pk',
        expressionAttributeNames: { '#pk': ATTR.gsi1pk },
        expressionAttributeValues: { ':pk': clientTimePartition(ctx, query.clientId, 'grants') },
        scanIndexForward: order === 'asc',
        limit: limit + 1
      }, this.config.environment, this.config.accountId)
      const items = result.items.map(row => this.toDto<OAuthGrantSummary>(row))
      const hasMore = items.length > limit
      return this.paged(ctx, items.slice(0, limit), hasMore, limit)
    }
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const result = await queryItems({
      tableName: this.config.tableName,
      queryExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': ATTR.pk },
      expressionAttributeValues: { ':pk': singletonPartition(ctx, 'grants') },
      scanIndexForward: order === 'asc',
      limit: limit + 1
    }, this.config.environment, this.config.accountId)
    const items = result.items.map(row => this.toDto<OAuthGrantSummary>(row))
    const hasMore = items.length > limit
    return this.paged(ctx, items.slice(0, limit), hasMore, limit)
  }

  async getGrant(ctx: OAuthDeploymentContext, grantReference: OpaqueReference): Promise<OAuthGrantSummary | null> {
    return this.getByKey<OAuthGrantSummary>(singletonKey(ctx, 'grants', grantReference))
  }

  // --- Issues -------------------------------------------------------------

  async upsertIssue(ctx: OAuthDeploymentContext, issue: OAuthIssue, write?: OAuthConditionalWrite): Promise<void> {
    const item: Record<string, any> = { ...issue, ...singletonKey(ctx, 'issues', issue.groupId) }
    await this.put(item, ATTR.sk, write)
  }

  async queryIssues(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthIssue>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const result = await queryItems({
      tableName: this.config.tableName,
      queryExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': ATTR.pk },
      expressionAttributeValues: { ':pk': singletonPartition(ctx, 'issues') },
      scanIndexForward: order === 'asc',
      limit: limit + 1
    }, this.config.environment, this.config.accountId)
    // Issues expire 90 days after resolution; retention is applied defensively.
    const items = filterRetained(result.items.map(row => this.toDto<OAuthIssue>(row)))
    const hasMore = items.length > limit
    return this.paged(ctx, items.slice(0, limit), hasMore, limit)
  }

  async getIssue(ctx: OAuthDeploymentContext, groupId: OpaqueReference): Promise<OAuthIssue | null> {
    return this.getByKey<OAuthIssue>(singletonKey(ctx, 'issues', groupId))
  }

  // --- Quota observations (read-only) -------------------------------------

  async getQuotaObservation(
    ctx: OAuthDeploymentContext,
    reference: OpaqueReference
  ): Promise<OAuthQuotaObservation | null> {
    return this.getByKey<OAuthQuotaObservation>(singletonKey(ctx, 'checkpoints', `QUOTA#${reference}`))
  }

  // --- Operations ---------------------------------------------------------

  async reserveOperation(
    ctx: OAuthDeploymentContext,
    operation: OAuthAdminOperation,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    const item: Record<string, any> = { ...operation, ...singletonKey(ctx, 'operations', operation.operationId) }
    // Reservation defaults to require-absent so a duplicate reservation is a conflict.
    await this.put(item, ATTR.sk, write ?? { requireAbsent: true })
  }

  async updateOperation(
    ctx: OAuthDeploymentContext,
    operation: OAuthAdminOperation,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    const item: Record<string, any> = { ...operation, ...singletonKey(ctx, 'operations', operation.operationId) }
    await this.put(item, ATTR.sk, write)
  }

  async getOperation(ctx: OAuthDeploymentContext, operationId: OpaqueReference): Promise<OAuthAdminOperation | null> {
    return this.getByKey<OAuthAdminOperation>(singletonKey(ctx, 'operations', operationId))
  }

  // --- Diagnostic jobs ----------------------------------------------------

  async putDiagnosticJob(
    ctx: OAuthDeploymentContext,
    job: OAuthDiagnosticJob,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    const item: Record<string, any> = { ...job, ...singletonKey(ctx, 'jobs', job.jobId) }
    await this.put(item, ATTR.sk, write)
  }

  async getDiagnosticJob(ctx: OAuthDeploymentContext, jobId: OpaqueReference): Promise<OAuthDiagnosticJob | null> {
    return this.getByKey<OAuthDiagnosticJob>(singletonKey(ctx, 'jobs', jobId))
  }

  async listPendingDiagnosticJobs(ctx: OAuthDeploymentContext, limit = 20): Promise<OAuthDiagnosticJob[]> {
    // Jobs live in a single per-deployment partition. Query it and filter to
    // non-terminal states for the maintenance loop; the bounded concurrency cap
    // in the diagnostic service keeps the effective run count small.
    const result = await queryItems({
      tableName: this.config.tableName,
      queryExpression: '#pk = :pk',
      expressionAttributeNames: { '#pk': ATTR.pk },
      expressionAttributeValues: { ':pk': singletonPartition(ctx, 'jobs') },
      scanIndexForward: true,
      limit: Math.max(1, limit) * 4
    }, this.config.environment, this.config.accountId)
    const jobs = result.items
      .map(row => this.toDto<OAuthDiagnosticJob>(row))
      .filter(job => job.state === 'pending' || job.state === 'running')
    jobs.sort((a, b) => (a.observedAt || '').localeCompare(b.observedAt || ''))
    return jobs.slice(0, Math.max(0, limit))
  }

  // --- Audit --------------------------------------------------------------

  async putAuditRecord(ctx: OAuthDeploymentContext, record: OAuthAuditRecord): Promise<void> {
    // Audit records already carry LogicalExpiry; use their timestamp for the
    // day partition and preserve their supplied expiry fields.
    const item: Record<string, any> = {
      ...record,
      ...dayStreamKey(ctx, 'audit', record.timestamp, record.auditId)
    }
    if (!record.logicalExpiresAt || !record.ttl) {
      Object.assign(item, logicalExpiryFor(record.timestamp))
    }
    await this.put(item, ATTR.pk)
  }

  async queryAuditRecords(
    ctx: OAuthDeploymentContext,
    query: OAuthListQuery
  ): Promise<OAuthPagedResult<OAuthAuditRecord>> {
    const { items, hasMore, limit } = await this.queryTimeStream<OAuthAuditRecord>(ctx, 'audit', query)
    return this.paged(ctx, items, hasMore, limit)
  }

  // --- Alerts -------------------------------------------------------------

  async upsertAlert(ctx: OAuthDeploymentContext, alert: OAuthAlert, write?: OAuthConditionalWrite): Promise<void> {
    // Keyed by groupKey so there is at most one active alert row per dedup group.
    const item: Record<string, any> = { ...alert, ...singletonKey(ctx, 'alerts', alert.groupKey) }
    await this.put(item, ATTR.sk, write)
  }

  async getActiveAlert(ctx: OAuthDeploymentContext, groupKey: string): Promise<OAuthAlert | null> {
    const alert = await this.getByKey<OAuthAlert>(singletonKey(ctx, 'alerts', groupKey))
    if (!alert) return null
    // Recovered alerts and logically expired history are not "active".
    if (alert.state !== 'active') return null
    return filterRetained([alert])[0] || null
  }

  // --- Maintenance checkpoints --------------------------------------------

  async putCheckpoint(ctx: OAuthDeploymentContext, checkpoint: OAuthAdminCheckpoint): Promise<void> {
    const item: Record<string, any> = { ...checkpoint, ...singletonKey(ctx, 'checkpoints', `CHECKPOINT#${checkpoint.kind}`) }
    await this.put(item, ATTR.sk)
  }

  async getCheckpoint(ctx: OAuthDeploymentContext, kind: OAuthAdminRecordKind): Promise<OAuthAdminCheckpoint | null> {
    return this.getByKey<OAuthAdminCheckpoint>(singletonKey(ctx, 'checkpoints', `CHECKPOINT#${kind}`))
  }
}
