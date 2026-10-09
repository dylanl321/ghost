/**
 * OAuth Administration — in-memory repository fixture.
 *
 * A test/dev implementation of {@link OAuthAdminRepository} with the SAME
 * retention, bounding, deployment-scoping, and optimistic-concurrency semantics
 * as {@link DynamoOAuthAdminRepository}, backed by a Map. Injectable into
 * services and tests so the durable path never needs a live DynamoDB.
 *
 * It enforces the same invariants:
 *   - Deployment-scoped keys (`ENV#<deployment>#...`) so cross-deployment reads
 *     are impossible.
 *   - 90-day logical expiry filtering BEFORE returning activity/audit rows.
 *   - Bounded pages (default 50, cap 100) over a bounded 90-day window.
 *   - Conditional writes: require-absent and `If-Match` revision, raising the
 *     same typed 409 conflicts.
 */

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
  OAuthConditionalWrite
} from './types'
import {
  buildPageMetadata,
  filterRetained,
  isWithinRetention,
  logicalExpiryFor,
  resolveLimit,
  resolveOrder,
  resolveWindow,
  toPagedResult
} from './repository-support'

function scope(ctx: OAuthDeploymentContext): string {
  return `ENV#${ctx.deploymentId}`
}

function conflict(code: string, message: string): never {
  const error = new Error(message) as Error & { code: string, statusCode: number }
  error.name = code
  error.code = code
  error.statusCode = 409
  throw error
}

interface StoredRow {
  key: string
  value: Record<string, any>
  revision?: string
}

export class InMemoryOAuthAdminRepository implements OAuthAdminRepository {
  /** Flat store keyed by a fully-qualified logical key string. */
  private readonly rows = new Map<string, StoredRow>()

  /** Test helper: clear all stored rows. */
  clear(): void {
    this.rows.clear()
  }

  /** Test helper: total number of stored rows (all kinds/deployments). */
  size(): number {
    return this.rows.size
  }

  private write(key: string, value: Record<string, any>, write?: OAuthConditionalWrite): void {
    const existing = this.rows.get(key)
    if (write?.requireAbsent && existing) {
      conflict('OPERATION_IN_PROGRESS', 'A record already exists for this key.')
    }
    if (write?.expectedRevision !== undefined) {
      const currentRevision = existing?.value?.revision
      if (currentRevision !== write.expectedRevision) {
        conflict('REVISION_CONFLICT', 'The record was modified concurrently; reload and retry.')
      }
    }
    // Deep-clone so callers cannot mutate stored state by reference.
    this.rows.set(key, { key, value: structuredClone(value), revision: value.revision })
  }

  private read<T>(key: string): T | null {
    const row = this.rows.get(key)
    return row ? structuredClone(row.value) as T : null
  }

  private orderByTime<T extends { timestamp?: IsoDateTime, consentedAt?: IsoDateTime }>(
    items: T[],
    order: 'asc' | 'desc'
  ): T[] {
    return [...items].sort((a, b) => {
      const at = a.timestamp || a.consentedAt || ''
      const bt = b.timestamp || b.consentedAt || ''
      return order === 'asc' ? at.localeCompare(bt) : bt.localeCompare(at)
    })
  }

  private page<T>(
    ctx: OAuthDeploymentContext,
    ordered: T[],
    limit: number
  ): OAuthPagedResult<T> {
    const items = ordered.slice(0, limit)
    return toPagedResult(items, buildPageMetadata({
      ctx,
      limit,
      returned: items.length,
      hasMore: ordered.length > limit,
      nextCursor: null,
      coverage: 'complete',
      freshness: 'fresh'
    }))
  }

  // --- Health observations ------------------------------------------------

  async putObservation(ctx: OAuthDeploymentContext, observation: OAuthObservation): Promise<void> {
    this.write(`${scope(ctx)}#events#OBSERVATION#${observation.stage}`, observation)
  }

  async listObservations(ctx: OAuthDeploymentContext): Promise<OAuthObservation[]> {
    const prefix = `${scope(ctx)}#events#OBSERVATION#`
    const out: OAuthObservation[] = []
    for (const row of this.rows.values()) {
      if (row.key.startsWith(prefix)) out.push(structuredClone(row.value) as OAuthObservation)
    }
    return out
  }

  // --- Events / activity --------------------------------------------------

  async putEvent(ctx: OAuthDeploymentContext, event: OAuthEvent): Promise<void> {
    const stored = { ...event, ...logicalExpiryFor(event.timestamp) }
    this.write(`${scope(ctx)}#events#${event.timestamp}#${event.eventId}`, stored)
  }

