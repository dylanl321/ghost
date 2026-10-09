/**
 * Shared Investigations — fixed-high-water Change_Feed and cursor handling
 * (task 3.4).
 *
 * Owner: Ghostv2 collaboration feed/query modules.
 *
 * A Change_Feed synchronization read is a Team_Space-scoped, ordered walk of
 * durable collaboration changes. This module owns the read *rules* on top of the
 * scope-contained Change_Feed rows written by the CollaborationRepository
 * (`repository.ts`) and the scan-free access-pattern descriptors
 * (`access-patterns.ts`):
 *
 *   - **Fixed High_Water_Mark.** When a client starts synchronization, the
 *     service captures the current Team_Space Server_Sequence ONCE and every
 *     page of that walk is bounded by that same fixed mark, so a walk is
 *     complete and repeatable regardless of writes that land afterward
 *     (Requirement 12.5, 19.3, 19.4, 24.16).
 *   - **Server_Sequence order only.** Pages are ordered strictly by
 *     Server_Sequence; client/wall-clock timestamps never define feed order
 *     (Requirement 12.5, 12.6, 19.9).
 *   - **Opaque authenticated cursors.** A continuation cursor is an opaque,
 *     integrity-protected token bound to the Tenant, Authenticated_Subject,
 *     Team_Space, Source_Binding, filter/query, and the fixed High_Water_Mark,
 *     plus the last-emitted position. A cursor from another authorization scope
 *     or a tampered cursor yields a non-disclosing cursor error and no data
 *     (Requirement 12.7, 12.8, 19.5, 19.10).
 *   - **Reauthorize every page.** The caller supplies a `reauthorize` predicate
 *     that is evaluated BEFORE each page (including the first). If authorization
 *     changed mid-walk, the next page is denied without returning protected
 *     records (Requirement 12.8, 19.10).
 *   - **Bounded page size.** The default page size is 50 and the maximum is 200
 *     (Requirement 19.3); a caller request is clamped into that range.
 *
 * This module reads only; the repository owns the transactional writes. The feed
 * rows and the Team_Space sequence counter it walks are exactly the ones the
 * repository commits atomically per accepted mutation.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { forbidden, notFound } from './errors'
import {
  CollaborationAccessPatterns,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE
} from './access-patterns'
import { sequenceCounterKey, type SpaceScope } from './keys'
import type { TransactionalRecordStore } from './record-store'
import type { ChangeFeedKind, ServerSequence } from './repository-types'

// Re-export the shared page-size bounds so feed consumers import them from here.
// Both originate in `access-patterns`; the barrel's `export *` dedupes the
// identical re-export.
export { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE }

/**
 * The full authorization + query scope a synchronization walk is bound to. The
 * cursor is bound to exactly these fields, so a cursor minted for one scope can
 * never be replayed against another (Requirement 19.5, 19.10).
 */
export interface FeedScope {
  tenantId: string
  /** The Authenticated_Subject's Entra object id (never a client actor field). */
  subjectObjectId: string
  spaceId: string
  sourceBindingId: string
}

/** A Change_Feed item as returned to a synchronizing client. */
export interface ChangeFeedItem {
  serverSequence: ServerSequence
  kind: ChangeFeedKind
  objectId: string
  /** Safe projection only; never carries protected content (Requirement 19.13). */
  safeProjection: Record<string, unknown>
}

/**
 * One synchronization page. `nextCursor` is present only when another page
 * exists through the fixed `highWaterMark` (Requirement 19.4, 19.5). When it is
 * `undefined`, the walk through the mark is complete and the client may advance
 * its persisted Synchronization_Cursor to `highWaterMark` (Requirement 19.6).
 */
export interface ChangeFeedPage {
  items: ChangeFeedItem[]
  /** The fixed Server_Sequence this whole walk is bounded by. */
  highWaterMark: ServerSequence
  /** Opaque continuation cursor, or `undefined` when the walk is complete. */
  nextCursor?: string
}

/** A parsed query filter for a synchronization walk. Kept minimal and stable. */
export interface FeedQuery {
  /** Optional filter to a subset of change kinds. Order is normalized. */
  kinds?: ChangeFeedKind[]
}

