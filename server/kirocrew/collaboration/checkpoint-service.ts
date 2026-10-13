/**
 * Shared Investigations — Checkpoint, Handoff, and continuation domain services
 * (task 9.2).
 *
 * Owner: Ghostv2 collaboration domain and Object_Store integration.
 *
 * Two services back the API's `publishCheckpoint` write and `readHandoff` read
 * (declared as ports in `api-runtime.ts`, task 9.1):
 *
 *   - {@link CheckpointService} publishes an IMMUTABLE cited Checkpoint
 *     candidate. It validates every citation against authorized Ready Artifacts
 *     and durable Events in the SAME Investigation (Requirement 12.1), stores
 *     the detailed document in the Object_Store, and appends the candidate row +
 *     Change_Feed entry atomically at a fresh Server_Sequence. A candidate is
 *     never rewritten; publishing another candidate (or a conflicting retry)
 *     PRESERVES every existing candidate (Requirement 12.2, 12.4).
 *
 *   - {@link HandoffService} assembles the Handoff a continuing Operator
 *     receives: the Selected_Checkpoint, its Coverage_Watermark, the Events
 *     newer than that watermark up to a FIXED High_Water_Mark, and the first
 *     paginated Evidence_Index page, with continuation cursors bound to the
 *     fixed mark and authorization scope (Requirement 12.5-12.8, 16.1).
 *
 * Selecting a candidate as the shared Handoff is an expected-Revision metadata
 * update owned by `patchInvestigation` (task 3.3) via `selectedCheckpointId`; a
 * stale Revision there preserves every candidate and returns a conflict
 * (Requirement 12.3, 12.4). This module supplies the candidate that selection
 * points at and the read that consumes it.
 *
 * Requirements: 12.1-12.12, 16.1, 16.2.
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { conflict, notFound, validationFailed } from './errors'
import {
  changeFeedKey,
  checkpointKey,
  idempotencyKey,
  sequenceCounterKey,
  type InvestigationScope,
  type SpaceScope
} from './keys'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './access-patterns'
import type { CheckpointDocumentStore } from './checkpoint-document-store'
import type {
  StoredRecord,
  TransactionalRecordStore,
  TransactionOp
} from './record-store'
import { TransactionConflictError } from './record-store'
import type {
  CommandContext,
  IdempotencyRecord,
  ServerSequence,
  Sha256Hex
} from './repository-types'
import type {
  CheckpointAck,
  CheckpointContent,
  CheckpointRecord,
  EvidenceIndexEntry,
  HandoffEvent,
  HandoffOptions,
  HandoffView,
  PublishCheckpointCommand
} from './checkpoint-types'

/** How many times a Server_Sequence allocation conflict is retried. */
const DEFAULT_MAX_SEQUENCE_RETRIES = 8

/** Injectable clock + id generator keep the service deterministic in tests. */
export interface CheckpointClock {
  now(): Date
  newCheckpointId(): string
  /** The opaque Object_Store document identifier for a Checkpoint. */
  newCheckpointDocumentId(): string
}

const defaultClock: CheckpointClock = {
  now: () => new Date(),
  newCheckpointId: () => `cp-${randomUUID()}`,
  newCheckpointDocumentId: () => `cpd-${randomUUID()}`
}

/**
 * The read surface Checkpoint publication needs to validate citations: does an
 * Event / Ready Artifact with a given id exist IN THIS Investigation? Kept
 * narrow so the service is storage-neutral and unit-testable. The production
 * implementation reads the strongly consistent Investigation partition; the
 * in-memory implementation is used by tests.
 */
export interface CitationReadPort {
  /** True iff a durable Event with `eventId` exists in this Investigation. */
  hasEvent(scope: InvestigationScope, eventId: string): Promise<boolean>
  /** True iff a READY Artifact with `artifactId` exists in this Investigation. */
  hasReadyArtifact(scope: InvestigationScope, artifactId: string): Promise<boolean>
}

/**
 * The read surface Handoff assembly needs. All reads are scope-contained by the
 * `InvestigationScope` the handler built from the authorized principal, and the
 * page contents are already reauthorized upstream.
 */
