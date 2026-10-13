/**
 * Shared Investigations — Investigation creation-recovery, Run, Event, search,
 * and subject read operations (task 3.5).
 *
 * Owner: Ghostv2 collaboration repository/services.
 *
 * Task 3.3 (`repository.ts`) owns the transactional *write* rules: default-first
 * subject reservation, explicit-new creation, current-contributor Run
 * reservation, immutable Event append, expected-Revision metadata updates, and
 * the atomic Creation_Operation_Lookup / check-finished uniqueness records. This
 * module owns the *read* side that those writes are meant to serve — the
 * "Timeline and Handoff readers" of the design's CollaborationRepository /
 * Capture_Adapters sections — on top of the scope-contained keys (`keys.ts`) and
 * the scan-free access-pattern descriptors (`access-patterns.ts`):
 *
 *   - **Strong metadata reads.** One Investigation's metadata is a strongly
 *     consistent direct read; the Change_Feed and strong direct reads are the
 *     authoritative synchronization state (Requirement 7.11, 10.14, 10.15).
 *   - **Subject search.** All Investigations for one *live* subject resolve
 *     through the stable Subject_Reference pointer rows — never the mutable
 *     display label — as a Query, never a Scan (Requirement 6.10, 7.12, 10.18).
 *   - **Active / archived browsing.** A Team_Space's active or archived
 *     Investigations are browsed by recency through the `InvestigationBrowse`
 *     GSI (Requirement 7.12, 10.18).
 *   - **Immutable append reads.** The ordered Event timeline for one
 *     Investigation is read in Server_Sequence order; client timestamps never
 *     define order (Requirement 7.10, 19.1, 19.2).
 *   - **Check_ID pairing at a fixed read High_Water_Mark.** check-started and
 *     check-finished Events are paired ONLY within the same Investigation by
 *     Check_ID — never by adjacency, timestamps, or Run ordering. A start is
 *     `incomplete` when no matching accepted finish exists at or below the fixed
 *     read High_Water_Mark; a finish that lands later becomes visible only in a
 *     later read boundary (Requirement 14.1, 14.10, 24.11).
 *   - **Pre-ID creation recovery.** A Team_Space-scoped Creation_Operation_Lookup
 *     is resolved by `(Tenant, Team_Space, Operation_ID)` before an Investigation
 *     ID is known, returning the original acknowledgement for a matching
 *     canonical payload, a conflict for a mismatch, and no second creation while
 *     unresolved (Requirement 10.16, 14.14, 24.6, 24.26).
 *
 * This module reads only. It never scans, never widens scope, and never defines
 * synchronization order from anything but the Server_Sequence the repository
 * assigned at write time.
 */

import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { CollaborationAccessPatterns } from './access-patterns'
import {
  investigationMetaKey,
  sequenceCounterKey,
  type InvestigationScope,
  type SpaceScope
} from './keys'
import type { TransactionalRecordStore } from './record-store'
import type { SubjectReference } from './subject'
import type {
  CreationResolution,
  EventRecord,
  EventType,
  InvestigationRecord,
  RunRecord,
  ServerSequence,
  Sha256Hex
} from './repository-types'

// ---------------------------------------------------------------------------
// Read projections returned to callers.
// ---------------------------------------------------------------------------

/** A compact Investigation summary for subject search / browse lists. */
export interface InvestigationSummary {
  investigationId: string
  primarySubject: SubjectReference
  stageId: string
  archived: boolean
  revision: number
  updatedAt: string
  lastMutationSequence: ServerSequence
}

/**
 * One paired check as evaluated at a fixed read High_Water_Mark.
 *
 * `status`:
 *   - `complete`   — a matching accepted finish exists at or below the mark.
 *   - `incomplete` — a start exists but no matching accepted finish at or below
 *     the mark. A later finish only surfaces in a later read boundary.
 *
 * Pairing is by `(Investigation_ID, Check_ID)` only. `startSequence` /
 * `finishSequence` are Server_Sequences, never timestamps.
 */
