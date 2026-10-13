/**
 * OAuth Administration — synchronized, authoritative last-live-MCP-grant
 * determination and Graph-delegation cleanup/reconciliation (task 9.3).
 *
 * BACKGROUND
 *   A user's Microsoft Graph delegation is stored ONCE per subject
 *   (`GraphDelegation#<subject>`, see delegated-graph.ts) and is SHARED across
 *   every one of that user's live MCP grants. The previous `grant.destroyed`
 *   handler deleted that shared delegation UNCONDITIONALLY whenever any
 *   MCP-resource grant was destroyed. That is unsafe: a user who still has other
 *   live MCP grants would lose the delegation those grants depend on
 *   (Requirement 9.3).
 *
 * DESIGN (design "Managed policy and operation flow", final paragraph):
 *   "The current `grant.destroyed` Graph cleanup is replaced with a per-user
 *    synchronized, authoritative check for another live MCP grant. Uncertain or
 *    incomplete coverage preserves the shared Graph delegation and schedules
 *    reconciliation; a confirmed last live grant permits cleanup. The same
 *    per-user fence protects concurrent consent/grant issuance."
 *
 * WHAT THIS MODULE PROVIDES
 *   1. {@link determineMcpGrantCoverage} — an AUTHORITATIVE, bounded, read-only
 *      determination of whether a subject has ANY OTHER live MCP grant (besides
 *      the one being destroyed). It reads Grant artifacts directly from the
 *      provider artifact table via a bounded, filtered query — the same
 *      maintenance-only read pattern the projection backfill uses — and returns
 *      one of `last-live-grant`, `other-live-grant`, or `uncertain`.
 *   2. {@link handleMcpGrantDestroyed} — the replacement for the unconditional
 *      delete. Runs the determination UNDER A PER-SUBJECT FENCE and:
 *        - `other-live-grant` → PRESERVE the delegation (do nothing).
 *        - `uncertain`        → PRESERVE + SCHEDULE reconciliation (Req 9.5).
 *        - `last-live-grant`  → delete the shared delegation (Req 9.3).
 *   3. {@link reconcileMcpGraphDelegation} — the reconciliation re-check invoked
 *      later (and safe to call repeatedly / after restart). It re-runs the
 *      determination under the same fence and deletes ONLY once the subject is
 *      authoritatively at its last live grant.
 *   4. {@link withSubjectGraphFence} — the per-subject async fence the consent/
 *      grant-issuance path acquires so a delegation is never deleted while a new
 *      grant is being created for the same user (concurrency protection).
 *
 * SAFETY / COMPATIBILITY (Req 18.2)
 *   - A user who truly revoked their LAST grant still gets the delegation
 *     cleaned up — immediately when the determination is authoritative, or
 *     eventually via reconciliation when it was uncertain at destroy time.
 *   - A user with OTHER live grants keeps the delegation and keeps working.
 *   - The read is bounded and read-only; it never mutates provider artifacts and
 *     never touches a grant other than as a counted observation.
 *   - Refresh-token stability is unaffected: this module only ever deletes the
 *     Graph delegation (never a provider refresh token / grant artifact).
 */

import { logger } from '../../utils/logger'
import { scanItems } from '../../utils/dynamodb'
import { getMcpResourceUrl, getOAuthTableConfig, useDurableOAuthStore } from '../config'
import { deleteMcpGraphDelegation } from './delegated-graph'

/**
 * The authoritative coverage outcome for a subject's live MCP grants.
 *   - `last-live-grant`  : the subject has NO OTHER live MCP grant — cleanup of
 *                          the shared delegation is permitted (Req 9.3).
 *   - `other-live-grant` : at least one OTHER live MCP grant exists — the shared
 *                          delegation MUST be preserved (Req 9.3).
 *   - `uncertain`        : coverage could not be established authoritatively
 *                          (query unavailable, eventual consistency, an
 *                          incomplete/truncated read, or the durable store is
 *                          unavailable) — preserve + reconcile (Req 9.5).
 */
