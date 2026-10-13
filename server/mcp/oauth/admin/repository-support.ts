/**
 * OAuth Administration — shared repository support helpers.
 *
 * Pure helpers shared by the DynamoDB repository and the in-memory fixture so
 * both enforce identical retention, bounding, and coverage semantics:
 *   - 90-day logical expiry filtering BEFORE returning activity/audit rows
 *     (Requirement 16.1); physical DynamoDB TTL is only asynchronous cleanup.
 *   - Bounded limits (default 50, cap 100) and a bounded 90-day query range.
 *   - Non-invented totals and explicit coverage/freshness metadata.
 */

import type {
  IsoDateTime,
  LogicalExpiry,
  OAuthCoverageState,
  OAuthDeploymentContext,
  OAuthFreshness,
  OAuthListQuery,
  OAuthPageMetadata,
  OAuthPagedResult,
  OAuthSortOrder
} from '#shared/types/oauth-administration'

export const RETENTION_DAYS = 90
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000
export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 100
export const DEFAULT_RANGE_MS = 24 * 60 * 60 * 1000
export const MAX_RANGE_MS = RETENTION_MS

/** Compute the 90-day logical expiry fields for an activity/audit record. */
export function logicalExpiryFor(timestamp: IsoDateTime, now = Date.now()): LogicalExpiry {
  const base = new Date(timestamp).getTime()
  const anchor = Number.isFinite(base) ? base : now
  const expiresMs = anchor + RETENTION_MS
  return {
    logicalExpiresAt: new Date(expiresMs).toISOString(),
    ttl: Math.floor(expiresMs / 1000)
  }
}

/**
 * True when a record is still within retention. Reads `logicalExpiresAt`
 * defensively — DTOs (e.g. `OAuthEvent`) do not statically declare the field,
 * but persisted rows carry it, so the accessor is untyped on purpose.
 */
export function isWithinRetention(record: unknown, now = Date.now()): boolean {
  const expiresAt = (record as { logicalExpiresAt?: IsoDateTime } | null)?.logicalExpiresAt
  if (!expiresAt) return true // records without expiry never logically expire
  const expiresMs = new Date(expiresAt).getTime()
  if (!Number.isFinite(expiresMs)) return true
  return expiresMs > now
}

/** Drop logically expired rows before they are returned from a query. */
export function filterRetained<T>(rows: T[], now = Date.now()): T[] {
  return rows.filter(row => isWithinRetention(row, now))
}

/** Clamp a requested `limit` into the allowed [1, 100] range with a 50 default. */
export function resolveLimit(limit?: number): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)))
}

/**
 * Resolve the bounded inclusive [from, to] window for a query. Defaults to the
 * last 24 hours; the range is capped at 90 days. `to` never exceeds now.
 */
export function resolveWindow(query: OAuthListQuery, now = Date.now()): { fromIso: IsoDateTime, toIso: IsoDateTime } {
  const toMs = query.to ? clampNumber(new Date(query.to).getTime(), now) : now
  const requestedFromMs = query.from ? new Date(query.from).getTime() : toMs - DEFAULT_RANGE_MS
  // Enforce the 90-day maximum range regardless of what was requested.
  const fromMs = Math.max(requestedFromMs, toMs - MAX_RANGE_MS)
  return {
    fromIso: new Date(Math.min(fromMs, toMs)).toISOString(),
    toIso: new Date(toMs).toISOString()
  }
}

function clampNumber(value: number, max: number): number {
  return Number.isFinite(value) ? Math.min(value, max) : max
}

export function resolveOrder(order?: OAuthSortOrder): OAuthSortOrder {
  return order === 'asc' ? 'asc' : 'desc'
}

/** Assemble standard paginated metadata. Totals are nullable and never invented. */
export function buildPageMetadata(params: {
  ctx: OAuthDeploymentContext
  limit: number
  returned: number
  hasMore: boolean
  nextCursor: string | null
  coverage: OAuthCoverageState
  freshness: OAuthFreshness
  observedAt?: IsoDateTime
}): OAuthPageMetadata {
  return {
    limit: params.limit,
    returned: params.returned,
    hasMore: params.hasMore,
    nextCursor: params.nextCursor,
    // A partial/rebuilding/unavailable projection cannot prove an exact total.
    total: null,
    totalIsExact: false,
    deployment: params.ctx.environment,
    observedAt: params.observedAt || new Date().toISOString(),
    coverage: params.coverage,
    freshness: params.freshness
  }
}

/** Wrap items and metadata into a paged result. */
export function toPagedResult<T>(items: T[], page: OAuthPageMetadata): OAuthPagedResult<T> {
  return { items, page }
}