export interface CheckPairing {
  checkId: string
  status: 'complete' | 'incomplete'
  startEventId: string
  startSequence: ServerSequence
  finishEventId?: string
  finishSequence?: ServerSequence
}

/**
 * A timeline read bounded by one fixed read High_Water_Mark. `events` is the
 * ordered immutable append; `checks` is the Check_ID pairing evaluated against
 * that same fixed mark.
 */
export interface TimelineRead {
  investigationId: string
  highWaterMark: ServerSequence
  events: EventRecord[]
  checks: CheckPairing[]
}

// ---------------------------------------------------------------------------
// Read store port.
// ---------------------------------------------------------------------------

/**
 * Storage port for collaboration reads. Deliberately narrow and expressed only
 * in terms of the documented scan-free access patterns, so the query rules can
 * be unit-tested against an in-memory store exactly as the feed service is.
 */
export interface CollaborationReadStore {
  /** Strongly consistent direct read of one Investigation's metadata. */
  getInvestigation(scope: InvestigationScope): Promise<InvestigationRecord | null>
  /** The current Team_Space Server_Sequence (the fixed read High_Water_Mark). */
  readCurrentSequence(scope: SpaceScope): Promise<ServerSequence>
  /** All Investigations for one stable subject (subject-pointer Query, no scan). */
  listInvestigationsBySubject(
    scope: SpaceScope,
    subject: SubjectReference
  ): Promise<InvestigationRecord[]>
  /** A Team_Space's active or archived Investigations, most-recent first (GSI Query). */
  browseInvestigations(
    scope: SpaceScope,
    partition: 'active' | 'archived',
    limit?: number
  ): Promise<InvestigationRecord[]>
  /** All Runs in one Investigation. */
  listRuns(scope: InvestigationScope): Promise<RunRecord[]>
  /**
   * The ordered Event timeline for one Investigation at or below `highWaterMark`,
   * in ascending Server_Sequence order. Never a scan; never client-timestamp
   * ordered.
   */
  readTimelineEvents(
    scope: InvestigationScope,
    highWaterMark: ServerSequence
  ): Promise<EventRecord[]>
}

// ---------------------------------------------------------------------------
// Query service.
// ---------------------------------------------------------------------------

/** How a Creation_Operation_Lookup is resolved by the owning repository. */
export interface CreationOperationResolver {
  resolveCreationOperation(
    scope: SpaceScope,
    operationId: string,
    payloadHash: Sha256Hex
  ): Promise<CreationResolution>
}

/**
 * Read-side services for Investigations: strong metadata reads, subject search,
 * active/archived browsing, Run listing, ordered immutable timeline reads with
 * Check_ID pairing at a fixed read High_Water_Mark, and pre-ID creation
 * recovery.
 *
 * Authorization is the caller's concern (task 2.x middleware authorizes list /
 * search / objects / feeds before returning protected content); this service
 * assumes it is only ever invoked for an already-authorized `(Tenant,
 * Team_Space)` scope and reads only within that scope.
 */
export class CollaborationQueryService {
  constructor(
    private readonly store: CollaborationReadStore,
    /**
     * Optional Creation_Operation_Lookup resolver. When wired to the
     * CollaborationRepository, `resolveCreationOperation` recovers a creation by
     * Operation_ID before the Investigation ID is known.
     */
    private readonly creationResolver?: CreationOperationResolver
  ) {}

  /**
   * Read one Investigation's mutable metadata (strong direct read). Returns
   * `null` when it does not exist within the scope; the caller turns that into a
   * non-disclosing not-found (Requirement 4.7, 24.2).
   */
  async getInvestigation(scope: InvestigationScope): Promise<InvestigationRecord | null> {
    return this.store.getInvestigation(scope)
  }

