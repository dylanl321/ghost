/**
 * OAuth Administration Type Definitions
 * Shared between the Nuxt frontend (page/composable) and the Nitro admin routes.
 *
 * SAFETY CONTRACT (see .kiro/specs/oauth-administration/design.md "Data Models"):
 * - These are ALLOWLISTED projection DTOs only. They MUST NOT expose provider
 *   adapter payloads (opaque `oidc-provider` model rows), authorization codes,
 *   access/refresh/registration tokens, cookie values, Authorization headers,
 *   raw request/response bodies, authorization URLs/query strings, raw
 *   exceptions/stacks, raw network addresses, private JWK parameters,
 *   configuration secrets, or secret/profile documents.
 * - All dates are ISO 8601 strings (see {@link IsoDateTime}).
 * - All identifiers are opaque references unless a capability permits a safe
 *   display label. Network boundaries use deployment-scoped pseudonymous refs.
 * - Retention: activity/audit records carry a 90-day logical expiry
 *   ({@link LogicalExpiry}) enforced before physical TTL cleanup. Active
 *   inventory/policy/grants/markers/incomplete operations follow provider state.
 *
 * This module contains type definitions only. No runtime logic lives here.
 */

// ---------------------------------------------------------------------------
// Primitive / branded reference aliases
// ---------------------------------------------------------------------------

/** ISO 8601 date-time string, e.g. `2025-01-31T12:00:00.000Z`. */
export type IsoDateTime = string

/** ISO 8601 date string (no time), e.g. `2025-01-31`. */
export type IsoDate = string

/**
 * An opaque, non-secret reference identifier. Never a raw token, code, cookie,
 * or credential. Safe to return to the browser and to store in projections.
 */
export type OpaqueReference = string

/**
 * A deployment-scoped pseudonymous reference for a network boundary. Produced
 * from a deployment-scoped HMAC with domain separation; the raw address is
 * never persisted. Key rotation may break historical correlation.
 */
export type PseudonymousNetworkReference = string

// ---------------------------------------------------------------------------
// Deployment / partition separation
// ---------------------------------------------------------------------------

/**
 * Server-resolved deployment environment label. Distinct from the AWS
 * Commercial/GovCloud partition. Callers may never supply this.
 */
export type OAuthDeploymentEnvironment = 'development' | 'production' | 'local' | 'unknown'

/** AWS partition, kept separate from the deployment environment. */
export type AwsPartition = 'commercial' | 'govcloud'

/**
 * Server-derived deployment context. Resolved from runtime configuration only;
 * never accepted from query/body input. Repositories and cursor signatures bind
 * to this so a caller cannot select another deployment's storage or endpoints.
 */
export interface OAuthDeploymentContext {
  /** Stable opaque deployment identifier used for partition/key scoping. */
  deploymentId: OpaqueReference
  /** Human-safe deployment label. */
  environment: OAuthDeploymentEnvironment
  /**
   * Execution mode derived from `NODE_ENV`. Displayed for context only; not
   * sufficient evidence that an ECS deployment is Production.
   */
  executionMode: string
  /** AWS partition, separate from {@link environment}. */
  partition?: AwsPartition
  /** Provenance of the configuration used to resolve this context. */
  provenance: OAuthProvenance
}

// ---------------------------------------------------------------------------
// Observation / coverage / freshness metadata
// ---------------------------------------------------------------------------

/** Whether an observation's underlying evidence could be read. */
export type OAuthAvailability = 'available' | 'unavailable'

/**
 * Coverage state for a projection. A `partial`, `rebuilding`, or `unavailable`
 * projection MUST NOT be served as an authorization decision or reported as a
 * healthy / zero-failure state.
 */
export type OAuthCoverageState = 'complete' | 'partial' | 'rebuilding' | 'unavailable'

/** Freshness classification relative to the observation window. */
export type OAuthFreshness = 'fresh' | 'stale' | 'unknown'

