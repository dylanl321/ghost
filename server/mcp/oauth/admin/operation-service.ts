/**
 * OAuth Administration — durable operation service.
 *
 * `OAuthAdminOperationService` is the reusable machinery every
 * enforcement-changing browser action runs through (design "Managed policy and
 * operation flow"; component table `OAuthAdminOperationService`). Later tasks
 * (7.2 create, 8.x lifecycle, 9.x revocation, 11.x diagnostics) supply only the
 * action-specific `runEffect`; this service owns the durable, idempotent,
 * revision-checked, audited lifecycle around it (Requirements 1.4, 6.5, 9.5,
 * 10.5, 13.1–13.7, 17.6):
 *
 *   reserve → execute → verify → reconcile
 *
 * Invariants:
 *   - Durable intent BEFORE provider effect. `reserve()` conditionally writes
 *     the operation record and an audit-intent record (require-absent on the
 *     scoped idempotency key) before any provider mutation runs. A reservation
 *     failure is a precondition failure that BLOCKS the mutation (Req 13.2,
 *     13.7).
 *   - Idempotent retry / reconcile. A retry with the SAME scoped idempotency
 *     key and the SAME request fingerprint returns the existing operation
 *     (reconciling an interrupted one) rather than running the effect again. A
 *     SAME key with a DIFFERENT fingerprint is a conflict and cannot execute
 *     (Req 13.3).
 *   - Stable targets + ownership lease. Target references and a short lease are
 *     recorded on the reserved record before effects, so a crash after a
 *     provider write is reconciled against the reserved target rather than
 *     allocating another (Req 13.5).
 *   - Optimistic concurrency. Edits carry an `If-Match` `expectedRevision`; a
 *     stale revision is a conflict (Req 13.4).
 *   - Safe persistence. Only safe result/error projections are persisted; the
 *     redactor scrubs any effect output and the audit outcome. Secrets and raw
 *     request content are never logged/audited (Req 13.6).
 *
 * The repository is INJECTED so tests and a memory-only deployment use the
 * in-memory fixture with identical semantics.
 */

import { createHash, randomBytes } from 'node:crypto'
import type {
  IsoDateTime,
  OAuthAdminOperation,
  OAuthAuditRecord,
  OAuthAuditReferenceKind,
  OAuthCapability,
  OAuthOperationType,
  OAuthOutcome,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRedactor, OAuthAdminRepository } from './types'
import { oauthAdminErrors } from './access-service'
import { oauthAdminRedactor } from './redactor'
import { logicalExpiryFor } from './repository-support'

/** Default ownership-lease duration protecting an in-flight operation. */
export const DEFAULT_OPERATION_LEASE_MS = 60 * 1000

/**
 * Input to reserve a durable operation. The caller has already parsed the
 * browser mutation (CSRF/origin/envelope) and normalized the action input into
 * a stable value used to compute the fingerprint.
 */
export interface ReserveOperationInput {
  type: OAuthOperationType
  /** Scoped idempotency key from the mutation envelope. */
  idempotencyKey: string
  /** Stable hash of the normalized action input (see {@link computeRequestFingerprint}). */
  requestFingerprint: string
  /** Stable target references reserved before provider effects (Req 13.5). */
  targetReferences: OpaqueReference[]
  /** `If-Match` revision for an edit (Req 13.4). */
  expectedRevision?: string
  /** Required reason for the state-changing operation. */
  reason: string
  /** Ownership lease duration; defaults to {@link DEFAULT_OPERATION_LEASE_MS}. */
  leaseMs?: number
}

/**
 * Result of a reservation. `isExisting` distinguishes a fresh reservation from
 * an idempotent retry that returned the already-reserved operation (which the
 * caller reconciles rather than re-executing).
 */
export interface ReserveOperationResult {
  operation: OAuthAdminOperation
  isExisting: boolean
}

/** Safe outcome of a provider effect, persisted on the operation and audit. */
export interface EffectOutcome {
  /** Terminal state after the effect: `completed` or `verifying`. */
  state: 'completed' | 'verifying'
  /** Safe result payload (redacted before persistence). */
  result?: Record<string, unknown>
  /** Safe changed-field names for the audit diff. */
  changedFields?: string[]
  /** Safe before/after values for allowlisted fields. */
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  /** Safe verification evidence reference. */
  evidence?: Record<string, unknown>
}