export interface HandoffReadPort {
  /** Strong metadata read: revision + selected Checkpoint id, or null. */
  getInvestigation(
    scope: InvestigationScope
  ): Promise<{ revision: number; selectedCheckpointId?: string } | null>
  /** Read one Checkpoint candidate record, or null. */
  getCheckpoint(scope: InvestigationScope, checkpointId: string): Promise<CheckpointRecord | null>
  /** The current Team_Space Server_Sequence (fixes the High_Water_Mark). */
  currentSequence(scope: SpaceScope): Promise<ServerSequence>
  /**
   * Events with `exclusiveStart < serverSequence <= highWaterMark`, ascending,
   * limited to `limit`. Never a scan.
   */
  eventsAfter(
    scope: InvestigationScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<HandoffEvent[]>
  /**
   * Ready Artifacts (the Evidence_Index) whose ready Server_Sequence is
   * `> exclusiveStart` and `<= highWaterMark`, ascending, limited to `limit`.
   */
  readyArtifactsAfter(
    scope: InvestigationScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    limit: number
  ): Promise<Array<EvidenceIndexEntry & { serverSequence: ServerSequence }>>
}

// ---------------------------------------------------------------------------
// CheckpointService — publish immutable cited candidates.
// ---------------------------------------------------------------------------

export class CheckpointService {
  constructor(
    private readonly store: TransactionalRecordStore,
    private readonly documents: CheckpointDocumentStore,
    private readonly citations: CitationReadPort,
    private readonly clock: CheckpointClock = defaultClock,
    private readonly maxSequenceRetries: number = DEFAULT_MAX_SEQUENCE_RETRIES
  ) {}