  async queryEvents(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthEvent>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const { fromIso, toIso } = resolveWindow(query)
    const fromMs = new Date(fromIso).getTime()
    const toMs = new Date(toIso).getTime()
    const prefix = `${scope(ctx)}#events#`
    const candidates: OAuthEvent[] = []
    for (const row of this.rows.values()) {
      if (row.key.startsWith(prefix)) candidates.push(structuredClone(row.value) as OAuthEvent)
    }
    const filtered = candidates
      .filter((event) => {
        const ts = new Date(event.timestamp).getTime()
        return ts >= fromMs && ts <= toMs
      })
      .filter((event) => {
        if (query.clientId && event.clientReference !== query.clientId) return false
        if (query.subject && event.subjectReference !== query.subject) return false
        if (query.diagnosticReference && event.diagnosticReference !== query.diagnosticReference) return false
        if (query.stage && event.stage !== query.stage) return false
        if (query.outcome && event.outcome !== query.outcome) return false
        if (query.resource && event.resourceReference !== query.resource) return false
        return true
      })
    const retained = this.orderByTime(filterRetained(filtered), order)
    return this.page(ctx, retained, limit)
  }

  async getEvent(ctx: OAuthDeploymentContext, eventId: OpaqueReference): Promise<OAuthEvent | null> {
    const prefix = `${scope(ctx)}#events#`
    for (const row of this.rows.values()) {
      if (row.key.startsWith(prefix) && row.value.eventId === eventId) {
        const dto = structuredClone(row.value) as OAuthEvent
        return isWithinRetention(dto) ? dto : null
      }
    }
    return null
  }

  // --- Application inventory ----------------------------------------------

  async upsertApplication(
    ctx: OAuthDeploymentContext,
    application: OAuthApplicationDetail,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    this.write(`${scope(ctx)}#APPLICATIONS#CLIENT#${application.clientId}`, application, write)
  }

