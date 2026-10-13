/**
 * OAuth Administration — projection service (Client/Grant backfill + reconcile).
 *
 * Implements {@link OAuthProjectionService}: it seeds and reconciles the Client
 * and Grant projections that back the read-only inventory, keeping the provider
 * authoritative at all times (design "projection/backfill consistency model",
 * Requirements 5.3, 5.4, 5.5, 5.6, 16.2, 16.5, 16.6, 18.3).
 *
 * Behavioural contract:
 *   - The ONE-TIME bounded, resumable maintenance reader may scan the provider
 *     artifact table to seed ONLY Client and Grant projections. This scan runs
 *     in maintenance work only; a request path never triggers it (18.3).
 *   - A resumable checkpoint stores a continuation position, a high-water mark,
 *     and coverage (`complete`/`partial`/`rebuilding`/`unavailable`). A run
 *     resumes from the stored position, so an interrupted backfill continues
 *     without restarting (5.3).
 *   - Before every projection write the service reads current provider state and
 *     conditionally updates by observation/version time: an older observation
 *     never overwrites a newer projection (5.6, 16.6).
 *   - It NEVER resets credentials, registers a client, creates consent, infers
 *     historical timestamps, or fabricates activity, and it never treats a
 *     projection as authorization evidence (5.4, 16.2, 16.5).
 *   - Provider/projection divergence produces a visible stale/partial/tombstone
 *     state; reconciliation repairs the projection or tombstones a removed
 *     provider record. The provider remains authoritative (16.6).
 */

import { randomUUID } from 'node:crypto'
import type {
  IsoDateTime,
  OAuthApplicationDetail,
  OAuthDeploymentContext,
  OAuthGrantSummary,
  OpaqueReference
} from '#shared/types/oauth-administration'
import type {
  OAuthAdminCheckpoint,
  OAuthAdminRedactor,
  OAuthAdminRepository,
  OAuthBackfillOptions,
  OAuthBackfillResult,
  OAuthProjectionService,
  OAuthProviderArtifact,
  OAuthProviderArtifactReader,
  OAuthReconciliationOutcome
} from './types'
import { getOAuthAdminRepository } from './index'
import { oauthAdminRedactor } from './redactor'
import { oauthProviderArtifactReader } from './provider-artifact-reader'
import { mapClientArtifact, mapGrantArtifact } from './projection-mappers'

/** Default provider artifacts read per page. Bounded to protect the provider table. */
const DEFAULT_PAGE_SIZE = 100
/** Default maximum pages read in a single bounded backfill run. */
const DEFAULT_MAX_PAGES = 10

/** The checkpoint kind used for the combined Client/Grant backfill. */
const BACKFILL_CHECKPOINT_KIND = 'checkpoints' as const

/**
 * The maximum of two ISO timestamps, treating an absent/invalid value as older.
 * Used to advance the high-water mark monotonically.
 */
function maxIso(a: IsoDateTime | undefined, b: IsoDateTime | undefined): IsoDateTime | undefined {
  const at = a ? new Date(a).getTime() : NaN
  const bt = b ? new Date(b).getTime() : NaN
  if (!Number.isFinite(at)) return Number.isFinite(bt) ? b : undefined
  if (!Number.isFinite(bt)) return a
  return at >= bt ? a : b
}

/**
 * Whether an incoming observation is at least as recent as the persisted
 * projection. Older observations never overwrite newer projection state
 * (Requirement 5.6 / 16.6). Missing persisted timestamps are treated as older
 * so a first observation always seeds.
 */
function observationIsAtLeastAsRecent(observedAt: IsoDateTime, persistedAt?: IsoDateTime): boolean {
  const observed = new Date(observedAt).getTime()
  const persisted = persistedAt ? new Date(persistedAt).getTime() : NaN
  if (!Number.isFinite(persisted)) return true
  return Number.isFinite(observed) && observed >= persisted
}

export class DefaultOAuthProjectionService implements OAuthProjectionService {
  constructor(
    private readonly repository: OAuthAdminRepository = getOAuthAdminRepository(),
    private readonly providerReader: OAuthProviderArtifactReader = oauthProviderArtifactReader,
    private readonly redactor: OAuthAdminRedactor = oauthAdminRedactor
  ) {}

  // --- Backfill -----------------------------------------------------------