  /**
   * Find every Investigation for one *live* subject. Resolution is by the stable
   * Subject_Reference `(Source_Binding, source type, Stable_Source_ID)` only, so
   * a changed `displayLabel` still returns the same subject's Investigations
   * (Requirement 6.10, 10.18). Results are most-recent first.
   */
  async findInvestigationsBySubject(
    scope: SpaceScope,
    subject: SubjectReference
  ): Promise<InvestigationSummary[]> {
    const records = await this.store.listInvestigationsBySubject(scope, subject)
    return records.map(toSummary).sort(byRecencyDesc)
  }

  /**
   * Browse a Team_Space's active (default) or archived Investigations, ordered
   * by recency (Requirement 10.18). Active and archived are disjoint views; an
   * archived Investigation never appears in the active list and vice versa.
   */
  async browseInvestigations(
    scope: SpaceScope,
    options: { archived?: boolean; limit?: number } = {}
  ): Promise<InvestigationSummary[]> {
    const partition = options.archived ? 'archived' : 'active'
    const records = await this.store.browseInvestigations(scope, partition, options.limit)
    return records.map(toSummary).sort(byRecencyDesc)
  }

  /** List the Runs of one Investigation (current-contributor and teammate Runs). */
  async listRuns(scope: InvestigationScope): Promise<RunRecord[]> {
    const runs = await this.store.listRuns(scope)
    return runs.slice().sort((a, b) => a.serverSequence - b.serverSequence)
  }

  /**
   * Read one Investigation's immutable Event timeline bounded by a fixed read
   * High_Water_Mark, together with the Check_ID pairing evaluated against that
   * same mark.
   *
   * The High_Water_Mark is captured ONCE (the current Team_Space Server_Sequence)
   * so the whole read is a consistent boundary: a start with no matching finish
   * at or below the mark is `incomplete`, regardless of any finish that lands at
   * a higher sequence afterward. A later call captures a higher mark and can
   * then observe that finish (Requirement 14.10, 24.11).
   */
  async readTimeline(scope: InvestigationScope): Promise<TimelineRead> {
    const highWaterMark = await this.store.readCurrentSequence(scope)
    const events = await this.store.readTimelineEvents(scope, highWaterMark)
    const ordered = events.slice().sort((a, b) => a.serverSequence - b.serverSequence)
    return {
      investigationId: scope.investigationId,
      highWaterMark,
      events: ordered,
      checks: pairChecks(ordered)
    }
  }

  /**
   * Resolve a creation acknowledgement by Operation_ID before the client knows
   * the Investigation ID (Requirement 10.16, 14.14, 24.6, 24.26). Returns the
   * original acknowledgement for a matching canonical payload, `conflict` for a
   * payload mismatch, and `unresolved` while no creation has committed — so a
   * retry never triggers a second creation while unresolved.
   */
  async resolveCreationOperation(
    scope: SpaceScope,
    operationId: string,
    payloadHash: Sha256Hex
  ): Promise<CreationResolution> {
    if (!this.creationResolver) {
      throw new Error('CollaborationQueryService was constructed without a creation resolver')
    }
    return this.creationResolver.resolveCreationOperation(scope, operationId, payloadHash)
  }
}

// ---------------------------------------------------------------------------
// Check_ID pairing.
// ---------------------------------------------------------------------------

const CHECK_STARTED: EventType = 'check-started'
const CHECK_FINISHED: EventType = 'check-finished'

