/**
 * OAuth Administration — revision-checked issue investigation updates (task 11.2).
 *
 * `OAuthIssueUpdateService` applies an administrator's investigation update to a
 * grouped issue (design "Proposed API contract" — `PATCH /issues/:id`;
 * Requirements 10.5, 10.6, 13.1, 13.4, 13.6). It updates ONLY the four
 * administrator-owned investigation fields:
 *   - `owner`       — accountable assignee (bounded plain text; clearable).
 *   - `notes`       — bounded plain-text investigation notes (clearable).
 *   - `mitigation`  — bounded plain-text mitigation summary (clearable).
 *   - `disposition` — the administrator's DISPOSITION
 *                     (`open`/`investigating`/`mitigated`/`resolved`/`dismissed`).
 *
 * CRITICAL invariant (Req 10.6): a disposition update MUST NOT change the
 * evidence-derived `verification` field. Recovery verification is derived from
 * OBSERVED evidence (the aggregation/alert pipeline), never asserted by an
 * administrator. This service copies the existing `verification` through
 * untouched on every update so an administrator resolving an issue can never
 * fabricate an "observed recovery".
 *
 * Integrity (Req 13.1/13.4): every update runs through
 * {@link OAuthAdminOperationService} as an `issue.update` operation — a durable,
 * idempotent, reason-carrying, audited mutation. The update reads the current
 * issue, enforces the caller's `expectedRevision` (a stale revision is a 409
 * conflict), bumps the revision, and persists a safe before/after audit diff
 * (redacted; never raw notes beyond the bounded plain text). The repository
 * write is ALSO conditional on `expectedRevision` so a concurrent edit that
 * slipped between read and write still loses (defence in depth).
 */

import { createHash, randomUUID } from 'node:crypto'
import type {
  OAuthAdminOperation,
  OAuthIssue,
  OAuthIssueDisposition,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type { OAuthAdminAccessContext, OAuthAdminRepository } from './types'
import { oauthAdminErrors } from './access-service'
import { OAuthAdminOperationService, computeRequestFingerprint } from './operation-service'

/** The disposition values an administrator may set. */
const DISPOSITIONS: readonly OAuthIssueDisposition[] = [
  'open',
  'investigating',
  'mitigated',
  'resolved',
  'dismissed'
]

/** Maximum accepted length for a bounded plain-text note/mitigation field. */
export const MAX_NOTE_LENGTH = 2000
/** Maximum accepted length for the owner field. */
export const MAX_OWNER_LENGTH = 200

/**
 * The normalized, validated investigation update. Only fields the caller
 * supplied are present; an explicit empty string clears the corresponding
 * optional field. `disposition` is validated against the allowed set.
 */
export interface NormalizedIssueUpdate {
  expectedRevision: string
  owner?: string
  notes?: string
  mitigation?: string
  disposition?: OAuthIssueDisposition
}

/**
 * Sanitize a bounded plain-text value: strip control characters, collapse
 * whitespace runs to single spaces (preserving newlines), and length-bound it.
 * An empty result is returned as an empty string so the caller can distinguish
 * "clear this field" from "leave unchanged" (undefined).
 */
export function sanitizeBoundedText(value: string, maxLength: number): string {
  // Drop control characters except tab (9), newline (10), and carriage return
  // (13). Built by character code rather than a control-character regex literal
  // so it does not trip the `no-control-regex` lint rule.
  let withoutControl = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const isControl = code <= 0x1f && code !== 9 && code !== 10 && code !== 13
    const isDelete = code === 0x7f
    if (!isControl && !isDelete) withoutControl += char
  }
  // Collapse runs of spaces/tabs but keep line breaks; trim ends.
  const collapsed = withoutControl
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
  return collapsed.slice(0, maxLength)
}

/**
 * Validate and normalize the raw update fields read from the mutation body.
 * `expectedRevision` is required (Req 13.4). At least one investigation field
 * must be supplied. An unknown disposition is rejected (400). Only the four
 * investigation keys are read; anything else on the body is ignored.
 */