  async queryApplications(
    ctx: OAuthDeploymentContext,
    query: OAuthListQuery
  ): Promise<OAuthPagedResult<OAuthApplicationSummary>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const prefix = `${scope(ctx)}#APPLICATIONS#CLIENT#`
    const items: OAuthApplicationSummary[] = []
    for (const row of this.rows.values()) {
      if (row.key.startsWith(prefix)) items.push(structuredClone(row.value) as OAuthApplicationSummary)
    }
    items.sort((a, b) => order === 'asc'
      ? a.clientId.localeCompare(b.clientId)
      : b.clientId.localeCompare(a.clientId))
    return this.page(ctx, items, limit)
  }

  async getApplication(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<OAuthApplicationDetail | null> {
    return this.read<OAuthApplicationDetail>(`${scope(ctx)}#APPLICATIONS#CLIENT#${clientId}`)
  }

  async tombstoneApplication(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<void> {
    const existing = await this.getApplication(ctx, clientId)
    if (!existing) return
    await this.upsertApplication(ctx, {
      ...existing,
      lifecycle: 'retired',
      metadata: { ...existing.metadata, coverage: 'partial' },
      updatedAt: new Date().toISOString()
    })
  }

  // --- Grants -------------------------------------------------------------

  async upsertGrant(ctx: OAuthDeploymentContext, grant: OAuthGrantSummary): Promise<void> {
    this.write(`${scope(ctx)}#grants#${grant.grantReference}`, grant)
  }

  async queryGrants(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthGrantSummary>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const prefix = `${scope(ctx)}#grants#`
    const items: OAuthGrantSummary[] = []
    for (const row of this.rows.values()) {
      if (!row.key.startsWith(prefix)) continue
      const grant = structuredClone(row.value) as OAuthGrantSummary
      if (query.clientId && grant.clientReference !== query.clientId) continue
      items.push(grant)
    }
    return this.page(ctx, this.orderByTime(items, order), limit)
  }

  async getGrant(ctx: OAuthDeploymentContext, grantReference: OpaqueReference): Promise<OAuthGrantSummary | null> {
    return this.read<OAuthGrantSummary>(`${scope(ctx)}#grants#${grantReference}`)
  }

  // --- Issues -------------------------------------------------------------

  async upsertIssue(ctx: OAuthDeploymentContext, issue: OAuthIssue, write?: OAuthConditionalWrite): Promise<void> {
    this.write(`${scope(ctx)}#issues#${issue.groupId}`, issue, write)
  }

  async queryIssues(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthIssue>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const prefix = `${scope(ctx)}#issues#`
    const items: OAuthIssue[] = []
    for (const row of this.rows.values()) {
      if (row.key.startsWith(prefix)) items.push(structuredClone(row.value) as OAuthIssue)
    }
    const retained = filterRetained(items)
    retained.sort((a, b) => order === 'asc'
      ? a.lastObservedAt.localeCompare(b.lastObservedAt)
      : b.lastObservedAt.localeCompare(a.lastObservedAt))
    return this.page(ctx, retained, limit)
  }

  async getIssue(ctx: OAuthDeploymentContext, groupId: OpaqueReference): Promise<OAuthIssue | null> {
    return this.read<OAuthIssue>(`${scope(ctx)}#issues#${groupId}`)
  }

  // --- Quota observations -------------------------------------------------

  async getQuotaObservation(
    ctx: OAuthDeploymentContext,
    reference: OpaqueReference
  ): Promise<OAuthQuotaObservation | null> {
    return this.read<OAuthQuotaObservation>(`${scope(ctx)}#checkpoints#QUOTA#${reference}`)
  }

  // --- Operations ---------------------------------------------------------

  async reserveOperation(
    ctx: OAuthDeploymentContext,
    operation: OAuthAdminOperation,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    this.write(`${scope(ctx)}#operations#${operation.operationId}`, operation, write ?? { requireAbsent: true })
  }

  async updateOperation(
    ctx: OAuthDeploymentContext,
    operation: OAuthAdminOperation,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    this.write(`${scope(ctx)}#operations#${operation.operationId}`, operation, write)
  }

  async getOperation(ctx: OAuthDeploymentContext, operationId: OpaqueReference): Promise<OAuthAdminOperation | null> {
    return this.read<OAuthAdminOperation>(`${scope(ctx)}#operations#${operationId}`)
  }

  // --- Diagnostic jobs ----------------------------------------------------

  async putDiagnosticJob(
    ctx: OAuthDeploymentContext,
    job: OAuthDiagnosticJob,
    write?: OAuthConditionalWrite
  ): Promise<void> {
    this.write(`${scope(ctx)}#jobs#${job.jobId}`, job, write)
  }

  async getDiagnosticJob(ctx: OAuthDeploymentContext, jobId: OpaqueReference): Promise<OAuthDiagnosticJob | null> {
    return this.read<OAuthDiagnosticJob>(`${scope(ctx)}#jobs#${jobId}`)
  }

  async listPendingDiagnosticJobs(ctx: OAuthDeploymentContext, limit = 20): Promise<OAuthDiagnosticJob[]> {
    const prefix = `${scope(ctx)}#jobs#`
    const jobs: OAuthDiagnosticJob[] = []
    for (const row of this.rows.values()) {
      if (!row.key.startsWith(prefix)) continue
      const job = structuredClone(row.value) as OAuthDiagnosticJob
      if (job.state === 'pending' || job.state === 'running') jobs.push(job)
    }
    // Oldest observed first so the loop makes progress fairly across jobs.
    jobs.sort((a, b) => (a.observedAt || '').localeCompare(b.observedAt || ''))
    return jobs.slice(0, Math.max(0, limit))
  }

  // --- Audit --------------------------------------------------------------

  async putAuditRecord(ctx: OAuthDeploymentContext, record: OAuthAuditRecord): Promise<void> {
    const stored = record.logicalExpiresAt && record.ttl
      ? record
      : { ...record, ...logicalExpiryFor(record.timestamp) }
    this.write(`${scope(ctx)}#audit#${record.timestamp}#${record.auditId}`, stored)
  }

  async queryAuditRecords(
    ctx: OAuthDeploymentContext,
    query: OAuthListQuery
  ): Promise<OAuthPagedResult<OAuthAuditRecord>> {
    const limit = resolveLimit(query.limit)
    const order = resolveOrder(query.order)
    const { fromIso, toIso } = resolveWindow(query)
    const fromMs = new Date(fromIso).getTime()
    const toMs = new Date(toIso).getTime()
    const prefix = `${scope(ctx)}#audit#`
    const items: OAuthAuditRecord[] = []
    for (const row of this.rows.values()) {
      if (!row.key.startsWith(prefix)) continue
      const record = structuredClone(row.value) as OAuthAuditRecord
      const ts = new Date(record.timestamp).getTime()
      if (ts < fromMs || ts > toMs) continue
      items.push(record)
    }
    return this.page(ctx, this.orderByTime(filterRetained(items), order), limit)
  }

  // --- Alerts -------------------------------------------------------------

  async upsertAlert(ctx: OAuthDeploymentContext, alert: OAuthAlert, write?: OAuthConditionalWrite): Promise<void> {
    this.write(`${scope(ctx)}#alerts#${alert.groupKey}`, alert, write)
  }

  async getActiveAlert(ctx: OAuthDeploymentContext, groupKey: string): Promise<OAuthAlert | null> {
    const alert = this.read<OAuthAlert>(`${scope(ctx)}#alerts#${groupKey}`)
    if (!alert || alert.state !== 'active') return null
    return isWithinRetention(alert) ? alert : null
  }

  // --- Maintenance checkpoints --------------------------------------------

  async putCheckpoint(ctx: OAuthDeploymentContext, checkpoint: OAuthAdminCheckpoint): Promise<void> {
    this.write(`${scope(ctx)}#checkpoints#CHECKPOINT#${checkpoint.kind}`, checkpoint)
  }

  async getCheckpoint(ctx: OAuthDeploymentContext, kind: OAuthAdminRecordKind): Promise<OAuthAdminCheckpoint | null> {
    return this.read<OAuthAdminCheckpoint>(`${scope(ctx)}#checkpoints#CHECKPOINT#${kind}`)
  }
}