/**
 * Pair check-started / check-finished Events by `(Check_ID)` within one
 * Investigation's already-scope-contained, Server_Sequence-ordered timeline.
 *
 * Rules (Requirement 14.1, 14.10, 24.11):
 *   - Pairing is by Check_ID only. Adjacency, timestamps, and Run ordering never
 *     pair a start with a finish.
 *   - Because the caller only passes events at or below the fixed read
 *     High_Water_Mark, a start with no matching finish in this slice is
 *     `incomplete` by construction; a finish above the mark simply is not here.
 *   - A finish with no earlier start in this slice is ignored for pairing: a
 *     finish is only meaningful as the completion of a start (its uniqueness is
 *     enforced at write time by the repository).
 *   - The first accepted finish for a Check_ID completes it; the repository's
 *     `(Investigation_ID, Check_ID)` uniqueness guarantees an identical retry
 *     appends nothing, so at most one finish per Check_ID exists here anyway.
 *
 * The returned pairings preserve start order (ascending Server_Sequence).
 */
export function pairChecks(orderedEvents: EventRecord[]): CheckPairing[] {
  const starts = new Map<string, EventRecord>()
  const finishes = new Map<string, EventRecord>()

  for (const event of orderedEvents) {
    if (!event.checkId) continue
    if (event.type === CHECK_STARTED) {
      // Keep the earliest start for a Check_ID; a repeated start does not change
      // the pairing key.
      if (!starts.has(event.checkId)) starts.set(event.checkId, event)
    } else if (event.type === CHECK_FINISHED) {
      // Keep the earliest accepted finish for a Check_ID.
      if (!finishes.has(event.checkId)) finishes.set(event.checkId, event)
    }
  }

  const pairings: CheckPairing[] = []
  for (const [checkId, start] of starts) {
    const finish = finishes.get(checkId)
    if (finish) {
      pairings.push({
        checkId,
        status: 'complete',
        startEventId: start.eventId,
        startSequence: start.serverSequence,
        finishEventId: finish.eventId,
        finishSequence: finish.serverSequence
      })
    } else {
      pairings.push({
        checkId,
        status: 'incomplete',
        startEventId: start.eventId,
        startSequence: start.serverSequence
      })
    }
  }

  // Preserve start order so a reader can render checks in the order work began.
  return pairings.sort((a, b) => a.startSequence - b.startSequence)
}

// ---------------------------------------------------------------------------
// Projection + ordering helpers.
// ---------------------------------------------------------------------------

function toSummary(record: InvestigationRecord): InvestigationSummary {
  return {
    investigationId: record.investigationId,
    primarySubject: record.primarySubject,
    stageId: record.stageId,
    archived: record.archived,
    revision: record.revision,
    updatedAt: record.updatedAt,
    lastMutationSequence: record.lastMutationSequence
  }
}

/** Most-recently updated first; ties broken by Investigation id for stability. */
function byRecencyDesc(a: InvestigationSummary, b: InvestigationSummary): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1
  return a.investigationId < b.investigationId ? 1 : -1
}

// ---------------------------------------------------------------------------
// In-memory read store for tests / local development.
// ---------------------------------------------------------------------------

function scopeKey(scope: SpaceScope): string {
  return `${scope.tenantId}\u0000${scope.spaceId}`
}

function invKey(scope: InvestigationScope): string {
  return `${scopeKey(scope)}\u0000${scope.investigationId}`
}

function subjectKey(subject: SubjectReference): string {
  return `${subject.sourceBindingId}\u0000${subject.sourceType}\u0000${subject.stableSourceId}`
}

/**
 * A deterministic in-memory {@link CollaborationReadStore}. It models exactly the
 * scope-contained rows the repository writes (Investigation metadata, subject
 * pointers, Runs, ordered Events, and the per-space sequence counter) so the
 * query rules can be tested without DynamoDB — the same approach as
 * {@link InMemoryChangeFeedStore}. Nothing here scans across scopes.
 */
export class InMemoryCollaborationReadStore implements CollaborationReadStore {
  private readonly investigations = new Map<string, InvestigationRecord>()
  private readonly subjectIndex = new Map<string, Set<string>>()
  private readonly runs = new Map<string, RunRecord[]>()
  private readonly events = new Map<string, EventRecord[]>()
  private readonly counters = new Map<string, number>()