export function normalizeIssueUpdate(
  expectedRevision: string | undefined,
  raw: Record<string, unknown>
): NormalizedIssueUpdate {
  if (typeof expectedRevision !== 'string' || expectedRevision.trim().length === 0) {
    throw oauthAdminErrors.badRequest({
      message: 'An expectedRevision is required for an issue update.',
      data: { field: 'expectedRevision' }
    })
  }

  const update: NormalizedIssueUpdate = { expectedRevision: expectedRevision.trim() }

  if (raw.owner !== undefined && raw.owner !== null) {
    if (typeof raw.owner !== 'string') {
      throw oauthAdminErrors.badRequest({ message: 'owner must be a string.', data: { field: 'owner' } })
    }
    update.owner = sanitizeBoundedText(raw.owner, MAX_OWNER_LENGTH)
  }
  if (raw.notes !== undefined && raw.notes !== null) {
    if (typeof raw.notes !== 'string') {
      throw oauthAdminErrors.badRequest({ message: 'notes must be a string.', data: { field: 'notes' } })
    }
    update.notes = sanitizeBoundedText(raw.notes, MAX_NOTE_LENGTH)
  }
  if (raw.mitigation !== undefined && raw.mitigation !== null) {
    if (typeof raw.mitigation !== 'string') {
      throw oauthAdminErrors.badRequest({ message: 'mitigation must be a string.', data: { field: 'mitigation' } })
    }
    update.mitigation = sanitizeBoundedText(raw.mitigation, MAX_NOTE_LENGTH)
  }
  if (raw.disposition !== undefined && raw.disposition !== null) {
    if (typeof raw.disposition !== 'string' || !DISPOSITIONS.includes(raw.disposition as OAuthIssueDisposition)) {
      throw oauthAdminErrors.badRequest({
        message: 'disposition must be one of the supported values.',
        data: { field: 'disposition', reason: 'UNKNOWN_DISPOSITION' }
      })
    }
    update.disposition = raw.disposition as OAuthIssueDisposition
  }

  if (
    update.owner === undefined
    && update.notes === undefined
    && update.mitigation === undefined
    && update.disposition === undefined
  ) {
    throw oauthAdminErrors.badRequest({
      message: 'An issue update must change owner, notes, mitigation, or disposition.',
      data: { reason: 'EMPTY_UPDATE' }
    })
  }

  return update
}

/** Result of an applied issue update. */
export interface IssueUpdateResult {
  operation: OAuthAdminOperation
  issue: OAuthIssue
}

/**
 * The revision-checked, audited issue update service. Constructed with an
 * injected repository (so tests and a memory-only deployment share semantics).
 */
export class OAuthIssueUpdateService {
  private readonly operations: OAuthAdminOperationService

  constructor(
    private readonly repository: OAuthAdminRepository,
    operations?: OAuthAdminOperationService,
    private readonly now: () => number = Date.now
  ) {
    this.operations = operations ?? new OAuthAdminOperationService(repository, undefined, now)
  }