/** How a value was determined, distinguishing configured vs observed truth. */
export type OAuthProvenance = 'configured' | 'effective' | 'observed' | 'unknown'

/** Safe outcome of an observed stage or operation. */
export type OAuthOutcome = 'success' | 'failure' | 'denied' | 'unknown'

/**
 * Coverage/freshness envelope attached to any projection-backed response so the
 * UI can render partial/stale/unavailable states explicitly.
 */
export interface OAuthCoverageMetadata {
  coverage: OAuthCoverageState
  freshness: OAuthFreshness
  availability: OAuthAvailability
  /** Time the underlying evidence was collected, when known. */
  collectedAt?: IsoDateTime
  /** Inclusive observation window start, when the response is windowed. */
  windowStart?: IsoDateTime
  /** Inclusive observation window end, when the response is windowed. */
  windowEnd?: IsoDateTime
}

/**
 * The independent OAuth stages the panel distinguishes. A success in one stage
 * never implies success in another.
 */
export type OAuthStage =
  | 'website-session'
  | 'protected-resource-discovery'
  | 'authorization-server-discovery'
  | 'registration'
  | 'authorization'
  | 'consent'
  | 'token-exchange'
  | 'refresh'
  | 'revocation'
  | 'provider-storage'
  | 'protected-resource-verification'
  | 'crew-profile-retrieval'

// ---------------------------------------------------------------------------
// Logical expiry (90-day retention)
// ---------------------------------------------------------------------------

/**
 * 90-day logical-expiry fields for activity/audit-style records. The repository
 * filters logically expired rows out of query results before DynamoDB TTL
 * performs asynchronous physical cleanup.
 */
export interface LogicalExpiry {
  /** When the record's logical retention window ends. */
  logicalExpiresAt: IsoDateTime
  /** Epoch-seconds TTL used only for asynchronous physical deletion. */
  ttl: number
}

// ---------------------------------------------------------------------------
// Operation states
// ---------------------------------------------------------------------------

/** Durable administrative operation lifecycle states. */
export type OAuthOperationState = 'pending' | 'running' | 'verifying' | 'completed' | 'failed'

/** Durable diagnostic job lifecycle states. */
export type OAuthDiagnosticJobState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'
  | 'unknown'

// ---------------------------------------------------------------------------
// DTO: OAuthObservation
// ---------------------------------------------------------------------------

/**
 * A single independent health observation for one OAuth stage. Absent/stale/
 * partial/unavailable evidence is surfaced explicitly, never as healthy or zero.
 */
export interface OAuthObservation {
  deployment: OAuthDeploymentEnvironment
  executionMode: string
  partition?: AwsPartition
  stage: OAuthStage
  collectedAt?: IsoDateTime
  /** Evidence source label (e.g. `event-collector`, `runtime-config`). */
  source: string
  availability: OAuthAvailability
  freshness: OAuthFreshness
  coverage: OAuthCoverageState
  /** Overall stage state as rendered on a health card. */
  state: 'healthy' | 'degraded' | 'failing' | 'unknown' | 'unavailable'
  outcome: OAuthOutcome
  /** Safe, human-readable next action, when applicable. */
  nextAction?: string
}

// ---------------------------------------------------------------------------
// DTO: OAuthConfiguration
// ---------------------------------------------------------------------------

/**
 * A single safe configuration value tagged with configured/effective/observed
 * values and its provenance. Deployment-required settings are read-only.
 */
export interface OAuthConfigurationValue<T = string | number | boolean | string[] | null> {
  configured?: T
  effective?: T
  observed?: T
  provenance: OAuthProvenance
  /** True when the setting requires deployment and cannot be edited in-panel. */
  readOnly: boolean
}