/**
 * Storage port for feed reads. Deliberately narrow: the feed service needs only
 * the current Team_Space sequence (to fix a High_Water_Mark) and an ordered,
 * scan-free slice of feed rows. Implementations are the in-memory store (tests)
 * and a DynamoDB-backed store using the `queryChangeFeed` access pattern.
 */
export interface ChangeFeedStore {
  /**
   * The current Team_Space Server_Sequence — the value the sequence counter
   * holds now. Zero when nothing has been written yet.
   */
  readCurrentSequence(scope: SpaceScope): Promise<ServerSequence>
  /**
   * Ordered feed rows with `exclusiveStart < serverSequence <= highWaterMark`,
   * in ascending Server_Sequence order, limited to `limit` rows. Never a scan.
   */
  readFeedSlice(
    scope: SpaceScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<ChangeFeedItem[]>
}

/**
 * The reauthorization predicate the feed service runs before every page. It
 * returns `true` while the caller is still authorized for this exact scope. A
 * `false` result denies the next page with a non-disclosing `forbidden`
 * (Requirement 12.8, 19.10). The service passes the walk's `FeedScope` so the
 * predicate can re-evaluate current membership/containment (task 2.3).
 */
export type FeedReauthorize = (scope: FeedScope) => Promise<boolean> | boolean

/** Options for a synchronization walk. */
export interface StartSyncOptions {
  /** Exclusive lower bound: the client's persisted cursor position. Default 0. */
  fromSequence?: ServerSequence
  /** Requested page size; clamped to `[1, MAX_PAGE_SIZE]`. Default 50. */
  pageSize?: number
  /** Optional query filter. Bound into the cursor so continuations match. */
  query?: FeedQuery
}

// ---------------------------------------------------------------------------
// Opaque authenticated cursor codec.
// ---------------------------------------------------------------------------

/** The state a cursor carries. It is signed, never encrypted; it holds no secrets. */
interface CursorState {
  /** Cursor format version, so the encoding can evolve compatibly. */
  v: 1
  tenantId: string
  subjectObjectId: string
  spaceId: string
  sourceBindingId: string
  /** The fixed High_Water_Mark the whole walk is bounded by. */
  highWaterMark: ServerSequence
  /** Exclusive start for the NEXT page (the last emitted Server_Sequence). */
  position: ServerSequence
  /** Requested page size, carried so continuations keep the same size. */
  pageSize: number
  /** Normalized query fingerprint, so a continuation cannot widen the query. */
  queryKey: string
}

const CURSOR_VERSION = 1 as const

/**
 * Encodes/decodes opaque authenticated continuation cursors. The cursor is a
 * base64url `payload.signature` where the signature is an HMAC-SHA256 over the
 * canonical payload using a server-held key. Decoding verifies the signature in
 * constant time, so a client cannot forge or mutate a cursor to widen its scope,
 * jump the High_Water_Mark, or read another Team_Space (Requirement 19.5,
 * 19.10, 12.8).
 */
export class FeedCursorCodec {
  private readonly key: Buffer

  constructor(signingKey: string | Buffer) {
    if (!signingKey || signingKey.length === 0) {
      throw new Error('a non-empty cursor signing key is required')
    }
    this.key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(signingKey, 'utf8')
  }

  encode(state: CursorState): string {
    const payload = base64UrlEncode(Buffer.from(canonicalJson(state), 'utf8'))
    const signature = this.sign(payload)
    return `${payload}.${signature}`
  }

  /**
   * Decode and verify a cursor. Returns `null` for any malformed, tampered, or
   * badly-signed cursor. The caller turns `null` into a non-disclosing cursor
   * error; this method itself never throws for hostile input.
   */
  decode(cursor: string): CursorState | null {
    if (typeof cursor !== 'string') return null
    const dot = cursor.indexOf('.')
    if (dot <= 0 || dot === cursor.length - 1) return null
    const payload = cursor.slice(0, dot)
    const signature = cursor.slice(dot + 1)
    if (!this.verify(payload, signature)) return null
    let parsed: unknown
    try {
      parsed = JSON.parse(base64UrlDecode(payload).toString('utf8'))
    } catch {
      return null
    }
    return isCursorState(parsed) ? parsed : null
  }

  private sign(payload: string): string {
    return base64UrlEncode(createHmac('sha256', this.key).update(payload).digest())
  }