  /**
   * Apply an investigation update. Runs as a durable `issue.update` operation:
   *   1. Load the issue; a missing/guessed group id is a 404.
   *   2. Enforce the caller's `expectedRevision` against the current revision
   *      (stale → 409 conflict; Req 13.4).
   *   3. Apply ONLY owner/notes/mitigation/disposition. `verification` and all
   *      evidence-derived fields are copied through untouched (Req 10.6).
   *   4. Bump the revision and write conditionally on `expectedRevision`.
   *   5. Persist a safe before/after audit diff via the operation service.
   *
   * Idempotency (Req 13.1/13.3): the operation is keyed by the mutation
   * envelope's idempotency key; a retry with the same key + input returns the
   * existing operation without re-applying, and a same-key/different-input
   * request is a 409.
   */
  async update(
    access: OAuthAdminAccessContext,
    groupId: OpaqueReference,
    update: NormalizedIssueUpdate,
    idempotencyKey: string,
    reason: string
  ): Promise<IssueUpdateResult> {
    // The fingerprint binds the target + the concrete field changes so a retry
    // with the same input reconciles and a different input is a conflict.
    const requestFingerprint = computeRequestFingerprint('issue.update', {
      groupId,
      expectedRevision: update.expectedRevision,
      owner: update.owner,
      notes: update.notes,
      mitigation: update.mitigation,
      disposition: update.disposition
    })

    let applied: OAuthIssue | null = null

    const operation = await this.operations.run(
      access,
      {
        type: 'issue.update',
        idempotencyKey,
        requestFingerprint,
        targetReferences: [groupId],
        expectedRevision: update.expectedRevision,
        reason
      },
      async () => {
        // Load current state INSIDE the effect so a reserved-but-unrun retry
        // re-reads the latest issue rather than a stale snapshot.
        const current = await this.repository.getIssue(access.deployment, groupId)
        if (!current) {
          throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment.' })
        }
        // Enforce the expected revision (Req 13.4). A stale revision is a
        // conflict and never overwrites the newer version.
        if (current.revision !== update.expectedRevision) {
          throw oauthAdminErrors.conflict({
            message: 'The issue was modified since it was loaded; reload and retry.',
            data: { reason: 'REVISION_CONFLICT' }
          })
        }

        const before = {
          owner: current.owner,
          notes: current.notes,
          mitigation: current.mitigation,
          disposition: current.disposition
        }

        const nextRevision = this.nextRevision(current.revision)
        const next: OAuthIssue = {
          ...current,
          // Apply ONLY the supplied investigation fields. An explicit empty
          // string clears the optional field; undefined leaves it unchanged.
          owner: update.owner !== undefined ? (update.owner || undefined) : current.owner,
          notes: update.notes !== undefined ? (update.notes || undefined) : current.notes,
          mitigation: update.mitigation !== undefined ? (update.mitigation || undefined) : current.mitigation,
          disposition: update.disposition ?? current.disposition,
          // CRITICAL: verification is evidence-derived — copy it through
          // untouched so a disposition change never fabricates recovery (Req 10.6).
          verification: current.verification,
          revision: nextRevision
        }

        // Conditional write on the ORIGINAL revision (defence in depth against a
        // concurrent write that landed between our read and this write).
        try {
          await this.repository.upsertIssue(access.deployment, next, {
            expectedRevision: update.expectedRevision
          })
        } catch (error: any) {
          if (error?.code === 'REVISION_CONFLICT' || error?.statusCode === 409) {
            throw oauthAdminErrors.conflict({
              message: 'The issue was modified concurrently; reload and retry.',
              data: { reason: 'REVISION_CONFLICT' }
            })
          }
          throw error
        }

        applied = next

        const after = {
          owner: next.owner,
          notes: next.notes,
          mitigation: next.mitigation,
          disposition: next.disposition
        }
        const changedFields = (['owner', 'notes', 'mitigation', 'disposition'] as const)
          .filter(field => before[field] !== after[field])

        return {
          state: 'completed',
          result: { groupId, revision: nextRevision, disposition: next.disposition },
          changedFields,
          before,
          after,
          // Record that verification was intentionally preserved, for audit.
          evidence: { verificationPreserved: next.verification }
        }
      }
    )

    // On an idempotent retry the effect did not run; re-read for the response.
    const issue = applied ?? (await this.repository.getIssue(access.deployment, groupId))
    if (!issue) throw oauthAdminErrors.notFound({ message: 'Issue not found in this deployment.' })
    return { operation, issue }
  }

  /**
   * Derive the next opaque revision. Chained from the previous revision so a
   * revision is unpredictable and monotonic-per-issue without leaking a
   * sequence an attacker could guess.
   */
  private nextRevision(previous: string): string {
    const hash = createHash('sha256')
    hash.update(previous)
    hash.update('\u0000')
    hash.update(String(this.now()))
    hash.update('\u0000')
    hash.update(randomUUID())
    return `rev_${hash.digest('base64url').slice(0, 20)}`
  }
}