export type McpGrantCoverage = 'last-live-grant' | 'other-live-grant' | 'uncertain'

/** A safe, stored Grant artifact row as read from the provider artifact table. */
interface StoredGrantRow {
  artifactId?: string
  model?: string
  payload?: { accountId?: string, resources?: Record<string, unknown>, exp?: number }
  ttl?: number
}

/**
 * The maximum number of Grant artifacts a single authoritative determination
 * will read. Bounded so the determination stays cheap and synchronous. If a
 * subject has an implausibly large number of grants such that the count reaches
 * this bound, we cannot be sure we saw every grant, so coverage is `uncertain`
 * and reconciliation is scheduled rather than risk deleting a still-needed
 * delegation.
 */
const GRANT_SCAN_BOUND = 200

/** Injectable dependencies so tests exercise the full logic with no live AWS. */
export interface GraphDelegationCleanupDeps {
  /** Read one bounded page of the subject's live MCP grants; returns undefined on failure. */
  readSubjectGrantIds: (subject: string) => Promise<string[] | undefined>
  /** Delete the shared Graph delegation for a subject. */
  deleteDelegation: (subject: string) => Promise<void>
  /** Whether durable provider storage is available (in-memory store cannot enumerate). */
  durableStoreAvailable: () => boolean
  /** Schedule a reconciliation re-check for a subject after `delayMs`. */
  scheduleReconciliation: (subject: string, delayMs: number) => void
  /** The MCP resource URL a grant must cover to count as an MCP grant. */
  mcpResource: () => string
}

/**
 * Read the ids of the subject's live grants that cover the MCP resource,
 * directly from the provider artifact table. Bounded and READ-ONLY (the same
 * maintenance-only read discipline as provider-artifact-reader.ts). Returns
 * `undefined` on any read failure so the caller records `uncertain` coverage
 * rather than inventing an empty result.
 *
 * The adapter stores each Grant as `{ artifactId: 'Grant#<id>', model: 'Grant',
 * payload: { accountId, resources, exp, ... }, ttl }`. We filter server-side to
 * `model = Grant` and the subject's `accountId`, then keep only rows that (a)
 * are not logically expired by their `ttl`/`exp` and (b) include the MCP
 * resource in `payload.resources`.
 */
async function readSubjectMcpGrantIds(subject: string): Promise<string[] | undefined> {
  const config = getOAuthTableConfig()
  const mcpResource = getMcpResourceUrl().href
  const nowSeconds = Math.floor(Date.now() / 1000)
  try {
    // A bounded, server-side-filtered read of the subject's Grant artifacts.
    // `accountId` is a payload field (no dedicated index), so this is a bounded
    // filtered scan — the same read class the maintenance backfill performs, and
    // never issued from a request path (Req 5.5 / 18.3). The bound caps cost and
    // also serves as the completeness signal below.
    const result = await scanItems(
      config.tableName,
      '#model = :grant AND payload.accountId = :subject',
      GRANT_SCAN_BOUND,
      undefined,
      config.environment,
      { '#model': 'model' },
      { ':grant': 'Grant', ':subject': subject },
      config.accountId
    )
    // If the scan was truncated (more pages exist), we did NOT see every grant,
    // so we cannot make an authoritative last-grant claim → signal uncertainty.
    if (result.nextToken) return undefined

    const liveMcpGrantIds: string[] = []
    for (const raw of result.items as StoredGrantRow[]) {
      const payload = raw.payload
      if (!payload || payload.accountId !== subject) continue
      // Logical expiry: a grant past its ttl/exp is not live.
      if (typeof raw.ttl === 'number' && raw.ttl > 0 && raw.ttl <= nowSeconds) continue
      if (typeof payload.exp === 'number' && payload.exp > 0 && payload.exp <= nowSeconds) continue
      const resources = payload.resources && typeof payload.resources === 'object' && !Array.isArray(payload.resources)
        ? payload.resources
        : {}
      if (!Object.hasOwn(resources, mcpResource)) continue
      const prefix = 'Grant#'
      const id = typeof raw.artifactId === 'string' && raw.artifactId.startsWith(prefix)
        ? raw.artifactId.slice(prefix.length)
        : raw.artifactId
      if (id) liveMcpGrantIds.push(id)
    }
    return liveMcpGrantIds
  } catch (error) {
    // A read failure means we cannot establish coverage authoritatively. Report
    // uncertainty (undefined) so the caller preserves the delegation and
    // reconciles rather than deleting on incomplete evidence (Req 9.5).
    logger.warn('[MCP Graph] Could not authoritatively enumerate live MCP grants; treating coverage as uncertain', {
      error: error instanceof Error ? error.message : String(error)
    })
    return undefined
  }
}