/** Map an operation type to the audit reference kind it records. */
function referenceKindFor(type: OAuthOperationType): OAuthAuditReferenceKind {
  if (type === 'diagnostic.run') return 'diagnostic'
  if (type === 'issue.export') return 'export'
  return 'operation'
}

/**
 * Compute a stable request fingerprint from the operation type and the
 * normalized action input. Deterministic for equal inputs so an idempotent
 * retry produces the same fingerprint, and a materially different input
 * produces a different one (driving the conflict in `reserve`). The input is
 * canonically serialized (object keys sorted recursively) so key ordering does
 * not change the fingerprint.
 */
export function computeRequestFingerprint(type: OAuthOperationType, normalizedInput: unknown): string {
  const canonical = canonicalize(normalizedInput)
  const hash = createHash('sha256')
  hash.update(type)
  hash.update('\u0000')
  hash.update(JSON.stringify(canonical))
  return hash.digest('base64url')
}

/** Recursively sort object keys for a deterministic serialization. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = canonicalize(record[key])
    }
    return sorted
  }
  return value
}

/**
 * The durable operation service. Constructed with an injected repository and
 * (optionally) a redactor and clock, so tests can exercise the full lifecycle
 * against the in-memory fixture.
 */
export class OAuthAdminOperationService {
  constructor(
    private readonly repository: OAuthAdminRepository,
    private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Derive the stable, deployment/actor/type/idempotency-key-scoped operation
   * id. Scoping ensures two actors, deployments, or operation kinds using the
   * same client-chosen idempotency key never collide, and a retry from the same
   * actor/type/key resolves to the same reserved record (Req 13.3, design
   * "scoped by deployment, actor, operation kind, and idempotency key").
   */
  private operationIdFor(access: OAuthAdminAccessContext, type: OAuthOperationType, idempotencyKey: string): OpaqueReference {
    const hash = createHash('sha256')
    hash.update(access.deployment.deploymentId)
    hash.update('\u0000')
    hash.update(access.actor)
    hash.update('\u0000')
    hash.update(type)
    hash.update('\u0000')
    hash.update(idempotencyKey)
    return `op_${hash.digest('base64url').slice(0, 24)}`
  }

  /** Public accessor to derive the scoped operation id (for pre-run linking). */
  operationId(access: OAuthAdminAccessContext, type: OAuthOperationType, idempotencyKey: string): OpaqueReference {
    return this.operationIdFor(access, type, idempotencyKey)
  }

  /** Derive the audit id for an operation's intent/outcome records. */
  private auditIdFor(operationId: OpaqueReference, phase: 'intent' | 'outcome'): OpaqueReference {
    const hash = createHash('sha256')
    hash.update(operationId)
    hash.update('\u0000')
    hash.update(phase)
    return `aud_${hash.digest('base64url').slice(0, 24)}`
  }

  private isoNow(): IsoDateTime {
    return new Date(this.now()).toISOString()
  }

  /**
   * Reserve the durable operation record and audit intent BEFORE any provider
   * effect. Fails closed:
   *   - A require-absent conflict means a record already exists for the scoped
   *     idempotency key. If its fingerprint matches, the reservation is an
   *     idempotent retry and the existing operation is returned for reconcile.
   *     If it differs, this is a conflict and the mutation cannot execute.
   *   - Any durable-intent write failure propagates as a precondition failure
   *     that blocks the mutation (Req 13.2/13.7).
   */
  async reserve(access: OAuthAdminAccessContext, input: ReserveOperationInput): Promise<ReserveOperationResult> {
    const operationId = this.operationIdFor(access, input.type, input.idempotencyKey)
    const existing = await this.repository.getOperation(access.deployment, operationId)

    if (existing) {
      // Same scoped key: only a matching fingerprint is an idempotent retry.
      if (existing.requestFingerprint !== input.requestFingerprint) {
        throw oauthAdminErrors.conflict({
          message: 'The idempotency key was already used with a different request.',
          data: { reason: 'IDEMPOTENCY_MISMATCH' }
        })
      }
      // An edit must also target the same revision it originally reserved.
      if (input.expectedRevision !== undefined && existing.expectedRevision !== input.expectedRevision) {
        throw oauthAdminErrors.conflict({
          message: 'The idempotency key was already used against a different revision.',
          data: { reason: 'REVISION_CONFLICT' }
        })
      }
      return { operation: existing, isExisting: true }
    }

    const acceptedAt = this.isoNow()
    const leaseMs = input.leaseMs ?? DEFAULT_OPERATION_LEASE_MS
    const operation: OAuthAdminOperation = {
      operationId,
      type: input.type,
      actor: access.actor,
      capability: this.capabilityFor(input.type),
      deployment: access.deployment.environment,
      targetReferences: input.targetReferences,
      requestFingerprint: input.requestFingerprint,
      expectedRevision: input.expectedRevision,
      reason: input.reason,
      state: 'pending',
      leaseExpiresAt: new Date(this.now() + leaseMs).toISOString(),
      acceptedAt
    }

    try {
      // Require-absent: a concurrent duplicate submission loses the race and is
      // reconciled on its own reserve() call below.
      await this.repository.reserveOperation(access.deployment, operation, { requireAbsent: true })
    } catch (error: any) {
      // Lost the require-absent race with a concurrent identical submission.
      // Re-read and reconcile against the winner rather than duplicating.
      if (error?.code === 'OPERATION_IN_PROGRESS' || error?.statusCode === 409) {
        const winner = await this.repository.getOperation(access.deployment, operationId)
        if (winner) {
          if (winner.requestFingerprint !== input.requestFingerprint) {
            throw oauthAdminErrors.conflict({
              message: 'The idempotency key was already used with a different request.',
              data: { reason: 'IDEMPOTENCY_MISMATCH' }
            })
          }
          return { operation: winner, isExisting: true }
        }
      }
      // Durable intent could not be stored — precondition failure blocks it.
      throw oauthAdminErrors.conflict({
        message: 'Could not reserve durable operation intent; the change was not started.',
        data: { reason: 'INTENT_RESERVATION_FAILED' }
      })
    }

    // Durable audit INTENT before the effect (Req 13.6). Best-effort scrubbing.
    await this.writeAuditIntent(access, operation)

    return { operation, isExisting: false }
  }

  /**
   * Execute the provider effect for a reserved operation, transitioning
   * `pending`→`running`→(`completed`|`verifying`). A crash after a provider
   * write but before this returns is reconciled via the reserved record on the
   * next `reserve()` with the same key — the effect is NOT run twice.
   *
   * Only safe, redacted result/evidence is persisted. A thrown effect is
   * recorded as a safe `failed` outcome and re-thrown so the route surfaces it.
   */
  async execute(
    access: OAuthAdminAccessContext,
    operation: OAuthAdminOperation,
    runEffect: (operation: OAuthAdminOperation) => Promise<EffectOutcome>
  ): Promise<OAuthAdminOperation> {
    // A terminal operation is returned as-is (idempotent reconcile).
    if (operation.state === 'completed' || operation.state === 'failed' || operation.state === 'verifying') {
      return operation
    }

    // Transition to running under the reserved record.
    const running: OAuthAdminOperation = { ...operation, state: 'running' }
    await this.repository.updateOperation(access.deployment, running)

    try {
      const outcome = await runEffect(running)
      const completedAt = this.isoNow()
      const settled: OAuthAdminOperation = {
        ...running,
        state: outcome.state,
        result: outcome.result ? this.redactor.redact(outcome.result) : undefined,
        completedAt: outcome.state === 'completed' ? completedAt : undefined,
        verifiedAt: undefined,
        leaseExpiresAt: undefined
      }
      await this.repository.updateOperation(access.deployment, settled)
      await this.writeAuditOutcome(access, settled, 'success', outcome)
      return settled
    } catch (error) {
      const safeError = this.redactor.safeError(error)
      const failed: OAuthAdminOperation = {
        ...running,
        state: 'failed',
        error: safeError,
        completedAt: this.isoNow(),
        leaseExpiresAt: undefined
      }
      await this.repository.updateOperation(access.deployment, failed)
      await this.writeAuditOutcome(access, failed, 'failure')
      throw error
    }
  }

  /**
   * Mark a `verifying` operation `completed` once its eventual-consistency
   * conditions are confirmed (used by revocation/lifecycle reconciliation in
   * later tasks). A non-`verifying` operation is returned unchanged.
   */
  async markVerified(
    access: OAuthAdminAccessContext,
    operation: OAuthAdminOperation,
    evidence?: Record<string, unknown>
  ): Promise<OAuthAdminOperation> {
    if (operation.state !== 'verifying') return operation
    const verified: OAuthAdminOperation = {
      ...operation,
      state: 'completed',
      verifiedAt: this.isoNow(),
      completedAt: operation.completedAt || this.isoNow()
    }
    await this.repository.updateOperation(access.deployment, verified)
    await this.writeAuditOutcome(access, verified, 'success', evidence ? { state: 'completed', evidence } : undefined)
    return verified
  }

  /**
   * Poll/get the current state of an operation for the status route. Scoped to
   * the caller's deployment; a guessed id from another deployment cannot be
   * read because the deployment context is server-derived.
   */
  async get(access: OAuthAdminAccessContext, operationId: OpaqueReference): Promise<OAuthAdminOperation | null> {
    return this.repository.getOperation(access.deployment, operationId)
  }

  /**
   * Reserve + execute in one call for the common single-shot mutation path. An
   * idempotent retry returns/reconciles the existing operation without running
   * the effect again.
   */
  async run(
    access: OAuthAdminAccessContext,
    input: ReserveOperationInput,
    runEffect: (operation: OAuthAdminOperation) => Promise<EffectOutcome>
  ): Promise<OAuthAdminOperation> {
    const { operation, isExisting } = await this.reserve(access, input)
    if (isExisting) return operation
    return this.execute(access, operation, runEffect)
  }

  // --- audit --------------------------------------------------------------

  /**
   * Persist audit INTENT before the effect runs. Carries actor/capability/
   * deployment/reference/reason with a 90-day logical expiry. Never logs secrets
   * or raw request content.
   */
  async writeAuditIntent(access: OAuthAdminAccessContext, operation: OAuthAdminOperation): Promise<void> {
    const timestamp = this.isoNow()
    const record: OAuthAuditRecord = {
      auditId: this.auditIdFor(operation.operationId, 'intent'),
      timestamp,
      deployment: operation.deployment,
      actor: operation.actor,
      capability: operation.capability,
      referenceKind: referenceKindFor(operation.type),
      referenceId: operation.operationId,
      reason: operation.reason,
      outcome: 'unknown',
      ...logicalExpiryFor(timestamp, this.now())
    }
    await this.repository.putAuditRecord(access.deployment, record)
  }

  /**
   * Persist the audit OUTCOME after the effect. Records the safe outcome and
   * any allowlisted change diff/evidence (redacted). Never logs secrets or raw
   * request content.
   */
  async writeAuditOutcome(
    access: OAuthAdminAccessContext,
    operation: OAuthAdminOperation,
    outcome: OAuthOutcome,
    effect?: EffectOutcome
  ): Promise<void> {
    const timestamp = this.isoNow()
    const record: OAuthAuditRecord = {
      auditId: this.auditIdFor(operation.operationId, 'outcome'),
      timestamp,
      deployment: operation.deployment,
      actor: operation.actor,
      capability: operation.capability,
      referenceKind: referenceKindFor(operation.type),
      referenceId: operation.operationId,
      reason: operation.reason,
      changedFields: effect?.changedFields,
      before: effect?.before ? this.redactor.redact(effect.before) : undefined,
      after: effect?.after ? this.redactor.redact(effect.after) : undefined,
      outcome,
      evidence: effect?.evidence ? this.redactor.redact(effect.evidence) : undefined,
      ...logicalExpiryFor(timestamp, this.now())
    }
    await this.repository.putAuditRecord(access.deployment, record)
  }

  /**
   * Map an operation type to the capability that authorizes it. Used to record
   * the capability on the operation/audit record; the route's capability gate
   * remains the authoritative check.
   */
  private capabilityFor(type: OAuthOperationType): OAuthCapability {
    switch (type) {
      case 'grant.revoke':
        return 'oauth.grants.revoke'
      case 'application.create':
      case 'application.adopt':
      case 'application.update':
      case 'application.lifecycle':
        return 'oauth.applications.manage'
      case 'issue.update':
      case 'issue.export':
      case 'diagnostic.run':
      default:
        return 'oauth.operations.manage'
    }
  }
}

/** Generate a fresh opaque idempotency key for a client that did not supply one. */
export function generateIdempotencyKey(): string {
  return randomBytes(18).toString('base64url')
}