  /**
   * Publish an immutable Checkpoint candidate (Requirement 12.2). The flow:
   *   1. Idempotent replay by Operation_ID (same payload replays; a different
   *      payload for a used Operation_ID conflicts without a second candidate).
   *   2. Validate every citation against authorized Ready Artifacts / durable
   *      Events IN THIS Investigation (Requirement 12.1). A citation that does
   *      not resolve fails validation and NOTHING is written.
   *   3. Write the detailed document to the Object_Store (write-once).
   *   4. Append the immutable candidate row + Change_Feed entry + idempotency
   *      record atomically at a fresh Server_Sequence, capturing the
   *      Coverage_Watermark (Requirement 12.9).
   *
   * A conflict at any point preserves every existing candidate: candidates are
   * append-only and are never rewritten or removed (Requirement 12.4).
   */
  async publishCheckpoint(
    ctx: CommandContext,
    command: PublishCheckpointCommand
  ): Promise<CheckpointAck> {
    const scope: SpaceScope = { tenantId: ctx.tenantId, spaceId: ctx.spaceId }
    const invScope: InvestigationScope = { ...scope, investigationId: command.investigationId }

    const content = normalizeContent(command)
    const citedEventIds = uniqueSorted(command.citedEventIds)
    const citedArtifactIds = uniqueSorted(command.citedArtifactIds)

    const payloadHash = canonicalHash({
      kind: 'publish-checkpoint',
      investigationId: command.investigationId,
      runId: command.runId ?? null,
      content,
      citedEventIds,
      citedArtifactIds,
      author: ctx.author,
      gatewayId: ctx.gatewayId
    })

    // 1) Idempotent replay by Operation_ID (Requirement 7.6 shape). A prior
    //    identical publish returns its ack; a different payload conflicts
    //    without disturbing the existing candidate.
    const prior = await this.readIdempotency(invScope, command.operationId)
    if (prior) {
      if (prior.payloadHash !== payloadHash) {
        throw conflict('This operation was already used for a different checkpoint.')
      }
      return prior.responseProjection as unknown as CheckpointAck
    }

    // 2) Validate citations against authorized Ready Artifacts / durable Events
    //    in the SAME Investigation. A dangling citation is a validation failure;
    //    no candidate is written (Requirement 12.1).
    await this.validateCitations(invScope, citedEventIds, citedArtifactIds)

    // 3) Store the detailed Checkpoint document in the Object_Store (write-once).
    const documentArtifactId = this.clock.newCheckpointDocumentId()
    await this.documents.put(invScope, documentArtifactId, content)

    // 4) Append the immutable candidate atomically at a fresh Server_Sequence.
    return this.withSequenceRetry(scope, async (sequence, expectedCurrent) => {
      const checkpointId = this.clock.newCheckpointId()
      const nowIso = this.clock.now().toISOString()
      // The Coverage_Watermark is the Server_Sequence this candidate covers:
      // the sequence at which it is accepted (Requirement 12.9).
      const coverageWatermark = sequence

      const record: CheckpointRecord = {
        checkpointId,
        investigationId: command.investigationId,
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        runId: command.runId,
        author: ctx.author,
        currentQuestion: content.currentQuestion,
        citedEventIds,
        citedArtifactIds,
        coverageWatermark,
        documentArtifactId,
        serverSequence: sequence,
        operationId: command.operationId,
        createdAt: nowIso
      }

      const ack: CheckpointAck = {
        operationId: command.operationId,
        checkpointId,
        acceptedServerSequence: sequence,
        coverageWatermark,
        objectId: checkpointId
      }

      const ops: TransactionOp[] = [
        this.counterOp(scope, expectedCurrent, sequence),
        // The immutable candidate row (putIfAbsent: a fresh id, never rewritten).
        { op: 'putIfAbsent', id: 'checkpoint', item: this.checkpointItem(invScope, record) },
        // Change_Feed entry at the accepted sequence.
        this.changeFeedOp(scope, sequence, checkpointId, {
          checkpointId,
          investigationId: command.investigationId,
          coverageWatermark
        }),
        // Idempotency record keyed by Operation_ID.
        this.idempotencyOp(invScope, command.operationId, payloadHash, ack)
      ]

      try {
        await this.store.transactWrite({ ops })
        return ack
      } catch (error) {
        if (error instanceof TransactionConflictError) {
          // A concurrent op used our Operation_ID first: replay it. Any existing
          // candidate is preserved (Requirement 12.4).
          const replay = await this.readIdempotency(invScope, command.operationId)
          if (replay) {
            if (replay.payloadHash !== payloadHash) {
              throw conflict('This operation was already used for a different checkpoint.')
            }
            return replay.responseProjection as unknown as CheckpointAck
          }
        }
        throw error
      }
    })
  }

  /**
   * Every cited id MUST resolve to an authorized Ready Artifact or a durable
   * Event in this Investigation (Requirement 12.1). The first dangling citation
   * fails validation; no candidate is written and no existing candidate is
   * disturbed. The denial is non-disclosing (it does not reveal which citation
   * or whether the id exists elsewhere).
   */
  private async validateCitations(
    scope: InvestigationScope,
    citedEventIds: string[],
    citedArtifactIds: string[]
  ): Promise<void> {
    for (const eventId of citedEventIds) {
      if (!(await this.citations.hasEvent(scope, eventId))) {
        throw validationFailed('A checkpoint citation could not be resolved in this investigation.')
      }
    }
    for (const artifactId of citedArtifactIds) {
      if (!(await this.citations.hasReadyArtifact(scope, artifactId))) {
        throw validationFailed('A checkpoint citation could not be resolved in this investigation.')
      }
    }
  }

  // -- transactional helpers (mirror the CollaborationRepository patterns) ----

  private async withSequenceRetry<T>(
    scope: SpaceScope,
    attempt: (sequence: ServerSequence, expectedCurrent: number) => Promise<T>
  ): Promise<T> {
    let lastError: unknown
    for (let i = 0; i < this.maxSequenceRetries; i++) {
      const current = await this.readCounter(scope)
      const next = current + 1
      try {
        return await attempt(next, current)
      } catch (error) {
        if (error instanceof TransactionConflictError && error.reason === 'counter') {
          lastError = error
          continue
        }
        throw error
      }
    }
    throw lastError ?? new TransactionConflictError('counter')
  }