  async backfill(ctx: OAuthDeploymentContext, options?: OAuthBackfillOptions): Promise<OAuthBackfillResult> {
    const pageSize = Math.max(1, Math.floor(options?.pageSize ?? DEFAULT_PAGE_SIZE))
    const maxPages = Math.max(1, Math.floor(options?.maxPages ?? DEFAULT_MAX_PAGES))

    const existing = await this.repository.getCheckpoint(ctx, BACKFILL_CHECKPOINT_KIND)
    // A `complete` checkpoint means the one-time seed already traversed the
    // whole provider table; a re-run resumes from the start only if asked to
    // rebuild. We resume from the stored position otherwise.
    let position = existing?.position
    let highWaterMark = existing?.highWaterMark
    let processed = existing?.processed ?? 0

    let clientsProjected = 0
    let grantsProjected = 0
    let pagesRead = 0
    let unavailable = false
    let hasMore = false

    while (pagesRead < maxPages) {
      const page = await this.providerReader.readPage(pageSize, position)
      pagesRead += 1
      if (page.unavailable) {
        unavailable = true
        break
      }

      for (const artifact of page.artifacts) {
        const collectedAt = new Date().toISOString()
        const seeded = await this.seedArtifact(ctx, artifact, collectedAt)
        if (seeded === 'client') clientsProjected += 1
        else if (seeded === 'grant') grantsProjected += 1
        processed += 1
        highWaterMark = maxIso(highWaterMark, collectedAt)
      }

      position = page.nextToken
      if (!position) {
        // Traversal complete.
        hasMore = false
        break
      }
      // More provider data remains; the loop bound may stop us first.
      hasMore = true
    }

    const coverage = unavailable
      ? 'unavailable'
      : hasMore
        ? 'partial'
        : 'complete'

    const checkpoint: OAuthAdminCheckpoint = {
      checkpointId: existing?.checkpointId ?? `backfill_${randomUUID()}`,
      kind: BACKFILL_CHECKPOINT_KIND,
      // A `complete`/`unavailable` run clears the resume position; a `partial`
      // run persists it so the next run resumes exactly where this one stopped.
      position: coverage === 'partial' ? position : undefined,
      highWaterMark,
      coverage,
      processed,
      updatedAt: new Date().toISOString()
    }
    await this.repository.putCheckpoint(ctx, checkpoint)

    return { coverage, processed, clientsProjected, grantsProjected, hasMore, highWaterMark }
  }

  /**
   * Seed/update a single provider artifact into its projection after reading
   * current state and applying the observation-time guard. Returns which
   * projection kind was written, or `null` when skipped (unknown model or an
   * older observation).
   */
  private async seedArtifact(
    ctx: OAuthDeploymentContext,
    artifact: OAuthProviderArtifact,
    collectedAt: IsoDateTime
  ): Promise<'client' | 'grant' | null> {
    if (artifact.model === 'Client') {
      const mapped = this.redactor.redact(mapClientArtifact(ctx, artifact, collectedAt))
      const current = await this.repository.getApplication(ctx, artifact.id)
      if (current && !observationIsAtLeastAsRecent(collectedAt, current.metadata.collectedAt)) return null
      // Preserve an administrator-owned projection's policy metadata: the seed
      // only fills provider-observed fields and never downgrades a managed
      // client to `unassigned` or clears its ownership.
      const merged = current ? this.preserveManagedPolicy(current, mapped) : mapped
      await this.repository.upsertApplication(ctx, merged)
      return 'client'
    }
    if (artifact.model === 'Grant') {
      const mapped = this.redactor.redact(mapGrantArtifact(ctx, artifact, collectedAt))
      const current = await this.repository.getGrant(ctx, artifact.id)
      if (current && !observationIsAtLeastAsRecent(collectedAt, current.metadata.collectedAt)) return null
      await this.repository.upsertGrant(ctx, mapped)
      return 'grant'
    }
    return null
  }

