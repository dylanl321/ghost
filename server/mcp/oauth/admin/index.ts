/**
 * OAuth Administration — server module barrel and repository factory.
 *
 * Provides a single entry point for server request paths to obtain the
 * deployment context, redactor, and an {@link OAuthAdminRepository}. The
 * concrete repository is selected from server-only runtime configuration:
 * durable DynamoDB when an administration table is configured, otherwise the
 * in-memory fixture (a memory-only deployment can still show safe
 * configuration and explicit "unavailable" history but cannot claim durable
 * inventory/audit — see design "projection/backfill consistency model").
 */

import type { OAuthAdminRepository } from './types'
import { getOAuthAdminTableConfig, useDurableOAuthAdminStore } from '../../config'
import { DynamoOAuthAdminRepository } from './repository'
import { InMemoryOAuthAdminRepository } from './memory-repository'

export * from './types'
export {
  RuntimeOAuthAdminDeploymentContextResolver,
  oauthAdminDeploymentContextResolver,
  resolveOAuthAdminDeploymentContext
} from './deployment-context'
export { OAuthAdminDenylistRedactor, oauthAdminRedactor } from './redactor'
export { DynamoOAuthAdminRepository } from './repository'
export { InMemoryOAuthAdminRepository } from './memory-repository'
export {
  DynamoOAuthProviderArtifactReader,
  oauthProviderArtifactReader
} from './provider-artifact-reader'
export {
  mapClientArtifact,
  mapGrantArtifact,
  redirectsAllowLoopback
} from './projection-mappers'
export {
  DefaultOAuthProjectionService,
  getOAuthProjectionService
} from './projection-service'
export {
  OAuthEventCollector,
  getOAuthEventCollector,
  type OAuthEventInput,
  type OAuthCollectorMetrics
} from './event-collector'
export {
  projectStageHealth,
  projectUnavailableHealth,
  OAUTH_HEALTH_STAGES,
  DEFAULT_FRESHNESS_HORIZON_MS,
  type HealthProjectionOptions
} from './health-projector'
export {
  assembleAttempts,
  type OAuthAttempt,
  type OAuthAttemptStageEntry,
  type OAuthAttemptCorrelationKind,
  type AttemptAssemblyOptions
} from './attempt-assembler'
export {
  OAuthConfigurationService,
  oauthConfigurationService
} from './configuration-service'
export {
  OAuthQuotaService,
  oauthQuotaService,
  type QuotaObservationRequest
} from './quota-service'
export {
  requireOAuthAdminCapability,
  applyOAuthAdminResponseHeaders,
  oauthAdminAccessService,
  oauthAdminErrors,
  type OAuthAdminAccessService,
  type OAuthAdminErrorCode
} from './access-service'
export {
  SignedOAuthAdminCursorCodec,
  oauthAdminCursorCodec,
  computeQueryFingerprint,
  cursorBindingFor,
  decodeBoundCursor,
  issueBoundCursor,
  DEFAULT_CURSOR_TTL_MS,
  type CursorBinding
} from './cursor-codec'
export {
  OAuthQueryService,
  getOAuthQueryService
} from './query-service'
export {
  OAuthIssueAggregationService,
  getOAuthIssueAggregationService,
  aggregateIssueGroups,
  classifyIssueCategory,
  windowStartMsFor,
  ISSUE_WINDOW_MS,
  type OAuthIssueGroup,
  type OAuthIssueAggregationOptions,
  type OAuthIssueAggregationResult
} from './issue-aggregation-service'
export {
  issueCsrfToken,
  verifyCsrfToken,
  validateSameOrigin,
  CSRF_TOKEN_TTL_MS
} from './csrf'
export {
  parseBrowserMutation,
  CSRF_HEADER,
  type ParsedBrowserMutation
} from './mutation-context'
export {
  OAuthAdminOperationService,
  computeRequestFingerprint,
  generateIdempotencyKey,
  DEFAULT_OPERATION_LEASE_MS,
  type ReserveOperationInput,
  type ReserveOperationResult,
  type EffectOutcome
} from './operation-service'
export {
  OAuthApplicationCreationService,
  validateCreateApplicationRequest,
  buildNativeClientMetadata,
  registerNativeClientWithProvider,
  getSupportedResourcesAndScopes,
  generateClientId,
  type NormalizedCreateApplication,
  type CreateApplicationResult,
  type OAuthIntegrationInstructions
} from './application-creation-service'
export {
  OAuthGrantRevocationService,
  InMemoryGrantRevocationMarkerStore,
  DynamoGrantRevocationMarkerStore,
  getGrantRevocationMarkerStore,
  type OAuthGrantRevocationMarker,
  type OAuthGrantRevocationMarkerStore,
  type OAuthGrantCredentialImpact,
  type OAuthGrantRevocationPreview,
  type OAuthGrantRevocationResult,
  type GrantCredentialAdapter
} from './grant-revocation-service'
export {
  OAUTH_DIAGNOSTIC_CHECKS,
  isApprovedCheck,
  isApprovedTarget,
  approvedTargetOrigins,
  runNamedCheck,
  checkProtectedResourceDiscovery,
  checkAuthorizationServerDiscovery,
  checkPublicJwksMetadata,
  checkProviderStorageRead,
  checkCrewConfigurationHealth,
  DIAGNOSTIC_CHECK_IMPLEMENTATIONS,
  type DiagnosticProbeContext
} from './diagnostic-checks'
export {
  OAUTH_MAINTENANCE_LOCK_NAMESPACE,
  DEFAULT_MAINTENANCE_LEASE_MS,
  InMemoryOAuthMaintenanceLockStore,
  DynamoOAuthMaintenanceLockStore,
  getOAuthMaintenanceLockStore,
  maintenanceLockKey,
  type OAuthMaintenanceLockStore,
  type OAuthMaintenanceLease
} from './oauth-maintenance-lock'
export {
  OAuthDiagnosticService,
  runCheckStep,
  isTerminal,
  generateDiagnosticIdempotencyKey,
  MAX_CHECKS_PER_JOB,
  MAX_JOBS_PER_DEPLOYMENT,
  CHECK_TIMEOUT_MS,
  JOB_TIMEOUT_MS,
  type RunJobOptions
} from './diagnostic-service'
export {
  OAuthIssueUpdateService,
  normalizeIssueUpdate,
  sanitizeBoundedText,
  MAX_NOTE_LENGTH,
  MAX_OWNER_LENGTH,
  type NormalizedIssueUpdate,
  type IssueUpdateResult
} from './issue-update-service'
export {
  OAuthManagedPolicyService,
  readManagedPolicy,
  normalizeOwnership,
  normalizeRedirectUri,
  normalizeRedirectUris,
  MANAGED_POLICY_METADATA_KEY,
  MANAGED_POLICY_VERSION,
  LIFECYCLE_MATRIX,
  type ManagedPolicyExtension,
  type LifecycleMatrixEffect,
  type LifecyclePreview
} from './managed-policy-service'
export {
  OAuthIssueExportService,
  getOAuthIssueExportService,
  EXPORT_EVENT_BOUND
} from './issue-export-service'
export {
  OAuthAlertEvaluationService,
  getOAuthAlertEvaluationService,
  evaluateAlertConditions,
  alertGroupKey,
  resolveApprovedRecipients,
  ALERT_EVALUATION_LOCK_SCOPE,
  ALERT_EVALUATION_LEASE_MS,
  SIGNING_KEY_DEADLINE_ENV,
  type AlertConditionEvaluation,
  type AlertEvaluationInputs,
  type OAuthAlertEvaluationDeps,
  type OAuthAlertEvaluationResult
} from './alert-evaluation-service'
export {
  getOAuthAlertSettings,
  updateOAuthAlertSettings,
  resetOAuthAlertSettings,
  validateOAuthAlertSettingsPatch,
  isOAuthAlertSettingKey,
  isApprovedRecipientsRef,
  OAUTH_ALERT_SETTING_KEYS,
  OAUTH_ALERT_SETTING_KEY_LIST,
  OAUTH_ALERT_RECIPIENT_REFERENCES,
  DEFAULT_OAUTH_ALERT_SETTINGS,
  DEFAULT_OAUTH_ALERT_THRESHOLDS,
  type OAuthAlertSettings,
  type OAuthAlertSettingsPatch,
  type OAuthAlertThresholds,
  type OAuthAlertRecipientsRef,
  type OAuthAlertSettingsDeps
} from './alert-settings'

/** Whether the current deployment has durable OAuth administration storage. */
export function hasDurableOAuthAdminStore(): boolean {
  return useDurableOAuthAdminStore()
}

// A single in-memory repository instance is shared across a memory-only
// deployment so writes/reads within the process are consistent.
let sharedMemoryRepository: InMemoryOAuthAdminRepository | undefined

/**
 * Resolve the repository for the current deployment. Durable when an
 * administration table is configured; otherwise the shared in-memory fixture.
 */
export function getOAuthAdminRepository(): OAuthAdminRepository {
  if (useDurableOAuthAdminStore()) {
    return new DynamoOAuthAdminRepository(getOAuthAdminTableConfig())
  }
  if (!sharedMemoryRepository) sharedMemoryRepository = new InMemoryOAuthAdminRepository()
  return sharedMemoryRepository
}