  private counterOp(scope: SpaceScope, expectedCurrent: number, next: number): TransactionOp {
    return {
      op: 'incrementCounter',
      id: 'sequence',
      key: sequenceCounterKey(scope),
      expectedCurrent,
      next
    }
  }

  private changeFeedOp(
    scope: SpaceScope,
    sequence: ServerSequence,
    objectId: string,
    safeProjection: Record<string, unknown>
  ): TransactionOp {
    const key = changeFeedKey(scope, sequence)
    return {
      op: 'putIfAbsent',
      id: `feed-${sequence}`,
      item: {
        pk: key.pk,
        sk: key.sk,
        recordType: 'change-feed',
        tenantId: scope.tenantId,
        spaceId: scope.spaceId,
        serverSequence: sequence,
        kind: 'checkpoint',
        objectId,
        safeProjection
      }
    }
  }

  private idempotencyOp(
    scope: InvestigationScope,
    operationId: string,
    payloadHash: Sha256Hex,
    ack: CheckpointAck
  ): TransactionOp {
    const key = idempotencyKey(scope, operationId)
    const record: IdempotencyRecord = {
      tenantId: scope.tenantId,
      spaceId: scope.spaceId,
      operationId,
      payloadHash,
      statusCode: 201,
      responseProjection: ack as unknown as Record<string, unknown>,
      acceptedServerSequence: ack.acceptedServerSequence
    }
    return {
      op: 'putIfAbsent',
      id: 'idempotency',
      item: { pk: key.pk, sk: key.sk, recordType: 'idempotency', ...record } as StoredRecord
    }
  }

  private checkpointItem(scope: InvestigationScope, record: CheckpointRecord): StoredRecord {
    const key = checkpointKey(scope, record.checkpointId)
    return { pk: key.pk, sk: key.sk, recordType: 'checkpoint', ...record } as StoredRecord
  }

  private async readCounter(scope: SpaceScope): Promise<number> {
    const found = await this.store.get(sequenceCounterKey(scope))
    return found ? Number(found.value) : 0
  }

  private async readIdempotency(
    scope: InvestigationScope,
    operationId: string
  ): Promise<IdempotencyRecord | null> {
    const found = await this.store.get(idempotencyKey(scope, operationId))
    if (!found) return null
    return found as unknown as IdempotencyRecord
  }
}

// ---------------------------------------------------------------------------
// HandoffService — selected Checkpoint + watermark + newer Events + Evidence.
// ---------------------------------------------------------------------------

/** State a Handoff continuation cursor carries. Signed, never encrypted. */
interface HandoffCursorState {
  v: 1
  tenantId: string
  spaceId: string
  investigationId: string
  /** The fixed High_Water_Mark the whole Handoff read is bounded by. */
  highWaterMark: ServerSequence
  /** Which stream this cursor continues. */
  stream: 'events' | 'evidence'
  /** Exclusive start for the NEXT page (last emitted Server_Sequence). */
  position: ServerSequence
  pageSize: number
}

const HANDOFF_CURSOR_VERSION = 1 as const

/**
 * Opaque authenticated Handoff continuation cursor. Bound to the Tenant,
 * Team_Space, Investigation, the fixed High_Water_Mark, and the stream so a
 * cursor from another scope or a tampered cursor is rejected non-disclosingly
 * (Requirement 12.7, 12.8).
 */
export class HandoffCursorCodec {
  private readonly key: Buffer

  constructor(signingKey: string | Buffer) {
    if (!signingKey || signingKey.length === 0) {
      throw new Error('a non-empty handoff cursor signing key is required')
    }
    this.key = Buffer.isBuffer(signingKey) ? signingKey : Buffer.from(signingKey, 'utf8')
  }

  encode(state: HandoffCursorState): string {
    const payload = base64UrlEncode(Buffer.from(canonicalJson(state), 'utf8'))
    return `${payload}.${this.sign(payload)}`
  }