  /**
   * When a projection already carries administrator policy metadata (an adopted
   * managed client), the backfill refreshes only provider-observed fields and
   * keeps the existing lifecycle/ownership/revision. An `unassigned` dynamic
   * projection is replaced wholesale by the fresh observation.
   */
  private preserveManagedPolicy(
    current: OAuthApplicationDetail,
    observed: OAuthApplicationDetail
  ): OAuthApplicationDetail {
    if (current.origin !== 'managed' && current.lifecycle === 'unassigned') return observed
    return {
      ...current,
      // Refresh provider-observed fields only.
      name: observed.name ?? current.name,
      redirectPolicy: observed.redirectPolicy,
      permittedScopes: observed.permittedScopes,
      metadata: observed.metadata,
      updatedAt: observed.updatedAt
    }
  }

  // --- Reconciliation -----------------------------------------------------

  async reconcileClient(ctx: OAuthDeploymentContext, clientId: OpaqueReference): Promise<OAuthReconciliationOutcome> {
    const projection = await this.repository.getApplication(ctx, clientId)
    const provider = await this.providerReader.readArtifact('Client', clientId)

    if (!projection && !provider) return 'absent'

    if (!provider) {
      // The provider record is gone; tombstone the divergent projection so the
      // stale/removed state is visible. The provider remains authoritative.
      if (projection) {
        await this.repository.tombstoneApplication(ctx, clientId)
        return 'tombstoned'
      }
      return 'absent'
    }

    const collectedAt = new Date().toISOString()
    const observed = this.redactor.redact(mapClientArtifact(ctx, provider, collectedAt))
    if (!projection) {
      await this.repository.upsertApplication(ctx, observed)
      return 'repaired'
    }
    if (this.clientProjectionMatches(projection, observed)) return 'unchanged'
    await this.repository.upsertApplication(ctx, this.preserveManagedPolicy(projection, observed))
    return 'repaired'
  }

  async reconcileGrant(ctx: OAuthDeploymentContext, grantReference: OpaqueReference): Promise<OAuthReconciliationOutcome> {
    const projection = await this.repository.getGrant(ctx, grantReference)
    const provider = await this.providerReader.readArtifact('Grant', grantReference)

    if (!projection && !provider) return 'absent'

    if (!provider) {
      // The provider grant is gone; tombstone the projection by degrading its
      // coverage so the removal is visible without asserting live authorization.
      if (projection) {
        await this.repository.upsertGrant(ctx, {
          ...projection,
          metadata: { ...projection.metadata, coverage: 'unavailable', freshness: 'stale' }
        })
        return 'tombstoned'
      }
      return 'absent'
    }

    const collectedAt = new Date().toISOString()
    const observed = this.redactor.redact(mapGrantArtifact(ctx, provider, collectedAt))
    if (!projection) {
      await this.repository.upsertGrant(ctx, observed)
      return 'repaired'
    }
    if (this.grantProjectionMatches(projection, observed)) return 'unchanged'
    await this.repository.upsertGrant(ctx, observed)
    return 'repaired'
  }

  /** Compare the provider-observed fields of two client projections. */
  private clientProjectionMatches(a: OAuthApplicationDetail, b: OAuthApplicationDetail): boolean {
    return a.name === b.name &&
      a.metadata.coverage === b.metadata.coverage &&
      sameStringSet(a.redirectPolicy.redirectUris, b.redirectPolicy.redirectUris) &&
      a.redirectPolicy.allowsLoopback === b.redirectPolicy.allowsLoopback &&
      sameStringSet(a.permittedScopes, b.permittedScopes)
  }

  /** Compare the provider-observed fields of two grant projections. */
  private grantProjectionMatches(a: OAuthGrantSummary, b: OAuthGrantSummary): boolean {
    return a.clientReference === b.clientReference &&
      a.subjectReference === b.subjectReference &&
      a.resource === b.resource &&
      a.expiresAt === b.expiresAt &&
      a.metadata.coverage === b.metadata.coverage &&
      sameStringSet(a.consentedScopes, b.consentedScopes)
  }
}

/** Order-insensitive comparison of two string sets. */
function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every(entry => set.has(entry))
}

/**
 * Shared projection service for maintenance work, constructed lazily so the
 * repository factory in `./index` is resolved on first use rather than at
 * module load (avoids an import cycle with the barrel).
 */
let sharedProjectionService: OAuthProjectionService | undefined

/** Resolve the shared {@link OAuthProjectionService} for the current deployment. */
export function getOAuthProjectionService(): OAuthProjectionService {
  if (!sharedProjectionService) sharedProjectionService = new DefaultOAuthProjectionService()
  return sharedProjectionService
}