/** Safe public JWK signing-key metadata. Never exposes private parameters. */
export interface OAuthSigningKeyMetadata {
  keyId: OpaqueReference
  /** Public key type, e.g. `RSA`, `EC`, `OKP`. */
  keyType: string
  algorithm?: string
  use?: string
  /**
   * Signing-key rotation/expiry dates when explicitly known. Absent values are
   * reported as unknown rather than inferred from a JWK.
   */
  rotatedAt?: IsoDateTime
  expiresAt?: IsoDateTime
}

/** Optional, safe deployment/release evidence; unknown values remain unknown. */
export interface OAuthReleaseEvidence {
  releaseSha?: string
  pipelineReference?: string
  imageDigest?: string
  taskRevision?: string
  provenance: OAuthProvenance
}

/**
 * Safe effective OAuth configuration projection. Excludes private key
 * parameters, cookie keys, configuration secrets, and credential documents.
 */
export interface OAuthConfiguration {
  deployment: OAuthDeploymentEnvironment
  issuer: OAuthConfigurationValue<string>
  publicEndpoints: OAuthConfigurationValue<string[]>
  resources: OAuthConfigurationValue<string[]>
  scopes: OAuthConfigurationValue<string[]>
  grantTypes: OAuthConfigurationValue<string[]>
  clientAuthMethods: OAuthConfigurationValue<string[]>
  pkce: OAuthConfigurationValue<string[]>
  registrationPolicy: OAuthConfigurationValue<string>
  tokenLifetimes: OAuthConfigurationValue<string>
  grantLifetimes: OAuthConfigurationValue<string>
  refreshRotation: OAuthConfigurationValue<boolean>
  quotas: OAuthConfigurationValue<string>
  durability: OAuthConfigurationValue<string>
  signingKeys: OAuthSigningKeyMetadata[]
  releaseEvidence?: OAuthReleaseEvidence
  metadata: OAuthCoverageMetadata
}

// ---------------------------------------------------------------------------
// DTO: OAuthApplicationSummary / OAuthApplicationDetail
// ---------------------------------------------------------------------------

/** Managed lifecycle status for an application/client. */
export type OAuthApplicationLifecycle =
  | 'unassigned'
  | 'active'
  | 'deprecated'
  | 'blocked'
  | 'retired'

/** Client type. Only native public clients are supported for creation. */
export type OAuthApplicationType = 'native-public'

/** Accountable ownership metadata. Never a permission grant. */
export interface OAuthApplicationOwnership {
  owner?: string
  team?: string
  purpose?: string
}

/** Safe redirect policy summary; never exposes raw authorization URLs. */
export interface OAuthRedirectPolicy {
  /** Registered redirect URIs, safe to display. */
  redirectUris: string[]
  /** Whether native loopback redirects are permitted. */
  allowsLoopback: boolean
}

/** Observed-use window and count for an application. */
export interface OAuthObservedUse {
  lastObservedAt?: IsoDateTime
  observationWindow?: string
  activeGrantCount?: number | null
  coverage: OAuthCoverageState
}

/** Cursor-paginated inventory summary row. */
export interface OAuthApplicationSummary {
  clientId: OpaqueReference
  name?: string
  type: OAuthApplicationType
  origin: 'dynamic' | 'managed'
  ownership: OAuthApplicationOwnership
  lifecycle: OAuthApplicationLifecycle
  createdAt?: IsoDateTime
  observedUse?: OAuthObservedUse
  metadata: OAuthCoverageMetadata
}

/** Provider-reconciled application detail view. */
export interface OAuthApplicationDetail extends OAuthApplicationSummary {
  redirectPolicy: OAuthRedirectPolicy
  permittedResources: string[]
  permittedScopes: string[]
  /** Optimistic-concurrency revision for `If-Match` edits. */
  revision: string
  updatedAt?: IsoDateTime
}

// ---------------------------------------------------------------------------
// DTO: OAuthEvent
// ---------------------------------------------------------------------------