  private verify(payload: string, signature: string): boolean {
    const expected = Buffer.from(this.sign(payload))
    const actual = Buffer.from(signature)
    if (expected.length !== actual.length) return false
    return timingSafeEqual(expected, actual)
  }
}

// ---------------------------------------------------------------------------
// Feed service.
// ---------------------------------------------------------------------------

/**
 * Reads a Team_Space Change_Feed as fixed-high-water, Server_Sequence-ordered,
 * scope-bound pages behind opaque authenticated cursors.
 */
export class CollaborationFeedService {
  constructor(
    private readonly store: ChangeFeedStore,
    private readonly codec: FeedCursorCodec
  ) {}

  /**
   * Begin a synchronization walk. Captures a fixed High_Water_Mark (the current
   * Team_Space Server_Sequence) and returns the first ordered page after the
   * client's persisted cursor position (Requirement 19.3, 19.4). Reauthorizes
   * before returning the page (Requirement 12.8, 19.10).
   */
  async startSync(
    scope: FeedScope,
    reauthorize: FeedReauthorize,
    options: StartSyncOptions = {}
  ): Promise<ChangeFeedPage> {
    const pageSize = clampPageSize(options.pageSize)
    const from = normalizeSequence(options.fromSequence ?? 0)
    const queryKey = normalizeQueryKey(options.query)

    // Fix the High_Water_Mark ONCE for the whole walk.
    const highWaterMark = normalizeSequence(await this.store.readCurrentSequence(spaceScope(scope)))

    return this.emitPage(scope, reauthorize, {
      v: CURSOR_VERSION,
      tenantId: scope.tenantId,
      subjectObjectId: scope.subjectObjectId,
      spaceId: scope.spaceId,
      sourceBindingId: scope.sourceBindingId,
      highWaterMark,
      position: from,
      pageSize,
      queryKey
    })
  }

  /**
   * Follow a continuation cursor. The cursor's bound scope must match the
   * caller's live scope AND the caller must still be authorized; otherwise a
   * non-disclosing cursor error is returned with no data (Requirement 12.7,
   * 12.8, 19.5, 19.10).
   */
  async continueSync(
    scope: FeedScope,
    reauthorize: FeedReauthorize,
    cursor: string
  ): Promise<ChangeFeedPage> {
    const state = this.codec.decode(cursor)
    // A cursor that fails to decode, or is bound to a different authorization
    // scope, is indistinguishable from "not found": no data, no disclosure.
    if (!state || !cursorMatchesScope(state, scope)) {
      throw notFound('The requested collaboration resource was not found.')
    }
    return this.emitPage(scope, reauthorize, state)
  }