  decode(cursor: string): HandoffCursorState | null {
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
    return isHandoffCursorState(parsed) ? parsed : null
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

export class HandoffService {
  constructor(
    private readonly reads: HandoffReadPort,
    private readonly codec: HandoffCursorCodec
  ) {}

  /**
   * Assemble the Handoff for a continuing Operator. Captures a FIXED
   * High_Water_Mark once (the current Team_Space Server_Sequence), returns the
   * Selected_Checkpoint + its Coverage_Watermark, the first page of Events newer
   * than that watermark up to the fixed mark, and the first Evidence_Index page.
   * A `null` result means the Investigation is unknown / off-scope (the handler
   * turns it into a non-disclosing not-found).
   */
  async readHandoff(scope: InvestigationScope, options: HandoffOptions = {}): Promise<HandoffView | null> {
    const meta = await this.reads.getInvestigation(scope)
    if (!meta) return null

    const highWaterMark = normalizeSequence(
      await this.reads.currentSequence({ tenantId: scope.tenantId, spaceId: scope.spaceId })
    )

    let selectedCheckpoint: CheckpointRecord | null = null
    if (meta.selectedCheckpointId) {
      selectedCheckpoint = await this.reads.getCheckpoint(scope, meta.selectedCheckpointId)
      if (!selectedCheckpoint) {
        // The selected Checkpoint became unavailable (e.g. deleted). Stop
        // startup rather than assembling a Handoff that cites nothing
        // (Requirement 16.9); the handler surfaces the current outcome.
        return null
      }
    }

    const coverageWatermark = selectedCheckpoint ? selectedCheckpoint.coverageWatermark : 0
    const eventPageSize = clampPageSize(options.eventPageSize)
    const evidencePageSize = clampPageSize(options.evidencePageSize)

    // Events newer than the Coverage_Watermark, up to the fixed mark.
    const eventPage = await this.readEventPage(scope, coverageWatermark, highWaterMark, eventPageSize)
    // First Evidence_Index page, up to the fixed mark.
    const evidencePage = await this.readEvidencePage(scope, 0, highWaterMark, evidencePageSize)

    return {
      investigationId: scope.investigationId,
      revision: meta.revision,
      selectedCheckpoint,
      coverageWatermark,
      highWaterMark,
      newerEvents: eventPage.items,
      newerEventsCursor: eventPage.nextCursor
        ? this.codec.encode({
            v: HANDOFF_CURSOR_VERSION,
            tenantId: scope.tenantId,
            spaceId: scope.spaceId,
            investigationId: scope.investigationId,
            highWaterMark,
            stream: 'events',
            position: eventPage.nextCursor,
            pageSize: eventPageSize
          })
        : undefined,
      evidenceIndex: evidencePage.items,
      evidenceIndexCursor: evidencePage.nextCursor
        ? this.codec.encode({
            v: HANDOFF_CURSOR_VERSION,
            tenantId: scope.tenantId,
            spaceId: scope.spaceId,
            investigationId: scope.investigationId,
            highWaterMark,
            stream: 'evidence',
            position: evidencePage.nextCursor,
            pageSize: evidencePageSize
          })
        : undefined
    }
  }

  /**
   * Follow a Handoff continuation cursor. The cursor's bound scope must match
   * the caller's live scope; otherwise a non-disclosing not-found is returned.
   * Returns the next ordered page for the cursor's stream, without skipping
   * covered records (Requirement 12.7, 12.8).
   */
  async continueHandoff(
    scope: InvestigationScope,
    cursor: string
  ): Promise<
    | { stream: 'events'; items: HandoffEvent[]; highWaterMark: ServerSequence; nextCursor?: string }
    | { stream: 'evidence'; items: EvidenceIndexEntry[]; highWaterMark: ServerSequence; nextCursor?: string }
  > {
    const state = this.codec.decode(cursor)
    if (!state || !cursorMatchesScope(state, scope)) {
      throw notFound('The requested collaboration resource was not found.')
    }
    if (state.stream === 'events') {
      const page = await this.readEventPage(scope, state.position, state.highWaterMark, state.pageSize)
      return {
        stream: 'events',
        items: page.items,
        highWaterMark: state.highWaterMark,
        nextCursor: page.nextCursor
          ? this.codec.encode({ ...state, position: page.nextCursor })
          : undefined
      }
    }
    const page = await this.readEvidencePage(scope, state.position, state.highWaterMark, state.pageSize)
    return {
      stream: 'evidence',
      items: page.items,
      highWaterMark: state.highWaterMark,
      nextCursor: page.nextCursor
        ? this.codec.encode({ ...state, position: page.nextCursor })
        : undefined
    }
  }

  /**
   * Read one Event page. Requests `pageSize + 1` rows so a full page implies a
   * following page; the returned `nextCursor` position is the last EMITTED
   * Server_Sequence, so a continuation never re-reads or skips a row
   * (Requirement 12.7).
   */
  private async readEventPage(
    scope: InvestigationScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    pageSize: number
  ): Promise<{ items: HandoffEvent[]; nextCursor?: ServerSequence }> {
    if (exclusiveStart >= highWaterMark) return { items: [] }
    const rows = await this.reads.eventsAfter(scope, exclusiveStart, highWaterMark, pageSize + 1)
    rows.sort((a, b) => a.serverSequence - b.serverSequence)
    if (rows.length > pageSize) {
      const items = rows.slice(0, pageSize)
      return { items, nextCursor: items[items.length - 1]!.serverSequence }
    }
    return { items: rows }
  }

  /** Read one Evidence_Index page, mirroring {@link readEventPage}. */
  private async readEvidencePage(
    scope: InvestigationScope,
    exclusiveStart: ServerSequence,
    highWaterMark: ServerSequence,
    pageSize: number
  ): Promise<{ items: EvidenceIndexEntry[]; nextCursor?: ServerSequence }> {
    if (exclusiveStart >= highWaterMark) return { items: [] }
    const rows = await this.reads.readyArtifactsAfter(scope, exclusiveStart, highWaterMark, pageSize + 1)
    rows.sort((a, b) => a.serverSequence - b.serverSequence)
    if (rows.length > pageSize) {
      const page = rows.slice(0, pageSize)
      const nextCursor = page[page.length - 1]!.serverSequence
      return { items: page.map(stripSequence), nextCursor }
    }
    return { items: rows.map(stripSequence) }
  }
}

// ---------------------------------------------------------------------------
// Helpers.
// ---------------------------------------------------------------------------

/** Resolve the structured Checkpoint content from the command (Requirement 12.1). */
function normalizeContent(command: PublishCheckpointCommand): CheckpointContent {
  if (command.content) {
    const currentQuestion = command.content.currentQuestion || command.summary || ''
    return { ...command.content, currentQuestion }
  }
  return { currentQuestion: command.summary ?? '' }
}

/** Dedupe + sort a citation id list so the payload hash is order-independent. */
function uniqueSorted(values?: string[]): string[] {
  if (!values || values.length === 0) return []
  return Array.from(new Set(values)).sort()
}

function stripSequence(
  entry: EvidenceIndexEntry & { serverSequence: ServerSequence }
): EvidenceIndexEntry {
  const { serverSequence: _ignored, ...rest } = entry
  return rest
}

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

function cursorMatchesScope(state: HandoffCursorState, scope: InvestigationScope): boolean {
  return (
    state.tenantId === scope.tenantId &&
    state.spaceId === scope.spaceId &&
    state.investigationId === scope.investigationId
  )
}

function isHandoffCursorState(value: unknown): value is HandoffCursorState {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.v === HANDOFF_CURSOR_VERSION &&
    typeof v.tenantId === 'string' &&
    typeof v.spaceId === 'string' &&
    typeof v.investigationId === 'string' &&
    typeof v.highWaterMark === 'number' &&
    (v.stream === 'events' || v.stream === 'evidence') &&
    typeof v.position === 'number' &&
    typeof v.pageSize === 'number'
  )
}

/** Stable lowercase SHA-256 over a canonical JSON payload. */
function canonicalHash(payload: unknown): Sha256Hex {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k]
      if (v !== undefined) out[k] = sortValue(v)
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