/** Attempt stage state used across activity/grant views. */
export type OAuthAttemptState =
  | 'pending'
  | 'waiting-for-user'
  | 'succeeded'
  | 'denied'
  | 'cancelled'
  | 'expired'
  | 'failed'
  | 'unknown'

/**
 * A single allowlisted telemetry event. Correlation/client/resource/subject
 * references are absent when not observed; they are never inferred from IP
 * address, display name, or nearby timestamp.
 */
export interface OAuthEvent {
  eventId: OpaqueReference
  /** Optional server/request/interaction/grant/diagnostic correlation ref. */
  referenceId?: OpaqueReference
  timestamp: IsoDateTime
  deployment: OAuthDeploymentEnvironment
  stage: OAuthStage
  attemptState: OAuthAttemptState
  outcome: OAuthOutcome
  /** Safe HTTP status code, when observed. */
  httpStatus?: number
  /** Safe, non-raw error code. */
  errorCode?: string
  /** Safe error category. */
  errorCategory?: string
  /** Stage duration in milliseconds, when measured. */
  durationMs?: number
  clientReference?: OpaqueReference
  resourceReference?: OpaqueReference
  subjectReference?: OpaqueReference
  correlationReference?: OpaqueReference
  diagnosticReference?: OpaqueReference
  quotaReference?: OpaqueReference
  releaseReference?: OpaqueReference
  networkReference?: PseudonymousNetworkReference
}

// ---------------------------------------------------------------------------
// DTO: OAuthGrantSummary
// ---------------------------------------------------------------------------

/**
 * Safe grant summary. Requested and consented scopes are kept distinct; the
 * authorized subject display is present only when the activity capability is
 * granted.
 */
export interface OAuthGrantSummary {
  grantReference: OpaqueReference
  clientReference: OpaqueReference
  /** Present only when the caller holds the activity capability. */
  subjectDisplay?: string
  subjectReference?: OpaqueReference
  requestedScopes: string[]
  consentedScopes: string[]
  resource?: string
  consentedAt?: IsoDateTime
  expiresAt?: IsoDateTime
  lastObservedRefreshAt?: IsoDateTime
  metadata: OAuthCoverageMetadata
}

// ---------------------------------------------------------------------------
// DTO: OAuthIssue
// ---------------------------------------------------------------------------

/** Issue categories. Unobserved client-side causes are marked unverified. */
export type OAuthIssueCategory =
  | 'discovery'
  | 'issuer-audience'
  | 'metadata-redirect'
  | 'pkce-state'
  | 'quota'
  | 'consent'
  | 'grant'
  | 'callback'
  | 'storage-permission'
  | 'profile'
  | 'transport-tls'

export type OAuthIssueSeverity = 'low' | 'medium' | 'high' | 'critical'

/** Administrator disposition, kept separate from observed recovery evidence. */
export type OAuthIssueDisposition = 'open' | 'investigating' | 'mitigated' | 'resolved' | 'dismissed'

/** Verification of recovery, distinct from administrator disposition. */
export type OAuthIssueVerification = 'unverified' | 'observed-recovery' | 'no-recovery-evidence'

/** Grouped, actionable investigation. */
export interface OAuthIssue {
  groupId: OpaqueReference
  groupKey: string
  windowStart: IsoDateTime
  windowEnd: IsoDateTime
  count: number
  firstObservedAt: IsoDateTime
  lastObservedAt: IsoDateTime
  /** Anonymous attempt count, kept separate from identified users. */
  anonymousCount: number
  /** Identified authenticated user count. */
  identifiedCount: number
  severity: OAuthIssueSeverity
  category: OAuthIssueCategory
  /** True when the classification reflects an unobserved client-side cause. */
  unverified: boolean
  owner?: string
  /** Bounded plain-text notes. */
  notes?: string
  /** Bounded plain-text mitigation summary. */
  mitigation?: string
  disposition: OAuthIssueDisposition
  verification: OAuthIssueVerification
  /** Optimistic-concurrency revision for audited updates. */
  revision: string
  metadata: OAuthCoverageMetadata
}