/** The delay before a scheduled reconciliation re-check runs. */
const RECONCILIATION_DELAY_MS = 30_000

const defaultDeps: GraphDelegationCleanupDeps = {
  readSubjectGrantIds: readSubjectMcpGrantIds,
  deleteDelegation: deleteMcpGraphDelegation,
  durableStoreAvailable: useDurableOAuthStore,
  mcpResource: () => getMcpResourceUrl().href,
  scheduleReconciliation: (subject, delayMs) => {
    const timer = setTimeout(() => {
      void reconcileMcpGraphDelegation(subject).catch(error =>
        logger.error('[MCP Graph] Delegation reconciliation failed', error))
    }, delayMs)
    // Do not keep the process alive solely for a reconciliation timer.
    if (typeof timer.unref === 'function') timer.unref()
  }
}

let activeDeps: GraphDelegationCleanupDeps = defaultDeps

/**
 * Test seam: override the cleanup dependencies. Returns a restore function.
 * Not used on the request/startup path.
 */
export function setGraphDelegationCleanupDepsForTests(
  overrides: Partial<GraphDelegationCleanupDeps>
): () => void {
  const previous = activeDeps
  activeDeps = { ...activeDeps, ...overrides }
  return () => { activeDeps = previous }
}

/**
 * The per-subject fence. A single-flight async mutex keyed by subject so that
 * the last-grant determination + delete for a user is serialized against a
 * concurrent consent/grant issuance for the SAME user. Different subjects never
 * contend. In-process by design: the fence protects the check→delete critical
 * section within a process; the determination itself is authoritative against
 * durable state, and reconciliation converges across processes/restarts.
 */
const subjectFences = new Map<string, Promise<unknown>>()

/**
 * Run `fn` while holding the per-subject fence. The consent/grant issuance path
 * acquires the SAME fence around a grant save so a delegation is never deleted
 * between "no other live grant found" and a new grant being persisted for the
 * same subject (Req 9.3 concurrency clause).
 */
export async function withSubjectGraphFence<T>(subject: string, fn: () => Promise<T>): Promise<T> {
  const previous = subjectFences.get(subject) ?? Promise.resolve()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  // Chain this operation after any in-flight operation for the same subject.
  const chained = previous.then(() => gate)
  subjectFences.set(subject, chained)
  try {
    await previous.catch(() => {})
    return await fn()
  } finally {
    release()
    // Best-effort cleanup: once this operation is the tail of the chain (no
    // newer waiter replaced our entry), drop the subject from the map to avoid
    // unbounded growth. A newer waiter having replaced `chained` means the fence
    // is still in use for this subject, so we leave it in place.
    void chained.then(() => {
      if (subjectFences.get(subject) === chained) subjectFences.delete(subject)
    }).catch(() => {})
  }
}

/**
 * Authoritatively determine whether `subject` has any OTHER live MCP grant
 * besides `destroyedGrantId` (when known). Bounded and read-only.
 *
 * Uncertainty is reported (`uncertain`) when the durable store is unavailable
 * (an in-memory store cannot enumerate a user's grants authoritatively) or the
 * bounded read failed / was incomplete. Otherwise:
 *   - any remaining live MCP grant (other than the one destroyed) → `other-live-grant`
 *   - none → `last-live-grant`
 */
