/**
 * OAuth Administration — restricted-read audit helper (task 12.1).
 *
 * Requirement 13.6 requires audit records for "operations, RESTRICTED DATA
 * ACCESS, diagnostics, or exports". Operations, diagnostics, and exports are
 * already audited through {@link OAuthAdminOperationService} and the diagnostic
 * service; this helper closes the remaining gap: recording a safe, bounded
 * `referenceKind: 'read'` audit record whenever an administrator READS
 * identity-bearing or otherwise restricted data (activity attempts, grants,
 * issue detail carrying identities, or the audit trail itself).
 *
 * SAFETY / bounding (Requirements 13.6, 16.1, 17.5):
 *   - ONE audit record per restricted read invocation — never one per returned
 *     row — so a paged read cannot flood the audit stream.
 *   - The record carries only SAFE evidence: the resource class that was read
 *     and a bounded count of records returned. Raw filter values (which may be
 *     identity-bearing, e.g. a `subject`) and raw request content are NEVER
 *     persisted. A stable, non-reversible query fingerprint is stored instead so
 *     repeated identical reads can be correlated without disclosing the filter.
 *   - The `referenceId` identifies the accessed data class (`read:grants`,
 *     `read:attempts`, `read:issue:<id>`, `read:audit`) so the audit trail shows
 *     WHAT restricted class was accessed, not the underlying identities.
 *   - A 90-day logical expiry is applied exactly like every other audit record;
 *     the repository filters expired rows before returning them (Req 16.1).
 *   - Auditing is fire-and-forget best-effort: a read-audit write failure MUST
 *     NOT fail the read itself (a restricted read is not a state-changing
 *     mutation, so it does not need durable intent-before-effect like a
 *     mutation does). Failures are swallowed so the panel still renders.
 *
 * This helper is invoked from the query service's identity-bearing read paths.
 * It is deliberately NOT invoked for non-restricted configuration/overview/
 * inventory-list/limits reads, which do not expose identity-bearing data.
 */

import { createHash } from 'node:crypto'
import type {
  IsoDateTime,
  OAuthAuditRecord,
  OAuthCapability,
  OAuthListQuery,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRepository } from './types'
import { logicalExpiryFor } from './repository-support'

/**
 * The restricted data classes a read audit can record. Each maps to a stable
 * `referenceId` prefix so the audit trail shows the accessed class without
 * disclosing the identities within it.
 */
export type RestrictedReadResource = 'attempts' | 'attempt' | 'grants' | 'issue' | 'audit'

/** Input describing a single restricted read to audit. */
export interface WriteReadAuditInput {
  /** The restricted data class that was read. */
  resource: RestrictedReadResource
  /**
   * The capability that authorized the read. Recorded on the audit record; the
   * route's capability gate remains the authoritative check.
   */
  capability: OAuthCapability
  /**
   * A specific opaque target reference when the read is for a single record
   * (e.g. an issue group id or an attempt correlation reference). A safe opaque
   * id only — never an identity-bearing value.
   */
  targetReference?: OpaqueReference
  /**
   * The query the read ran, used ONLY to compute a non-reversible fingerprint.
   * Raw filter values are never persisted.
   */
  query?: OAuthListQuery
  /** Bounded count of records the read returned (safe evidence). */
  returned?: number
}

/**
 * Compute a stable, non-reversible fingerprint of a restricted-read query. The
 * fingerprint lets identical repeated reads be correlated in the audit trail
 * without ever persisting the raw (possibly identity-bearing) filter values.
 * Only the documented filter FIELD NAMES that were present are folded in along
 * with a hash of their values, so the fingerprint changes when the filter set
 * or values change but never reveals them.
 */
export function readQueryFingerprint(query: OAuthListQuery | undefined): string {
  const hash = createHash('sha256')
  const source = query || {}
  // Order-insensitive over the documented filter fields; `limit`/`cursor`/
  // `order` are paging controls and excluded so paging the same filtered read
  // shares a fingerprint.
  const fields: (keyof OAuthListQuery)[] = ['from', 'to', 'clientId', 'subject', 'resource', 'outcome', 'stage', 'diagnosticReference']
  for (const field of fields.sort()) {
    const value = source[field]
    if (value === undefined || value === null || value === '') continue
    hash.update(field)
    hash.update('\u0000')
    hash.update(String(value))
    hash.update('\u0000')
  }
  return hash.digest('base64url').slice(0, 20)
}

/**
 * The restricted-read audit writer. Constructed with the injected repository so
 * tests and a memory-only deployment share identical semantics with the rest of
 * the admin module.
 */
export class OAuthReadAuditWriter {
  constructor(
    private readonly repository: OAuthAdminRepository,
    private readonly now: () => number = Date.now
  ) {}

  /**
   * Derive a stable, deployment/actor/resource/fingerprint-scoped audit id so a
   * repeated identical read within the same millisecond does not clobber a
   * distinct read, while remaining opaque and non-reversible. A random-free,
   * timestamped id keeps the day-partition stream stable and ordered.
   */
  private auditIdFor(access: OAuthAdminAccessContext, input: WriteReadAuditInput, timestamp: IsoDateTime): OpaqueReference {
    const hash = createHash('sha256')
    hash.update(access.deployment.deploymentId)
    hash.update('\u0000')
    hash.update(access.actor)
    hash.update('\u0000')
    hash.update(this.referenceIdFor(input))
    hash.update('\u0000')
    hash.update(timestamp)
    return `aud_${hash.digest('base64url').slice(0, 24)}`
  }

  /** The stable reference id identifying the accessed restricted class. */
  private referenceIdFor(input: WriteReadAuditInput): OpaqueReference {
    if (input.resource === 'issue' && input.targetReference) return `read:issue:${input.targetReference}`
    if (input.resource === 'attempt' && input.targetReference) return `read:attempt:${input.targetReference}`
    return `read:${input.resource}`
  }

  /**
   * Write a single safe, bounded restricted-read audit record. Best-effort:
   * a write failure is swallowed so a restricted READ never fails because its
   * audit could not be persisted (a read is not a state-changing mutation).
   */
  async writeReadAudit(access: OAuthAdminAccessContext, input: WriteReadAuditInput): Promise<void> {
    try {
      const timestamp = new Date(this.now()).toISOString()
      const evidence: Record<string, unknown> = {
        resource: input.resource,
        queryFingerprint: readQueryFingerprint(input.query)
      }
      if (typeof input.returned === 'number' && Number.isFinite(input.returned)) {
        // Bound the recorded count defensively; it is only safe evidence.
        evidence.returned = Math.max(0, Math.min(input.returned, 1000))
      }
      const record: OAuthAuditRecord = {
        auditId: this.auditIdFor(access, input, timestamp),
        timestamp,
        deployment: access.deployment.environment,
        actor: access.actor,
        capability: input.capability,
        referenceKind: 'read',
        referenceId: this.referenceIdFor(input),
        // A restricted read is a completed access; its outcome is a success.
        outcome: 'success',
        evidence,
        ...logicalExpiryFor(timestamp, this.now())
      }
      await this.repository.putAuditRecord(access.deployment, record)
    } catch {
      // Swallow — never fail a restricted read because its audit write failed.
    }
  }
}