// ---------------------------------------------------------------------------
// DTO: OAuthQuotaObservation
// ---------------------------------------------------------------------------

/** Which quota bucket a reading came from. */
export type OAuthQuotaKeyType = 'durable' | 'local'

/**
 * Non-mutating quota observation. Configured limit is reported even when usage
 * is unavailable; readers never invoke the mutating rate-decision path.
 */
export interface OAuthQuotaObservation {
  reference: PseudonymousNetworkReference
  keyType: OAuthQuotaKeyType
  limit: number
  windowSeconds: number
  available?: number | null
  count?: number | null
  remaining?: number | null
  resetAt?: IsoDateTime | null
  source: string
  collectedAt?: IsoDateTime
  coverage: OAuthCoverageState
  /** Notice that rejected attempts currently count and shared egress aggregates. */
  rejectedAttemptNotice: string
}

// ---------------------------------------------------------------------------
// DTO: OAuthAdminOperation
// ---------------------------------------------------------------------------

/** Enforcement-changing operation kinds. */
export type OAuthOperationType =
  | 'application.create'
  | 'application.adopt'
  | 'application.update'
  | 'application.lifecycle'
  | 'grant.revoke'
  | 'issue.update'
  | 'issue.export'
  | 'diagnostic.run'

/** Durable administrative operation record (safe projection). */
export interface OAuthAdminOperation {
  operationId: OpaqueReference
  type: OAuthOperationType
  actor: OpaqueReference
  capability: OAuthCapability
  deployment: OAuthDeploymentEnvironment
  /** Stable target references reserved before provider effects. */
  targetReferences: OpaqueReference[]
  /** Fingerprint of the normalized request for idempotency-key matching. */
  requestFingerprint: string
  /** Revision expected by an edit (`If-Match`), when applicable. */
  expectedRevision?: string
  reason?: string
  state: OAuthOperationState
  /** Ownership lease expiry protecting in-flight execution. */
  leaseExpiresAt?: IsoDateTime
  /** Safe result payload (never secrets/tokens). */
  result?: Record<string, unknown>
  /** Safe error code/message on failure. */
  error?: { code: string, message: string }
  acceptedAt: IsoDateTime
  completedAt?: IsoDateTime
  verifiedAt?: IsoDateTime
}

// ---------------------------------------------------------------------------
// DTO: OAuthDiagnosticJob
// ---------------------------------------------------------------------------

/** Approved named diagnostic checks. */
export type OAuthDiagnosticCheck =
  | 'protected-resource-discovery'
  | 'authorization-server-discovery'
  | 'public-jwks-metadata'
  | 'provider-storage-read'
  | 'crew-configuration-health'

/** Per-check bounded, safe result. */
export interface OAuthDiagnosticCheckResult {
  check: OAuthDiagnosticCheck
  outcome: OAuthOutcome
  /** Bounded, safe summary; never raw response bodies. */
  summary?: string
  observedAt?: IsoDateTime
}

/** Durable diagnostic job (safe projection). */
export interface OAuthDiagnosticJob {
  jobId: OpaqueReference
  checks: OAuthDiagnosticCheck[]
  actor: OpaqueReference
  deployment: OAuthDeploymentEnvironment
  state: OAuthDiagnosticJobState
  /** Durable cancellation flag checked between steps. */
  cancellationRequested: boolean
  leaseExpiresAt?: IsoDateTime
  deadlineAt?: IsoDateTime
  results: OAuthDiagnosticCheckResult[]
  observedAt?: IsoDateTime
  verifiedAt?: IsoDateTime
}

// ---------------------------------------------------------------------------
// DTO: OAuthAuditRecord
// ---------------------------------------------------------------------------

/** What kind of activity an audit record captures. */
export type OAuthAuditReferenceKind = 'operation' | 'read' | 'diagnostic' | 'export'