  /**
   * Emit exactly one ordered page for `state`, reauthorizing first.
   *
   * A page's *contents* are the query-matching rows; its *boundary* is a real
   * Server_Sequence position in the feed. When a filter is active, matching rows
   * can be sparse, so a single bounded slice may not fill a page. We therefore
   * walk forward slice-by-slice until we collect a full page of matching rows OR
   * reach the fixed High_Water_Mark. The next cursor's position is the last
   * Server_Sequence we actually *scanned* (not merely the last emitted match),
   * so a continuation never re-reads or skips rows even when the filter drops
   * most of them (Requirement 12.7, 24.16).
   */
  private async emitPage(
    scope: FeedScope,
    reauthorize: FeedReauthorize,
    state: CursorState
  ): Promise<ChangeFeedPage> {
    // Reauthorize BEFORE every page, including the first (Requirement 12.8,
    // 19.10). A denial returns no protected records.
    if (!(await reauthorize(scope))) {
      throw forbidden('You do not have access to this collaboration resource.')
    }

    // Nothing to read at/under the fixed mark: an immediately complete walk.
    if (state.position >= state.highWaterMark) {
      return { items: [], highWaterMark: state.highWaterMark }
    }

    const space = spaceScope(scope)
    const matched: ChangeFeedItem[] = []
    // The exclusive lower bound we scan from; advances as we consume slices.
    let scanFrom = state.position
    // The last Server_Sequence we have actually observed while scanning.
    let scannedThrough = state.position

    // Read the feed in bounded slices until we have a full page of matches or we
    // exhaust the fixed mark. Each slice is capped at MAX_PAGE_SIZE by the
    // access pattern, so this stays scan-free and bounded per round-trip.
    while (matched.length <= state.pageSize && scannedThrough < state.highWaterMark) {
      const slice = await this.store.readFeedSlice(
        space,
        scanFrom,
        state.highWaterMark,
        MAX_PAGE_SIZE
      )
      if (slice.length === 0) {
        // No more rows through the mark; we have observed everything up to it.
        break
      }
      // Defensive ordering guard: never rely blindly on store order.
      slice.sort((a, b) => a.serverSequence - b.serverSequence)

      for (const row of slice) {
        scannedThrough = Math.max(scannedThrough, row.serverSequence)
        if (queryMatches(row, state.queryKey)) {
          matched.push(row)
          // Stop as soon as we have one more than a page so we can tell there is
          // a following page and set the cursor to this row's position.
          if (matched.length > state.pageSize) break
        }
      }
      scanFrom = slice[slice.length - 1]!.serverSequence
    }

    // If we collected more than a page, the extra match marks a following page:
    // trim to a page and continue from that last emitted match's position.
    if (matched.length > state.pageSize) {
      const items = matched.slice(0, state.pageSize)
      const lastEmitted = items[items.length - 1]!.serverSequence
      const nextCursor = this.codec.encode({ ...state, position: lastEmitted })
      return { items, highWaterMark: state.highWaterMark, nextCursor }
    }

    // Otherwise we scanned through the fixed mark and this is the final page.
    return { items: matched, highWaterMark: state.highWaterMark }
  }
}

// ---------------------------------------------------------------------------
// In-memory feed store for tests / local development.
// ---------------------------------------------------------------------------

/**
 * A deterministic in-memory {@link ChangeFeedStore}. It models the feed rows and
 * per-space sequence counter the repository writes, so feed reads can be tested
 * without DynamoDB. Rows are stored per space and always read back in ascending
 * Server_Sequence order.
 */
export class InMemoryChangeFeedStore implements ChangeFeedStore {
  private readonly spaces = new Map<string, Map<number, ChangeFeedItem>>()
  private readonly counters = new Map<string, number>()

  /** Append a feed row at `serverSequence` (as the repository would). */
  append(scope: SpaceScope, item: ChangeFeedItem): void {
    const k = spaceKey(scope)
    const rows = this.spaces.get(k) ?? new Map<number, ChangeFeedItem>()
    rows.set(item.serverSequence, { ...item })
    this.spaces.set(k, rows)
    this.counters.set(k, Math.max(this.counters.get(k) ?? 0, item.serverSequence))
  }

  async readCurrentSequence(scope: SpaceScope): Promise<ServerSequence> {
    return this.counters.get(spaceKey(scope)) ?? 0
  }

  async readFeedSlice(
    scope: SpaceScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<ChangeFeedItem[]> {
    const rows = this.spaces.get(spaceKey(scope))
    if (!rows) return []
    const out: ChangeFeedItem[] = []
    for (const item of rows.values()) {
      if (item.serverSequence > exclusiveStart && item.serverSequence <= highWaterMark) {
        out.push({ ...item })
      }
    }
    out.sort((a, b) => a.serverSequence - b.serverSequence)
    return out.slice(0, Math.max(0, limit))
  }
}

// ---------------------------------------------------------------------------
// DynamoDB-backed feed store.
// ---------------------------------------------------------------------------

/**
 * A {@link ChangeFeedStore} over the dedicated Cloud_Record_Store. The current
 * Server_Sequence is the value of the Team_Space sequence counter (read
 * strongly consistent through the shared {@link TransactionalRecordStore} so a
 * just-committed mutation is visible). Feed slices use the scan-free
 * `queryChangeFeed` access-pattern descriptor (`access-patterns.ts`), so this
 * store never scans (Requirement 7.11, 7.12, 19.3).
 */
export class DynamoChangeFeedStore implements ChangeFeedStore {
  private readonly access: CollaborationAccessPatterns

  constructor(
    private readonly client: DynamoDBClient,
    private readonly recordStore: TransactionalRecordStore,
    tableName: string
  ) {
    this.access = new CollaborationAccessPatterns(tableName)
  }