  /** Seed / update an Investigation's metadata (as an accepted mutation would). */
  putInvestigation(scope: SpaceScope, record: InvestigationRecord): void {
    const inv: InvestigationScope = { ...scope, investigationId: record.investigationId }
    this.investigations.set(invKey(inv), { ...record })
    const sk = `${scopeKey(scope)}\u0000${subjectKey(record.primarySubject)}`
    const set = this.subjectIndex.get(sk) ?? new Set<string>()
    set.add(record.investigationId)
    this.subjectIndex.set(sk, set)
    this.bumpSequence(scope, record.lastMutationSequence)
  }

  /** Append a Run (as `reserveRun` would). */
  addRun(scope: SpaceScope, run: RunRecord): void {
    const inv: InvestigationScope = { ...scope, investigationId: run.investigationId }
    const list = this.runs.get(invKey(inv)) ?? []
    list.push({ ...run })
    this.runs.set(invKey(inv), list)
    this.bumpSequence(scope, run.serverSequence)
  }

  /** Append an immutable Event (as `appendEvent` would). */
  addEvent(scope: SpaceScope, event: EventRecord): void {
    const inv: InvestigationScope = { ...scope, investigationId: event.investigationId }
    const list = this.events.get(invKey(inv)) ?? []
    list.push({ ...event })
    this.events.set(invKey(inv), list)
    this.bumpSequence(scope, event.serverSequence)
  }

  private bumpSequence(scope: SpaceScope, sequence: ServerSequence): void {
    const k = scopeKey(scope)
    this.counters.set(k, Math.max(this.counters.get(k) ?? 0, sequence))
  }

  async getInvestigation(scope: InvestigationScope): Promise<InvestigationRecord | null> {
    const found = this.investigations.get(invKey(scope))
    return found ? { ...found } : null
  }

  async readCurrentSequence(scope: SpaceScope): Promise<ServerSequence> {
    return this.counters.get(scopeKey(scope)) ?? 0
  }

  async listInvestigationsBySubject(
    scope: SpaceScope,
    subject: SubjectReference
  ): Promise<InvestigationRecord[]> {
    const sk = `${scopeKey(scope)}\u0000${subjectKey(subject)}`
    const ids = this.subjectIndex.get(sk)
    if (!ids) return []
    const out: InvestigationRecord[] = []
    for (const id of ids) {
      const record = this.investigations.get(`${scopeKey(scope)}\u0000${id}`)
      if (record) out.push({ ...record })
    }
    return out
  }

  async browseInvestigations(
    scope: SpaceScope,
    partition: 'active' | 'archived',
    limit?: number
  ): Promise<InvestigationRecord[]> {
    const wantArchived = partition === 'archived'
    const out: InvestigationRecord[] = []
    for (const record of this.investigations.values()) {
      if (record.tenantId !== scope.tenantId || record.spaceId !== scope.spaceId) continue
      if (record.archived !== wantArchived) continue
      out.push({ ...record })
    }
    out.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    return typeof limit === 'number' ? out.slice(0, Math.max(0, limit)) : out
  }

  async listRuns(scope: InvestigationScope): Promise<RunRecord[]> {
    return (this.runs.get(invKey(scope)) ?? []).map((r) => ({ ...r }))
  }

  async readTimelineEvents(
    scope: InvestigationScope,
    highWaterMark: ServerSequence
  ): Promise<EventRecord[]> {
    return (this.events.get(invKey(scope)) ?? [])
      .filter((e) => e.serverSequence <= highWaterMark)
      .sort((a, b) => a.serverSequence - b.serverSequence)
      .map((e) => ({ ...e }))
  }
}

// ---------------------------------------------------------------------------
// DynamoDB-backed read store.
// ---------------------------------------------------------------------------