/** Safe, 90-day audit record. Never logs secrets or raw request content. */
export interface OAuthAuditRecord extends LogicalExpiry {
  auditId: OpaqueReference
  timestamp: IsoDateTime
  deployment: OAuthDeploymentEnvironment
  actor: OpaqueReference
  capability: OAuthCapability
  referenceKind: OAuthAuditReferenceKind
  referenceId: OpaqueReference
  reason?: string
  /** Safe changed-field names only (not raw before/after secret values). */
  changedFields?: string[]
  /** Safe before/after values for allowlisted fields, when applicable. */
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  outcome: OAuthOutcome
  /** Safe verification evidence reference. */
  evidence?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// DTO: OAuthAlert
// ---------------------------------------------------------------------------

/** Alert conditions evaluated against threshold evidence. */
export type OAuthAlertCondition =
  | 'sustained-throttling'
  | 'token-failure'
  | 'refresh-failure'
  | 'discovery-mismatch'
  | 'storage-failure'
  | 'signing-key-deadline'

export type OAuthAlertState = 'active' | 'recovered'

/** Delivery status; unavailable without an approved organization destination. */
export type OAuthAlertDeliveryStatus = 'delivered' | 'pending' | 'failed' | 'unavailable'

/** Evidence-based, deduplicated OAuth alert (safe projection). */
export interface OAuthAlert extends LogicalExpiry {
  alertId: OpaqueReference
  /** Dedup group key: deployment/condition/resource/client group. */
  groupKey: string
  condition: OAuthAlertCondition
  state: OAuthAlertState
  threshold: number
  windowSeconds: number
  /** Safe references to the evidence that crossed the threshold. */
  evidenceReferences: OpaqueReference[]
  deliveryStatus: OAuthAlertDeliveryStatus
  /** Whether an approved organization recipient exists for delivery. */
  recipientApproved: boolean
  firstEvaluatedAt: IsoDateTime
  lastEvaluatedAt: IsoDateTime
  recoveredAt?: IsoDateTime
}

// ---------------------------------------------------------------------------
// Capability constants
// ---------------------------------------------------------------------------

/** OAuth administration capability strings assigned to the Administrator role. */
export type OAuthCapability =
  | 'oauth.configuration.view'
  | 'oauth.activity.view'
  | 'oauth.applications.manage'
  | 'oauth.grants.revoke'
  | 'oauth.operations.manage'

/** Enumerated capability constants for reuse across server modules. */
export const OAUTH_CAPABILITIES = {
  CONFIGURATION_VIEW: 'oauth.configuration.view',
  ACTIVITY_VIEW: 'oauth.activity.view',
  APPLICATIONS_MANAGE: 'oauth.applications.manage',
  GRANTS_REVOKE: 'oauth.grants.revoke',
  OPERATIONS_MANAGE: 'oauth.operations.manage'
} as const satisfies Record<string, OAuthCapability>

// ---------------------------------------------------------------------------
// Request schemas (query filters, cursor paging, mutation inputs)
// ---------------------------------------------------------------------------

/** Ordering direction for list queries. */
export type OAuthSortOrder = 'asc' | 'desc'

/**
 * Allowlisted list filters. Only these fields are accepted. Ranges default to
 * 24 hours and are capped at 90 days; `limit` caps at 100 (default 50).
 */
export interface OAuthListQuery {
  from?: IsoDateTime
  to?: IsoDateTime
  clientId?: OpaqueReference
  /** Authorized subject reference; requires the activity capability. */
  subject?: OpaqueReference
  resource?: string
  outcome?: OAuthOutcome
  stage?: OAuthStage
  diagnosticReference?: OpaqueReference
  limit?: number
  order?: OAuthSortOrder
  /** Signed, query-bound cursor from a prior page. */
  cursor?: string
}

/** Standard cursor-pagination metadata. Totals are nullable, never invented. */
export interface OAuthPageMetadata {
  limit: number
  returned: number
  hasMore: boolean
  nextCursor: string | null
  total: number | null
  totalIsExact: boolean
  deployment: OAuthDeploymentEnvironment
  observedAt: IsoDateTime
  coverage: OAuthCoverageState
  freshness: OAuthFreshness
}

/** A cursor-paginated list result. */
export interface OAuthPagedResult<T> {
  items: T[]
  page: OAuthPageMetadata
}

/**
 * Decoded signed-cursor claims. Bound to deployment, actor/capability scope,
 * and query fingerprint so a tampered or cross-query cursor is rejected.
 */
export interface OAuthCursorClaims {
  deploymentId: OpaqueReference
  actor: OpaqueReference
  capability: OAuthCapability
  queryFingerprint: string
  order: OAuthSortOrder
  /** Opaque continuation key. */
  position: string
  expiresAt: IsoDateTime
}

/** Common fields for browser mutations requiring integrity guarantees. */
export interface OAuthMutationEnvelope {
  /** Session-bound CSRF token echoed in the `X-CSRF-Token` header. */
  csrfToken: string
  /** Idempotency key; reuse with different input is rejected. */
  idempotencyKey: string
  /** Required reason for state-changing operations. */
  reason: string
}

/** Application-creation request (native public client only). */
export interface OAuthCreateApplicationRequest extends OAuthMutationEnvelope {
  name: string
  ownership: OAuthApplicationOwnership
  redirectUris: string[]
  permittedResources: string[]
  permittedScopes: string[]
}

/** Managed lifecycle transition kinds applied to an application. */
export type OAuthLifecycleAction =
  | 'deprecate'
  | 'block'
  | 'reactivate'
  | 'retire-access-expires'
  | 'retire-revoke-grants'
  | 'reduce-policy'
  | 'expand-policy'
  | 'redirect-edit'
  | 'metadata-owner-transfer'

/** Application update / lifecycle request; requires the current revision. */
export interface OAuthUpdateApplicationRequest extends OAuthMutationEnvelope {
  /** Optimistic-concurrency revision (`If-Match`). */
  expectedRevision: string
  action: OAuthLifecycleAction
  ownership?: OAuthApplicationOwnership
  redirectUris?: string[]
  permittedResources?: string[]
  permittedScopes?: string[]
}

/** Selected-grant revocation request. */
export interface OAuthRevokeGrantRequest extends OAuthMutationEnvelope {
  expectedRevision?: string
}

/** Issue investigation update request. */
export interface OAuthUpdateIssueRequest extends OAuthMutationEnvelope {
  expectedRevision: string
  disposition?: OAuthIssueDisposition
  owner?: string
  notes?: string
  mitigation?: string
}

/** Diagnostic job creation request. */
export interface OAuthCreateDiagnosticRequest extends OAuthMutationEnvelope {
  checks: OAuthDiagnosticCheck[]
}

// ---------------------------------------------------------------------------
// DTO: OAuthApplicationStatus
// ---------------------------------------------------------------------------

/**
 * The two well-known deployment applications the panel always surfaces. Keyed
 * to real deployment truth (the MCP and Kiro Crew resource URLs derived from
 * runtime configuration), not a hard-coded inventory list.
 */
export type OAuthApplicationLabel = 'mcp' | 'kiro-crew'

/**
 * Derived, always-present status for a well-known deployment application.
 *
 * - `registered`     A provider client exists for the resource with the
 *                    expected approved resources/scopes.
 * - `no-activity`    Registered and correctly configured, but no live grants /
 *                    no recent observed use. Benign, not an error.
 * - `active`         Registered, correctly configured, with >=1 live grant
 *                    and/or recent observed use.
 * - `misconfigured`  A client exists but its approved resources/scopes diverge
 *                    from the deployment's supported set. Actionable.
 * - `not-registered` No provider client advertises the resource yet.
 * - `unknown`        Backfill coverage is incomplete, so registration state
 *                    cannot be asserted yet.
 */
export type OAuthApplicationStatusState =
  | 'registered'
  | 'no-activity'
  | 'active'
  | 'misconfigured'
  | 'not-registered'
  | 'unknown'

/**
 * Always-present, redactor-safe status projection for one of the two well-known
 * deployment applications (MCP or Kiro Crew). Composed from configuration truth,
 * provider/projection truth, and live-grant truth — never from recent-event
 * presence — and labeled with coverage/freshness.
 *
 * SAFETY CONTRACT: contains only public configuration values (resource URLs,
 * scope names) and opaque references. It MUST NOT expose secrets, tokens,
 * authorization codes, or identity detail, and it is NEVER an authorization or
 * enforcement input.
 */
export interface OAuthApplicationStatus {
  /** Which well-known deployment application this status describes. */
  application: OAuthApplicationLabel
  /** Public resource URL the application is keyed to. */
  resource: string
  /** Derived, actionable status. */
  status: OAuthApplicationStatusState
  /** Public resources the matched provider client currently approves. */
  approvedResources: string[]
  /** Public scopes the matched provider client currently approves. */
  approvedScopes: string[]
  /** Public resources the deployment configuration expects for this application. */
  expectedResources: string[]
  /** Public scopes the deployment configuration expects for this application. */
  expectedScopes: string[]
  /** Count of live (non-expired, non-tombstoned) grants for the resource. */
  liveGrantCount: number
  /** When use was last observed, when known. Absent means never observed. */
  lastObservedUse?: IsoDateTime
  /** Opaque reference to the matched provider client, when one exists. */
  clientReference?: OpaqueReference
  /** Backfill coverage state backing this status. */
  coverage: OAuthCoverageState
  /** Freshness of the underlying evidence relative to the observation window. */
  freshness: OAuthFreshness
  /** When the underlying evidence was collected, when known. */
  collectedAt?: IsoDateTime
  /** Safe, human-readable next action, when applicable. */
  nextAction?: string
}

// ---------------------------------------------------------------------------
// DTO: OAuthBackfillCoverage (reconcile response)
// ---------------------------------------------------------------------------

/**
 * Thin, redactor-safe reconcile response describing the state of the bounded,
 * resumable projection backfill. This is the server-side backfill result
 * (coverage, processed, clientsProjected, grantsProjected, hasMore,
 * highWaterMark) plus the checkpoint's `updatedAt`, surfaced as the reconcile
 * route's public body.
 *
 * Contains only safe metrics and coverage state — no provider artifacts,
 * tokens, secrets, or identity detail. Introduces no new table, index, or
 * retention rule; the underlying checkpoint and projections already exist.
 */
export interface OAuthBackfillCoverage {
  /** Coverage reached after the most recent bounded run. */
  coverage: OAuthCoverageState
  /** Number of provider artifacts processed in the most recent run. */
  processed: number
  /** Number of Client projections seeded/updated in the most recent run. */
  clientsProjected: number
  /** Number of Grant projections seeded/updated in the most recent run. */
  grantsProjected: number
  /** True when there is more provider data to process (checkpoint is resumable). */
  hasMore: boolean
  /** High-water mark recorded on the checkpoint, when known. */
  highWaterMark?: IsoDateTime
  /** When the durable backfill checkpoint was last updated. */
  updatedAt: IsoDateTime
}

/** Bounded, redacted issue export document. */
export interface OAuthIssueExport {
  issue: OAuthIssue
  events: OAuthEvent[]
  configurationNames: string[]
  releaseEvidence?: OAuthReleaseEvidence
  /** True when events were truncated to the export bound. */
  truncated: boolean
  windowStart: IsoDateTime
  windowEnd: IsoDateTime
  metadata: OAuthCoverageMetadata
}