  async readCurrentSequence(scope: SpaceScope): Promise<ServerSequence> {
    const counter = await this.recordStore.get(sequenceCounterKey(scope))
    return counter ? normalizeSequence(Number(counter.value)) : 0
  }

  async readFeedSlice(
    scope: SpaceScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<ChangeFeedItem[]> {
    if (highWaterMark <= exclusiveStart || limit <= 0) return []
    // The descriptor caps `limit` at MAX_PAGE_SIZE; the feed service only ever
    // requests pageSize+1 (<= 201), which the +1 detection row tolerates.
    const descriptor = this.access.queryChangeFeed(scope, exclusiveStart, highWaterMark, limit)
    const response = await this.client.send(
      new QueryCommand({
        TableName: descriptor.tableName,
        KeyConditionExpression: descriptor.keyConditionExpression,
        ExpressionAttributeNames: descriptor.expressionAttributeNames,
        ExpressionAttributeValues: descriptor.expressionAttributeValues as Record<string, never>,
        ConsistentRead: descriptor.consistentRead,
        ScanIndexForward: descriptor.scanIndexForward,
        Limit: descriptor.limit
      })
    )
    const rows = (response.Items ?? []).map((raw) => unmarshall(raw))
    return rows.map(toChangeFeedItem)
  }
}

function toChangeFeedItem(row: Record<string, unknown>): ChangeFeedItem {
  return {
    serverSequence: normalizeSequence(Number(row.serverSequence)),
    kind: row.kind as ChangeFeedKind,
    objectId: String(row.objectId),
    safeProjection: (row.safeProjection as Record<string, unknown>) ?? {}
  }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

function spaceScope(scope: FeedScope): SpaceScope {
  return { tenantId: scope.tenantId, spaceId: scope.spaceId }
}

function spaceKey(scope: SpaceScope): string {
  return canonicalJson({ tenantId: scope.tenantId, spaceId: scope.spaceId })
}

/** Clamp a requested page size into `[1, MAX_PAGE_SIZE]`, defaulting to 50. */
function clampPageSize(requested?: number): number {
  if (typeof requested !== 'number' || !Number.isFinite(requested)) return DEFAULT_PAGE_SIZE
  const floored = Math.floor(requested)
  if (floored < 1) return 1
  return Math.min(floored, MAX_PAGE_SIZE)
}

function normalizeSequence(value: number): ServerSequence {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}

/**
 * A stable fingerprint of the query filter. Order-independent so `[a,b]` and
 * `[b,a]` bind to the same cursor; an empty/absent filter is the sentinel
 * `"*"` meaning "all kinds". A continuation therefore cannot widen a query.
 */
function normalizeQueryKey(query?: FeedQuery): string {
  const kinds = query?.kinds
  if (!kinds || kinds.length === 0) return '*'
  const unique = Array.from(new Set(kinds)).sort()
  return unique.join(',')
}

/** Whether one feed row satisfies the normalized query fingerprint. */
function queryMatches(item: ChangeFeedItem, queryKey: string): boolean {
  if (queryKey === '*') return true
  return queryKey.split(',').includes(item.kind)
}

/** A cursor binds to exactly one authorization + query scope. */
function cursorMatchesScope(state: CursorState, scope: FeedScope): boolean {
  return (
    state.tenantId === scope.tenantId &&
    state.subjectObjectId === scope.subjectObjectId &&
    state.spaceId === scope.spaceId &&
    state.sourceBindingId === scope.sourceBindingId
  )
}

function isCursorState(value: unknown): value is CursorState {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.v === CURSOR_VERSION &&
    typeof v.tenantId === 'string' &&
    typeof v.subjectObjectId === 'string' &&
    typeof v.spaceId === 'string' &&
    typeof v.sourceBindingId === 'string' &&
    typeof v.highWaterMark === 'number' &&
    typeof v.position === 'number' &&
    typeof v.pageSize === 'number' &&
    typeof v.queryKey === 'string'
  )
}

/** Deterministic JSON with sorted keys, so signatures/fingerprints are stable. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const inner = (value as Record<string, unknown>)[k]
      if (inner !== undefined) out[k] = sortValue(inner)
    }
    return out
  }
  return value
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64UrlDecode(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4))
  return Buffer.from(normalized + pad, 'base64')
}