export async function determineMcpGrantCoverage(
  subject: string,
  destroyedGrantId?: string
): Promise<McpGrantCoverage> {
  // Without durable provider storage there is no authoritative set of grants to
  // enumerate, so we cannot claim this is the last grant. Preserve + reconcile.
  if (!activeDeps.durableStoreAvailable()) return 'uncertain'

  const liveIds = await activeDeps.readSubjectGrantIds(subject)
  if (liveIds === undefined) return 'uncertain'

  // The destroyed grant may still appear in an eventually-consistent read; it is
  // not an "other" live grant. Any OTHER live MCP grant means preserve.
  const others = liveIds.filter(id => !destroyedGrantId || id !== destroyedGrantId)
  return others.length > 0 ? 'other-live-grant' : 'last-live-grant'
}

/**
 * Replacement for the unconditional `grant.destroyed` delete. Determines
 * coverage UNDER THE PER-SUBJECT FENCE and acts:
 *   - `other-live-grant` → preserve (no-op).
 *   - `uncertain`        → preserve + schedule reconciliation (Req 9.5).
 *   - `last-live-grant`  → delete the shared delegation (Req 9.3).
 *
 * Never throws to the caller: a failure to delete is logged and does not disturb
 * OAuth traffic. Only ever deletes the Graph delegation — never a provider
 * artifact — so refresh-token stability is unaffected (Req 18.2).
 */
export async function handleMcpGrantDestroyed(subject: string, destroyedGrantId?: string): Promise<McpGrantCoverage> {
  return withSubjectGraphFence(subject, async () => {
    const coverage = await determineMcpGrantCoverage(subject, destroyedGrantId)
    if (coverage === 'other-live-grant') {
      // Another live MCP grant needs the shared delegation — preserve it.
      return coverage
    }
    if (coverage === 'uncertain') {
      // Do not delete on incomplete evidence; converge later (Req 9.5).
      activeDeps.scheduleReconciliation(subject, RECONCILIATION_DELAY_MS)
      return coverage
    }
    // Authoritatively the last live MCP grant — cleanup is permitted (Req 9.3).
    try {
      await activeDeps.deleteDelegation(subject)
    } catch (error) {
      logger.error('[MCP Graph] Failed to remove delegated token after last-grant revocation', error)
      // A failed delete is retried by reconciliation rather than lost.
      activeDeps.scheduleReconciliation(subject, RECONCILIATION_DELAY_MS)
    }
    return coverage
  })
}

/**
 * Reconciliation re-check. Re-runs the authoritative determination under the
 * per-subject fence and deletes the shared delegation ONLY once the subject is
 * authoritatively at its last live grant. Safe to call repeatedly and after a
 * restart: it is idempotent (deleting an already-absent delegation is a no-op)
 * and never deletes while another live grant exists or while coverage is still
 * uncertain (in which case it schedules another re-check).
 */
export async function reconcileMcpGraphDelegation(subject: string): Promise<McpGrantCoverage> {
  return withSubjectGraphFence(subject, async () => {
    const coverage = await determineMcpGrantCoverage(subject)
    if (coverage === 'last-live-grant') {
      try {
        await activeDeps.deleteDelegation(subject)
      } catch (error) {
        logger.error('[MCP Graph] Reconciliation could not remove delegated token', error)
        activeDeps.scheduleReconciliation(subject, RECONCILIATION_DELAY_MS)
      }
      return coverage
    }
    if (coverage === 'uncertain') {
      // Still uncertain — keep the delegation and try again later.
      activeDeps.scheduleReconciliation(subject, RECONCILIATION_DELAY_MS)
    }
    // `other-live-grant`: preserve; nothing further to reconcile.
    return coverage
  })
}
