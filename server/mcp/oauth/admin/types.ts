/**
 * OAuth Administration — server-side repository interfaces and admin types.
 *
 * This module defines the contracts the deployment-local OAuth administration
 * surface depends on (repository, deployment-context resolver, redactor). It
 * contains type/interface definitions only — no runtime logic. Concrete
 * implementations (DynamoDB repository, in-memory fixture, redactor) are added
 * by later tasks (1.3+).
 *
 * SAFETY: These contracts operate exclusively on the allowlisted DTOs declared
 * in `shared/types/oauth-administration.ts`. They MUST NOT accept or return
 * provider adapter payloads (opaque `oidc-provider` model rows) or any secret
 * material. Deployment binding is server-derived and never accepted from the
 * caller. Activity/audit records carry a 90-day logical expiry that the
 * repository filters before returning results.
 */

import type {
  IsoDateTime,
  OAuthAdminOperation,
  OAuthAlert,
  OAuthApplicationDetail,
  OAuthApplicationSummary,
  OAuthAuditRecord,
  OAuthCapability,
  OAuthCoverageState,
  OAuthCursorClaims,
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

// Re-export the capability constants so server modules can import from one place.
export { OAUTH_CAPABILITIES } from '#shared/types/oauth-administration'
export type { OAuthCapability } from '#shared/types/oauth-administration'

/**
 * The projection "kinds" partitioned within the deployment-specific OAuth
 * administration table. Kept separate from `GHOST_OAUTH_TABLE_NAME` provider
 * artifacts. Used to derive partition keys; not a provider adapter model.
 */
export type OAuthAdminRecordKind =
  | 'applications'
  | 'events'
  | 'grants'
  | 'issues'
  | 'operations'
  | 'jobs'
  | 'audit'
  | 'alerts'
  | 'checkpoints'

/**
 * Server-only runtime configuration for the OAuth administration table.
 * Isolated from the provider artifact table configuration.
 */
export interface OAuthAdminTableConfig {
  tableName: string
  environment: 'commercial' | 'govcloud'
  accountId?: string
}

/**
 * Resolves the server-derived deployment context from runtime configuration
 * only. A caller can never supply the deployment, table, endpoint, account, or
 * AWS partition.
 */
export interface OAuthAdminDeploymentContextResolver {
  resolve(): OAuthDeploymentContext
  /** Server-only table configuration for the current deployment. */
  getTableConfig(): OAuthAdminTableConfig
}

/**
 * A durable maintenance checkpoint for bounded, resumable projection backfill.
 */
export interface OAuthAdminCheckpoint {
  checkpointId: OpaqueReference
  kind: OAuthAdminRecordKind
  /** Resumable position (opaque continuation key). */
  position?: string
  /** High-water mark for coverage reporting. */
  highWaterMark?: IsoDateTime
  /**
   * Coverage the backfill has achieved so far. `rebuilding` while a scan is in
   * progress; `complete` once the provider table has been fully traversed;
   * `partial` when a bounded run stopped before completion; `unavailable` when
   * the provider artifacts could not be read (Requirement 5.4 / 16.5).
   */
  coverage?: OAuthCoverageState
  /** Count of provider records observed in this backfill lifetime (safe metric). */
  processed?: number
  updatedAt: IsoDateTime
}

/**
 * Optimistic-concurrency parameters for conditional writes.
 */
export interface OAuthConditionalWrite {
  /** Revision expected to already be persisted (`If-Match` semantics). */
  expectedRevision?: string
  /** True to require the record not yet exist. */
  requireAbsent?: boolean
}

/**
 * Repository contract for the OAuth administration projections and durable
 * records. Implementations perform bounded, indexed queries only and never
 * scan the provider artifact table from a request path. Logical expiry is
 * applied before returning activity/audit rows.
 *
 * All methods bind to the server-derived {@link OAuthDeploymentContext}; the
 * caller cannot cross deployment boundaries.
 */
export interface OAuthAdminRepository {
  // --- Health observations ------------------------------------------------
  putObservation(ctx: OAuthDeploymentContext, observation: OAuthObservation): Promise<void>
  listObservations(ctx: OAuthDeploymentContext): Promise<OAuthObservation[]>

  // --- Events / activity --------------------------------------------------
  putEvent(ctx: OAuthDeploymentContext, event: OAuthEvent): Promise<void>
  queryEvents(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthEvent>>
  getEvent(ctx: OAuthDeploymentContext, eventId: OpaqueReference): Promise<OAuthEvent | null>

  // --- Application inventory (provider-authoritative projection) ----------
  upsertApplication(ctx: OAuthDeploymentContext, application: OAuthApplicationDetail, write?: OAuthConditionalWrite): Promise<void>
  queryApplications(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthApplicationSummary>>
  getApplication(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<OAuthApplicationDetail | null>
  /** Mark a projection tombstoned when it diverges from authoritative state. */
  tombstoneApplication(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<void>

  // --- Grants -------------------------------------------------------------
  upsertGrant(ctx: OAuthDeploymentContext, grant: OAuthGrantSummary): Promise<void>
  queryGrants(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthGrantSummary>>
  getGrant(ctx: OAuthDeploymentContext, grantReference: OpaqueReference): Promise<OAuthGrantSummary | null>

  // --- Issues -------------------------------------------------------------
  upsertIssue(ctx: OAuthDeploymentContext, issue: OAuthIssue, write?: OAuthConditionalWrite): Promise<void>
  queryIssues(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthIssue>>
  getIssue(ctx: OAuthDeploymentContext, groupId: OpaqueReference): Promise<OAuthIssue | null>

  // --- Quota observations (read-only) -------------------------------------
  getQuotaObservation(ctx: OAuthDeploymentContext, reference: OpaqueReference): Promise<OAuthQuotaObservation | null>

  // --- Operations ---------------------------------------------------------
  reserveOperation(ctx: OAuthDeploymentContext, operation: OAuthAdminOperation, write?: OAuthConditionalWrite): Promise<void>
  updateOperation(ctx: OAuthDeploymentContext, operation: OAuthAdminOperation, write?: OAuthConditionalWrite): Promise<void>
  getOperation(ctx: OAuthDeploymentContext, operationId: OpaqueReference): Promise<OAuthAdminOperation | null>

  // --- Diagnostic jobs ----------------------------------------------------
  putDiagnosticJob(ctx: OAuthDeploymentContext, job: OAuthDiagnosticJob, write?: OAuthConditionalWrite): Promise<void>
  getDiagnosticJob(ctx: OAuthDeploymentContext, jobId: OpaqueReference): Promise<OAuthDiagnosticJob | null>
  /**
   * List diagnostic jobs still awaiting work (`pending` or `running`) for the
   * maintenance loop. Bounded by `limit`; the loop drives each returned job's
   * `runJob`. Terminal jobs are never returned.
   */
  listPendingDiagnosticJobs(ctx: OAuthDeploymentContext, limit?: number): Promise<OAuthDiagnosticJob[]>

  // --- Audit --------------------------------------------------------------
  putAuditRecord(ctx: OAuthDeploymentContext, record: OAuthAuditRecord): Promise<void>
  queryAuditRecords(ctx: OAuthDeploymentContext, query: OAuthListQuery): Promise<OAuthPagedResult<OAuthAuditRecord>>

  // --- Alerts -------------------------------------------------------------
  upsertAlert(ctx: OAuthDeploymentContext, alert: OAuthAlert, write?: OAuthConditionalWrite): Promise<void>
  getActiveAlert(ctx: OAuthDeploymentContext, groupKey: string): Promise<OAuthAlert | null>

  // --- Maintenance checkpoints --------------------------------------------
  putCheckpoint(ctx: OAuthDeploymentContext, checkpoint: OAuthAdminCheckpoint): Promise<void>
  getCheckpoint(ctx: OAuthDeploymentContext, kind: OAuthAdminRecordKind): Promise<OAuthAdminCheckpoint | null>
}

/**
 * Redactor contract. Validates DTO allowlists and produces safe error/audit
 * projections. Implementations drop the design's explicit denylist (codes,
 * tokens, cookies, authorization query strings, raw bodies/exceptions/
 * addresses, credential/profile documents, and private JWK fields).
 */
export interface OAuthAdminRedactor {
  /** Assert a value contains no denylisted fields, returning a safe copy. */
  redact<T>(value: T): T
  /** Produce a deployment-scoped pseudonymous reference for a raw address. */
  pseudonymizeNetwork(ctx: OAuthDeploymentContext, rawAddress: string): string
  /** Produce a safe, bounded error projection from an arbitrary error. */
  safeError(error: unknown): { code: string, message: string }
}

/**
 * A raw provider artifact observed by the maintenance reader. This is the ONLY
 * point where the administration surface touches the provider artifact table
 * (`GHOST_OAUTH_TABLE_NAME`), and it happens in maintenance work only — never a
 * request path (design "projection/backfill consistency model", Requirement
 * 5.5 / 18.3).
 *
 * SAFETY: The reader maps only allowlisted, non-secret metadata out of the raw
 * payload before it reaches a projection. It MUST NOT reset credentials,
 * register a client, create consent, infer historical timestamps, or fabricate
 * activity (Requirement 5.4 / 16.2).
 */
export interface OAuthProviderArtifact {
  /** `oidc-provider` model name, e.g. `Client` or `Grant`. */
  model: string
  /** Provider artifact id (client id / grant id), used as the projection reference. */
  id: string
  /** Opaque provider payload; only allowlisted fields are read from it. */
  payload: Record<string, unknown>
  /** Provider TTL (epoch seconds), when present. */
  ttl?: number
}

/**
 * A bounded page of provider artifacts plus a resumable continuation token.
 * The maintenance reader traverses the provider table one bounded page at a
 * time so a run can be resumed from a stored checkpoint.
 */
export interface OAuthProviderArtifactPage {
  artifacts: OAuthProviderArtifact[]
  /** Opaque continuation token; absent when the traversal is complete. */
  nextToken?: string
  /** True when the provider table could not be read (availability failure). */
  unavailable?: boolean
}

/**
 * Read-only, bounded reader over the provider artifact table used ONLY by
 * maintenance backfill/reconciliation. It performs a bounded, resumable
 * traversal and reads a single artifact for targeted reconciliation. It never
 * writes, deletes, or mutates provider state.
 */
export interface OAuthProviderArtifactReader {
  /** Read one bounded page of Client/Grant artifacts, resuming from `token`. */
  readPage(pageSize: number, token?: string): Promise<OAuthProviderArtifactPage>
  /** Read the current provider state for a single Client/Grant, for reconciliation. */
  readArtifact(model: 'Client' | 'Grant', id: string): Promise<OAuthProviderArtifact | null>
}

/** Options bounding a single maintenance backfill run. */
export interface OAuthBackfillOptions {
  /** Provider artifacts scanned per page (bounded). */
  pageSize?: number
  /** Maximum number of provider pages to read in this run (bounds the run). */
  maxPages?: number
}

/** Outcome of a bounded maintenance backfill run. */
export interface OAuthBackfillResult {
  /** Coverage reached after this run. */
  coverage: OAuthCoverageState
  /** Number of provider artifacts processed in this run. */
  processed: number
  /** Number of Client projections seeded/updated in this run. */
  clientsProjected: number
  /** Number of Grant projections seeded/updated in this run. */
  grantsProjected: number
  /** True when there is more provider data to process (checkpoint is resumable). */
  hasMore: boolean
  /** High-water mark recorded on the checkpoint, when known. */
  highWaterMark?: IsoDateTime
}

/** Outcome of reconciling a single projection against authoritative provider state. */
export type OAuthReconciliationOutcome =
  /** Provider and projection agreed; nothing changed. */
  | 'unchanged'
  /** Projection was stale/divergent and was repaired from provider state. */
  | 'repaired'
  /** Provider record was gone; projection was tombstoned. */
  | 'tombstoned'
  /** No projection existed to reconcile. */
  | 'absent'

/**
 * Writes and reconciles Client/Grant projections. The provider is always
 * authoritative: stale/partial/rebuilding data is labelled via coverage and is
 * never served as an authorization decision. A one-time bounded, resumable
 * maintenance reader MAY seed projections from the provider artifact table;
 * that scan lives in maintenance work only, never a request path.
 */
export interface OAuthProjectionService {
  /**
   * Run one bounded, resumable backfill pass. Reads provider Client/Grant
   * artifacts a page at a time from the stored checkpoint, seeds/updates their
   * projections after reading current provider state, and records coverage plus
   * a high-water mark. Never resets credentials, registers a client, creates
   * consent, infers historical timestamps, or fabricates activity.
   */
  backfill(ctx: OAuthDeploymentContext, options?: OAuthBackfillOptions): Promise<OAuthBackfillResult>

  /**
   * Reconcile a single client projection against authoritative provider state,
   * repairing divergence or tombstoning a removed provider record.
   */
  reconcileClient(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<OAuthReconciliationOutcome>

  /**
   * Reconcile a single grant projection against authoritative provider state,
   * repairing divergence or tombstoning a removed provider record.
   */
  reconcileGrant(ctx: OAuthDeploymentContext, grantReference: OpaqueReference): Promise<OAuthReconciliationOutcome>
}

/**
 * Signed-cursor codec contract. Cursors are bound to deployment, actor/
 * capability scope, and query fingerprint so tampering or cross-query reuse is
 * rejected.
 */
export interface OAuthAdminCursorCodec {
  encode(claims: OAuthCursorClaims): string
  decode(cursor: string): OAuthCursorClaims
}

/**
 * Access-service contract resolving deployment context, requiring
 * Administrator + capability, deriving a safe browser actor reference, and
 * applying no-store headers. Concrete implementation is added in task 5.1.
 */
export interface OAuthAdminAccessContext {
  deployment: OAuthDeploymentContext
  /** Safe, opaque browser actor reference derived server-side. */
  actor: OpaqueReference
  /** Capabilities held by the current actor. */
  capabilities: OAuthCapability[]
}