/**
 * A {@link CollaborationReadStore} over the dedicated Cloud_Record_Store. Every
 * read uses a scan-free access-pattern descriptor (`access-patterns.ts`); the
 * current Server_Sequence is read strongly consistent through the shared
 * {@link TransactionalRecordStore} so a just-committed mutation is visible to its
 * own reader (Requirement 7.11, 7.12).
 */
export class DynamoCollaborationReadStore implements CollaborationReadStore {
  private readonly access: CollaborationAccessPatterns

  constructor(
    private readonly client: DynamoDBClient,
    private readonly recordStore: TransactionalRecordStore,
    tableName: string
  ) {
    this.access = new CollaborationAccessPatterns(tableName)
  }

  async getInvestigation(scope: InvestigationScope): Promise<InvestigationRecord | null> {
    const found = await this.recordStore.get(investigationMetaKey(scope))
    return found ? (found as unknown as InvestigationRecord) : null
  }

  async readCurrentSequence(scope: SpaceScope): Promise<ServerSequence> {
    const counter = await this.recordStore.get(sequenceCounterKey(scope))
    return counter ? normalizeSequence(Number(counter.value)) : 0
  }

  async listInvestigationsBySubject(
    scope: SpaceScope,
    subject: SubjectReference
  ): Promise<InvestigationRecord[]> {
    // Subject-pointer rows carry the Investigation id; resolve each pointer to
    // its metadata with a strong direct read so a changed label still returns
    // the same subject's Investigations.
    const pointers = await this.runQuery(this.access.queryInvestigationsBySubject(scope, subject))
    const out: InvestigationRecord[] = []
    for (const pointer of pointers) {
      const investigationId = pointer.investigationId
      if (typeof investigationId !== 'string') continue
      const meta = await this.getInvestigation({ ...scope, investigationId })
      if (meta) out.push(meta)
    }
    return out
  }

  async browseInvestigations(
    scope: SpaceScope,
    partition: 'active' | 'archived',
    limit?: number
  ): Promise<InvestigationRecord[]> {
    const rows = await this.runQuery(
      this.access.browseInvestigations(scope, partition, { limit })
    )
    return rows as unknown as InvestigationRecord[]
  }

  async listRuns(scope: InvestigationScope): Promise<RunRecord[]> {
    const rows = await this.runQuery(this.access.queryRuns(scope))
    return rows as unknown as RunRecord[]
  }

  async readTimelineEvents(
    scope: InvestigationScope,
    highWaterMark: ServerSequence
  ): Promise<EventRecord[]> {
    if (highWaterMark <= 0) return []
    // Read the ordered timeline from the very first sequence (exclusive 0) up to
    // and including the fixed read High_Water_Mark.
    const rows = await this.runQuery(
      this.access.queryTimelineBetween(scope, 0, highWaterMark)
    )
    return (rows as unknown as EventRecord[])
      .filter((e) => e.serverSequence <= highWaterMark)
      .sort((a, b) => a.serverSequence - b.serverSequence)
  }

  private async runQuery(descriptor: {
    tableName: string
    indexName?: string
    keyConditionExpression: string
    expressionAttributeNames: Record<string, string>
    expressionAttributeValues: Record<string, unknown>
    consistentRead: boolean
    scanIndexForward: boolean
    limit?: number
  }): Promise<Array<Record<string, unknown>>> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: descriptor.tableName,
        IndexName: descriptor.indexName,
        KeyConditionExpression: descriptor.keyConditionExpression,
        ExpressionAttributeNames: descriptor.expressionAttributeNames,
        ExpressionAttributeValues: descriptor.expressionAttributeValues as Record<string, never>,
        ConsistentRead: descriptor.consistentRead,
        ScanIndexForward: descriptor.scanIndexForward,
        Limit: descriptor.limit
      })
    )
    return (response.Items ?? []).map((raw) => unmarshall(raw))
  }
}

function normalizeSequence(value: number): ServerSequence {
  if (!Number.isFinite(value) || value < 0) return 0
  return Math.floor(value)
}
