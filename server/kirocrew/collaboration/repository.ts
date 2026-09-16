/**
 * Shared Investigations — CollaborationRepository command handlers (task 3.3).
 *
 * Owner: Ghostv2 CollaborationRepository / domain command handlers.
 *
 * This module owns the durable-mutation *rules* on top of the scope-contained
 * keys (`keys.ts`), the indexed read descriptors (`access-patterns.ts`), and a
 * storage-engine-neutral {@link TransactionalRecordStore} (`record-store.ts`).
 * Every accepted mutation commits ALL of the following in one all-or-nothing
 * transaction (Requirement 7.3):
 *
 *   - the domain change (Investigation / Run / Event row);
 *   - an Event where the command produces one (Requirement 7.3);
 *   - a Change_Feed entry at the accepted Server_Sequence (Requirement 7.3, 19.3);
 *   - an Idempotency_Record keyed by Operation_ID (Requirement 7.3, 7.6);
 *   - the next Team_Space Server_Sequence via a conditional counter increment
 *     (Requirement 7.3, 7.5);
 *   - the specialized creation / check records the command requires
 *     (Creation_Operation_Lookup, `(Investigation_ID, Check_ID)` finish
 *     uniqueness) (Requirement 10.16, 10.17, 14.14).
 *
 * Concurrency and recovery semantics implemented here:
 *   - Operation_ID idempotency: the same Operation_ID + same payload returns the
 *     prior acknowledgement without a second Event; a different payload conflicts
 *     without applying the new payload (Requirement 7.6, 7.7, 24.8).
 *   - Default-first convergence: simultaneous default starts on one subject
 *     resolve to the SAME first Investigation via a conditional subject pointer;
 *     explicit-new creations stay separate (Requirement 14.2-14.4, 24.6).
 *   - Pre-ID creation recovery: every creation writes a Team_Space
 *     Creation_Operation_Lookup so a client that never learned the Investigation
 *     ID recovers by `(Tenant, Team_Space, Operation_ID)` (Requirement 14.14,
 *     10.16, 24.6, 24.8, 24.26).
 *   - Check-finished uniqueness: one finish payload per
 *     `(Investigation_ID, Check_ID)`; identical retry replays, a different
 *     payload conflicts, without a duplicate Event (Requirement 10.16, 10.17).
 *   - Sequence-allocation conflict retry: an internal counter collision retries
 *     with the UNCHANGED Operation_ID and payload (Requirement 7.4).
 *   - Expected-Revision metadata updates: a stale Revision returns a conflict
 *     with no state change (Requirement 7.8, 7.9, 12.3, 12.4).
 */

import { createHash, randomUUID } from 'node:crypto'
import { conflict, payloadMismatch, revisionConflict } from './errors'
import {
  changeFeedKey,
  checkFinishKey,
  creationOperationKey,
  eventKey,
  idempotencyKey,
  investigationMetaKey,
  runKey,
  sequenceCounterKey,
  subjectPointerKey,
  type InvestigationScope,
  type SpaceScope
} from './keys'
import { investigationBrowseAttributes } from './access-patterns'
import type { SubjectReference } from './subject'
import type {
  StoredRecord,
  TransactionalRecordStore,
  TransactionOp
} from './record-store'
import { TransactionConflictError } from './record-store'
import type {
  AppendEventCommand,
  CommandContext,
  CreateInvestigationCommand,
  CreationOperationLookupRecord,
  CreationResolution,
  EventRecord,
  IdempotencyRecord,
  InvestigationAck,
  InvestigationRecord,
  MutationAck,
  PatchInvestigationCommand,
  ReserveRunCommand,
  RunRecord,
  ServerSequence,
  Sha256Hex,
  WorkflowPolicyResolver
} from './repository-types'
import { evaluateStageTransition, type SelectedCheckpointState } from './workflow-transitions'

/** How many times a Server_Sequence allocation conflict is retried. */
const DEFAULT_MAX_SEQUENCE_RETRIES = 8

/** Injectable clock + id generators keep the repository deterministic in tests. */
export interface RepositoryClock {
  now(): Date
  newInvestigationId(): string
  newRunId(): string
  newEventId(): string
}

const defaultClock: RepositoryClock = {
  now: () => new Date(),
  newInvestigationId: () => `inv-${randomUUID()}`,
  newRunId: () => `run-${randomUUID()}`,
  newEventId: () => `evt-${randomUUID()}`
}

/** Stable lowercase SHA-256 over a canonical JSON payload. */
export function canonicalPayloadHash(payload: unknown): Sha256Hex {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex')
}

/** Deterministic JSON: object keys sorted, arrays in order, `undefined` dropped. */
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

/** Stable string form of a Subject_Reference identity (never the label). */
function subjectIdentity(subject: SubjectReference): string {
  return canonicalJson({
    sourceBindingId: subject.sourceBindingId,
    sourceType: subject.sourceType,
    stableSourceId: subject.stableSourceId
  })
}

export class CollaborationRepository {
  constructor(
    private readonly store: TransactionalRecordStore,
    private readonly clock: RepositoryClock = defaultClock,
    private readonly maxSequenceRetries: number = DEFAULT_MAX_SEQUENCE_RETRIES,
    /**
     * Optional pinned-workflow policy (task 11.1). When provided, a metadata
     * update that changes Stage is evaluated against the Investigation's pinned
     * Workflow_Profile version and completion requires a selected ready
     * Checkpoint (Requirements 18.5, 18.6, 18.7, 24.17). When omitted, Stage
     * updates are applied without the pinned-transition gate — used by callers
     * that have not wired a Workflow_Profile source yet.
     */
    private readonly workflowPolicy?: WorkflowPolicyResolver
  ) {}

  // -------------------------------------------------------------------------
  // Investigation creation (default-first + explicit-new) with pre-ID recovery
  // -------------------------------------------------------------------------

  /**
   * Reserve a default-first or explicit-new Investigation idempotently.
   *
   * default-first: a subject-level conditional pointer (`putIfAbsent`) makes
   * simultaneous first-starts converge on one Investigation; a later default
   * start returns that same Investigation. explicit-new: a fresh Investigation
   * every time, still idempotent by Operation_ID.
   *
   * Every creation writes a Team_Space Creation_Operation_Lookup so a lost
   * response can be recovered before the Investigation ID is known.
   */
  async createInvestigation(
    ctx: CommandContext,
    command: CreateInvestigationCommand
  ): Promise<InvestigationAck> {
    const scope: SpaceScope = { tenantId: ctx.tenantId, spaceId: ctx.spaceId }
    const payloadHash = canonicalPayloadHash({
      kind: 'create-investigation',
      mode: command.mode,
      primarySubject: subjectIdentity(command.primarySubject),
      relatedSubjects: (command.relatedSubjects ?? []).map(subjectIdentity),
      workflowProfileId: command.workflowProfileId,
      workflowVersion: command.workflowVersion,
      stageId: command.stageId
    })

    // 1) Idempotent replay by Operation_ID (Requirement 7.6, 24.8). The
    //    Creation_Operation_Lookup is the authoritative pre-ID record.
    const priorLookup = await this.readCreationLookup(scope, command.operationId)
    if (priorLookup) {
      if (priorLookup.payloadHash !== payloadHash) {
        throw conflict('This operation was already used for a different creation.')
      }
      return priorLookup.responseProjection
    }

    // 2) For default-first, a prior default Investigation for the same subject
    //    means we converge on it rather than creating a second one
    //    (Requirement 14.2, 14.3, 24.6).
    if (command.mode === 'default-first') {
      const existing = await this.readDefaultSubjectPointer(scope, command.primarySubject)
      if (existing) {
        return existing.responseProjection
      }
    }

    // 3) Allocate a Server_Sequence and attempt the atomic creation, retrying
    //    only on an internal sequence-allocation conflict with the SAME
    //    Operation_ID / payload (Requirement 7.4).
    return this.withSequenceRetry(scope, async (sequence, expectedCurrent) => {
      const investigationId = this.clock.newInvestigationId()
      const invScope: InvestigationScope = { ...scope, investigationId }
      const nowIso = this.clock.now().toISOString()

      const ack: InvestigationAck = {
        operationId: command.operationId,
        investigationId,
        revision: 0,
        acceptedServerSequence: sequence
      }

      const investigation: InvestigationRecord = {
        investigationId,
        tenantId: ctx.tenantId,
        spaceId: ctx.spaceId,
        primarySubject: command.primarySubject,
        relatedSubjects: command.relatedSubjects,
        workflowProfileId: command.workflowProfileId,
        workflowVersion: command.workflowVersion,
        stageId: command.stageId,
        revision: 0,
        archived: false,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastMutationSequence: sequence
      }

      const ops: TransactionOp[] = [
        this.counterOp(scope, expectedCurrent, sequence),
        // The Investigation row. New id => putIfAbsent is effectively a put, but
        // keeping the guard makes an accidental id reuse fail loudly.
        {
          op: 'putIfAbsent',
          id: 'investigation',
          item: this.investigationItem(invScope, investigation)
        },
        // Change_Feed entry at the accepted sequence.
        this.changeFeedOp(scope, sequence, 'investigation', investigationId, {
          investigationId,
          stageId: command.stageId,
          archived: false
        }),
        // Idempotency record keyed by Operation_ID.
        this.idempotencyOp(scope, command.operationId, payloadHash, {
          statusCode: 201,
          responseProjection: ack as unknown as Record<string, unknown>,
          acceptedServerSequence: sequence,
          acceptedRevision: 0
        }),
        // Team_Space Creation_Operation_Lookup for pre-ID recovery.
        this.creationLookupOp(scope, command.operationId, {
          tenantId: ctx.tenantId,
          spaceId: ctx.spaceId,
          operationId: command.operationId,
          payloadHash,
          investigationId,
          responseProjection: ack,
          acceptedServerSequence: sequence,
          acceptedRevision: 0
        })
      ]

      // default-first: a conditional subject pointer converges simultaneous
      // first-starts. If the pointer already exists, the transaction fails and
      // we resolve to the winner rather than creating a duplicate.
      if (command.mode === 'default-first') {
        ops.push({
          op: 'putIfAbsent',
          id: 'subject-pointer',
          item: this.defaultSubjectPointerItem(scope, command.primarySubject, ack)
        })
      }

      try {
        await this.store.transactWrite({ ops })
        return ack
      } catch (error) {
        if (error instanceof TransactionConflictError) {
          // A subject-pointer collision means a concurrent default-first won.
          // Resolve to that winner rather than treating it as a sequence retry.
          if (command.mode === 'default-first') {
            const winner = await this.readDefaultSubjectPointer(scope, command.primarySubject)
            if (winner) return winner.responseProjection
          }
          // Or a concurrent op used our Operation_ID first: return its result.
          const replay = await this.readCreationLookup(scope, command.operationId)
          if (replay) {
            if (replay.payloadHash !== payloadHash) {
              throw conflict('This operation was already used for a different creation.')
            }
            return replay.responseProjection
          }
        }
        throw error
      }
    })
  }

  /**
   * Resolve a creation acknowledgement by Operation_ID before the client knows
   * the Investigation ID (Requirement 14.14, 10.16, 24.6, 24.26). Returns the
   * original acknowledgement for a matching payload, `conflict` for a payload
   * mismatch, and `unresolved` while no creation has committed.
   */
  async resolveCreationOperation(
    scope: SpaceScope,
    operationId: string,
    payloadHash: Sha256Hex
  ): Promise<CreationResolution> {
    const lookup = await this.readCreationLookup(scope, operationId)
    if (!lookup) return { status: 'unresolved' }
    if (lookup.payloadHash !== payloadHash) return { status: 'conflict' }
    return { status: 'resolved', ack: lookup.responseProjection }
  }

  // -------------------------------------------------------------------------
  // Run reservation
  // -------------------------------------------------------------------------

  /** Idempotently reserve the current contributor's Run (Requirement 14.5). */
  async reserveRun(ctx: CommandContext, command: ReserveRunCommand): Promise<MutationAck> {
    const scope: SpaceScope = { tenantId: ctx.tenantId, spaceId: ctx.spaceId }
    const invScope: InvestigationScope = { ...scope, investigationId: command.investigationId }
    const payloadHash = canonicalPayloadHash({
      kind: 'reserve-run',
      investigationId: command.investigationId,
      parentCheckpointId: command.parentCheckpointId ?? null,
      author: ctx.author,
      gatewayId: ctx.gatewayId
    })

    const replay = await this.replayFromIdempotency(invScope, command.operationId, payloadHash)
    if (replay) return replay

    return this.withSequenceRetry(scope, async (sequence, expectedCurrent) => {
      const runId = this.clock.newRunId()
      const nowIso = this.clock.now().toISOString()
      const run: RunRecord = {
        runId,
        investigationId: command.investigationId,
        author: ctx.author,
        gatewayId: ctx.gatewayId,
        parentCheckpointId: command.parentCheckpointId,
        state: 'active',
        startedAt: nowIso,
        serverSequence: sequence
      }
      const ack: MutationAck = {
        operationId: command.operationId,
        acceptedServerSequence: sequence,
        objectId: runId
      }
      const ops: TransactionOp[] = [
        this.counterOp(scope, expectedCurrent, sequence),
        { op: 'putIfAbsent', id: 'run', item: this.runItem(invScope, run) },
        this.changeFeedOp(scope, sequence, 'run', runId, { runId, investigationId: command.investigationId }),
        this.idempotencyOp(invScope, command.operationId, payloadHash, {
          statusCode: 201,
          responseProjection: ack as unknown as Record<string, unknown>,
          acceptedServerSequence: sequence
        })
      ]
      return this.commitWithReplay(invScope, command.operationId, payloadHash, ops, ack)
    })
  }

  // -------------------------------------------------------------------------
  // Event append (with check-finished uniqueness)
  // -------------------------------------------------------------------------

  /**
   * Append one immutable durable Event (Requirement 7.3, 7.10). A
   * `check-finished` Event additionally enforces `(Investigation_ID, Check_ID)`
   * uniqueness: an identical finish retry replays without a second Event, and a
   * different finish payload for the same Check_ID conflicts
   * (Requirement 10.16, 10.17).
   */
  async appendEvent(ctx: CommandContext, command: AppendEventCommand): Promise<MutationAck> {
    const scope: SpaceScope = { tenantId: ctx.tenantId, spaceId: ctx.spaceId }
    const invScope: InvestigationScope = { ...scope, investigationId: command.investigationId }

    if ((command.type === 'check-started' || command.type === 'check-finished') && !command.checkId) {
      throw conflict('A check event requires a stable Check_ID.')
    }

    const payloadHash = canonicalPayloadHash({
      kind: 'append-event',
      investigationId: command.investigationId,
      type: command.type,
      runId: command.runId ?? null,
      checkId: command.checkId ?? null,
      sourceSubject: command.sourceSubject ? subjectIdentity(command.sourceSubject) : null,
      body: command.body ?? null,
      artifactIds: command.artifactIds ?? [],
      provenance: command.provenance,
      limitations: command.limitations ?? [],
      author: ctx.author,
      gatewayId: ctx.gatewayId
    })

    // Idempotent replay by Operation_ID first (Requirement 7.6).
    const replay = await this.replayFromIdempotency(invScope, command.operationId, payloadHash)
    if (replay) return replay

    // For a finish, resolve an existing uniqueness record before allocating a
    // sequence, so an identical retry (possibly with a different Operation_ID)
    // still replays and a different payload conflicts (Requirement 10.16, 10.17).
    if (command.type === 'check-finished' && command.checkId) {
      const finish = await this.readCheckFinish(invScope, command.checkId)
      if (finish) {
        if (finish.payloadHash !== payloadHash) {
          throw conflict('A different finish is already recorded for this check.')
        }
        return finish.responseProjection
      }
    }

    return this.withSequenceRetry(scope, async (sequence, expectedCurrent) => {
      const eventId = this.clock.newEventId()
      const nowIso = this.clock.now().toISOString()
      const eventRecord: EventRecord = {
        eventId,
        investigationId: command.investigationId,
        runId: command.runId,
        type: command.type,
        checkId: command.checkId,
        sourceSubject: command.sourceSubject,
        author: ctx.author,
        gatewayId: ctx.gatewayId,
        occurredAt: command.occurredAt ?? nowIso,
        receivedAt: nowIso,
        serverSequence: sequence,
        operationId: command.operationId,
        body: command.body,
        artifactIds: command.artifactIds,
        provenance: command.provenance,
        limitations: command.limitations
      }
      const ack: MutationAck = {
        operationId: command.operationId,
        acceptedServerSequence: sequence,
        objectId: eventId
      }
      const ops: TransactionOp[] = [
        this.counterOp(scope, expectedCurrent, sequence),
        { op: 'put', id: 'event', item: this.eventItem(invScope, sequence, eventRecord) },
        this.changeFeedOp(scope, sequence, 'event', eventId, {
          eventId,
          investigationId: command.investigationId,
          type: command.type
        }),
        this.idempotencyOp(invScope, command.operationId, payloadHash, {
          statusCode: 201,
          responseProjection: ack as unknown as Record<string, unknown>,
          acceptedServerSequence: sequence
        })
      ]

      // check-finished uniqueness row: putIfAbsent so a concurrent different
      // finish for the same Check_ID fails the whole transaction.
      if (command.type === 'check-finished' && command.checkId) {
        ops.push({
          op: 'putIfAbsent',
          id: 'check-finish',
          item: this.checkFinishItem(invScope, command.checkId, payloadHash, ack)
        })
      }

      try {
        await this.store.transactWrite({ ops })
        return ack
      } catch (error) {
        if (error instanceof TransactionConflictError) {
          // A concurrent finish for the same Check_ID may have won.
          if (command.type === 'check-finished' && command.checkId) {
            const finish = await this.readCheckFinish(invScope, command.checkId)
            if (finish) {
              if (finish.payloadHash !== payloadHash) {
                throw conflict('A different finish is already recorded for this check.')
              }
              return finish.responseProjection
            }
          }
          // Or our Operation_ID was used by a concurrent op.
          const opReplay = await this.replayFromIdempotency(invScope, command.operationId, payloadHash)
          if (opReplay) return opReplay
        }
        throw error
      }
    })
  }

  // -------------------------------------------------------------------------
  // Mutable metadata update (expected Revision)
  // -------------------------------------------------------------------------

  /**
   * Update mutable Investigation metadata under an expected Revision
   * (Requirement 7.8, 12.3). A stale Revision returns a conflict with no state
   * change (Requirement 7.9, 12.4). Idempotent by Operation_ID.
   */
  async patchInvestigation(
    ctx: CommandContext,
    command: PatchInvestigationCommand
  ): Promise<MutationAck> {
    const scope: SpaceScope = { tenantId: ctx.tenantId, spaceId: ctx.spaceId }
    const invScope: InvestigationScope = { ...scope, investigationId: command.investigationId }
    const payloadHash = canonicalPayloadHash({
      kind: 'patch-investigation',
      investigationId: command.investigationId,
      stageId: command.stageId ?? null,
      leadSubjectId: command.leadSubjectId ?? null,
      selectedCheckpointId: command.selectedCheckpointId ?? null,
      archived: command.archived ?? null
    })

    const replay = await this.replayFromIdempotency(invScope, command.operationId, payloadHash)
    if (replay) return replay

    const current = await this.readInvestigation(invScope)
    if (!current) {
      // Non-disclosing: treat as a conflict rather than revealing existence.
      throw conflict('The Investigation could not be updated.')
    }
    if (current.revision !== command.expectedRevision) {
      // Stale Revision: HTTP 409, no state change (Requirement 7.9, 12.4).
      throw revisionConflict(current.revision)
    }

    // Pinned Workflow_Profile transition + completion gate (task 11.1). Only a
    // Stage change on an unarchived Investigation is evaluated, and only when a
    // Workflow policy is wired. The evaluation uses the Investigation's PINNED
    // version so a later publication cannot change its transition/completion
    // meaning (Requirements 18.5, 18.6, 18.7, 24.17). A rejection throws with a
    // non-disclosing conflict and leaves Stage unchanged (Requirement 18.7).
    if (this.workflowPolicy && command.stageId !== undefined && command.stageId !== current.stageId) {
      if (current.archived) {
        // A Stage change on an archived Investigation is not a workflow move;
        // archive is orthogonal to Stage (Requirement 18.12) and archived work
        // is read-only (Requirement 18.8). Reject without changing state.
        throw conflict('This Investigation is archived and its stage cannot change.')
      }
      const pinned = await this.workflowPolicy.resolve(invScope, current, command)
      if (!pinned) {
        // The pinned version could not be resolved: fail closed rather than
        // applying an unvalidated Stage change.
        throw conflict('The Investigation stage could not be updated.')
      }
      // A completion transition selects the command's Checkpoint when provided,
      // otherwise the Investigation's already-selected Checkpoint.
      const selectsCheckpoint =
        command.selectedCheckpointId !== undefined || current.selectedCheckpointId !== undefined
      const selected: SelectedCheckpointState = !selectsCheckpoint
        ? 'none'
        : pinned.selectedCheckpointReady
          ? 'ready'
          : 'not-ready'
      const outcome = evaluateStageTransition(
        pinned.profile,
        current.stageId,
        command.stageId,
        selected
      )
      if (!outcome.allowed) {
        // All pinned-transition rejections (unknown stage, transition not
        // permitted, or completion without a ready Checkpoint) leave Stage
        // unchanged and disclose only that the request conflicts.
        throw conflict('This stage transition is not permitted for this Investigation.')
      }
    }

    return this.withSequenceRetry(scope, async (sequence, expectedCurrent) => {
      const nowIso = this.clock.now().toISOString()
      const nextRevision = current.revision + 1
      const updated: InvestigationRecord = {
        ...current,
        stageId: command.stageId ?? current.stageId,
        leadSubjectId: command.leadSubjectId ?? current.leadSubjectId,
        selectedCheckpointId: command.selectedCheckpointId ?? current.selectedCheckpointId,
        archived: command.archived ?? current.archived,
        revision: nextRevision,
        updatedAt: nowIso,
        lastMutationSequence: sequence
      }
      const ack: MutationAck = {
        operationId: command.operationId,
        acceptedServerSequence: sequence,
        revision: nextRevision,
        objectId: command.investigationId
      }
      const ops: TransactionOp[] = [
        this.counterOp(scope, expectedCurrent, sequence),
        {
          op: 'updateIfRevision',
          id: 'investigation',
          item: this.investigationItem(invScope, updated),
          expectedRevision: command.expectedRevision
        },
        this.changeFeedOp(scope, sequence, 'investigation', command.investigationId, {
          investigationId: command.investigationId,
          stageId: updated.stageId,
          archived: updated.archived,
          revision: nextRevision
        }),
        this.idempotencyOp(invScope, command.operationId, payloadHash, {
          statusCode: 200,
          responseProjection: ack as unknown as Record<string, unknown>,
          acceptedServerSequence: sequence,
          acceptedRevision: nextRevision
        })
      ]
      try {
        await this.store.transactWrite({ ops })
        return ack
      } catch (error) {
        if (error instanceof TransactionConflictError) {
          // Operation_ID replay (a concurrent identical patch won)...
          const opReplay = await this.replayFromIdempotency(invScope, command.operationId, payloadHash)
          if (opReplay) return opReplay
          // ...otherwise the Revision moved under us: re-read and report stale.
          if (error.reason === 'revision' || error.reason === 'unknown') {
            const latest = await this.readInvestigation(invScope)
            throw revisionConflict(latest?.revision)
          }
        }
        throw error
      }
    })
  }

  // -------------------------------------------------------------------------
  // Sequence allocation + shared plan helpers
  // -------------------------------------------------------------------------

  /**
   * Run `attempt` with a freshly allocated Server_Sequence, retrying only when
   * the counter increment loses to a concurrent allocation (Requirement 7.4,
   * 7.5). The Operation_ID / payload are supplied by the caller and never change
   * across retries.
   */
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
          continue // retry with a re-read counter and the SAME Operation_ID
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
    kind: 'investigation' | 'run' | 'event' | 'checkpoint' | 'artifact' | 'deletion',
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
        kind,
        objectId,
        safeProjection
      }
    }
  }

  private idempotencyOp(
    scope: SpaceScope | InvestigationScope,
    operationId: string,
    payloadHash: Sha256Hex,
    result: {
      statusCode: number
      responseProjection: Record<string, unknown>
      acceptedServerSequence?: ServerSequence
      acceptedRevision?: number
    }
  ): TransactionOp {
    const invScope = this.asInvestigationScope(scope)
    const key = idempotencyKey(invScope, operationId)
    const record: IdempotencyRecord = {
      tenantId: scope.tenantId,
      spaceId: scope.spaceId,
      operationId,
      payloadHash,
      statusCode: result.statusCode,
      responseProjection: result.responseProjection,
      acceptedServerSequence: result.acceptedServerSequence,
      acceptedRevision: result.acceptedRevision
    }
    return {
      op: 'putIfAbsent',
      id: 'idempotency',
      item: { pk: key.pk, sk: key.sk, recordType: 'idempotency', ...record } as StoredRecord
    }
  }

  private creationLookupOp(
    scope: SpaceScope,
    operationId: string,
    record: CreationOperationLookupRecord
  ): TransactionOp {
    const key = creationOperationKey(scope, operationId)
    return {
      op: 'putIfAbsent',
      id: 'creation-lookup',
      item: { pk: key.pk, sk: key.sk, recordType: 'creation-operation', ...record } as StoredRecord
    }
  }

  private defaultSubjectPointerItem(
    scope: SpaceScope,
    subject: SubjectReference,
    ack: InvestigationAck
  ): StoredRecord {
    // The default-first pointer uses a FIXED per-subject identifier ("default")
    // so all default starts for one subject target one row and converge. The
    // subjectPointerKey's investigation slot carries that sentinel, not the id.
    const key = subjectPointerKey(scope, subject, 'default')
    return {
      pk: key.pk,
      sk: key.sk,
      recordType: 'subject-pointer-default',
      tenantId: scope.tenantId,
      spaceId: scope.spaceId,
      investigationId: ack.investigationId,
      responseProjection: ack as unknown as Record<string, unknown>
    }
  }

  private checkFinishItem(
    scope: InvestigationScope,
    checkId: string,
    payloadHash: Sha256Hex,
    ack: MutationAck
  ): StoredRecord {
    const key = checkFinishKey(scope, checkId)
    return {
      pk: key.pk,
      sk: key.sk,
      recordType: 'check-finish',
      tenantId: scope.tenantId,
      spaceId: scope.spaceId,
      investigationId: scope.investigationId,
      checkId,
      payloadHash,
      responseProjection: ack as unknown as Record<string, unknown>
    }
  }

  private investigationItem(scope: InvestigationScope, record: InvestigationRecord): StoredRecord {
    const key = investigationMetaKey(scope)
    const browse = investigationBrowseAttributes({
      scope,
      archived: record.archived,
      updatedAt: record.updatedAt,
      investigationId: record.investigationId
    })
    return {
      pk: key.pk,
      sk: key.sk,
      recordType: 'investigation',
      ...record,
      ...browse
    } as StoredRecord
  }

  private runItem(scope: InvestigationScope, record: RunRecord): StoredRecord {
    const key = runKey(scope, record.runId)
    return { pk: key.pk, sk: key.sk, recordType: 'run', ...record } as StoredRecord
  }

  private eventItem(
    scope: InvestigationScope,
    sequence: ServerSequence,
    record: EventRecord
  ): StoredRecord {
    const key = eventKey(scope, sequence, record.eventId)
    return { pk: key.pk, sk: key.sk, recordType: 'event', ...record } as StoredRecord
  }

  // -------------------------------------------------------------------------
  // Reads used by the handlers
  // -------------------------------------------------------------------------

  private async readCounter(scope: SpaceScope): Promise<number> {
    const found = await this.store.get(sequenceCounterKey(scope))
    return found ? Number(found.value) : 0
  }

  private async readInvestigation(scope: InvestigationScope): Promise<InvestigationRecord | null> {
    const found = await this.store.get(investigationMetaKey(scope))
    if (!found) return null
    return found as unknown as InvestigationRecord
  }

  private async readCreationLookup(
    scope: SpaceScope,
    operationId: string
  ): Promise<CreationOperationLookupRecord | null> {
    const found = await this.store.get(creationOperationKey(scope, operationId))
    if (!found) return null
    return found as unknown as CreationOperationLookupRecord
  }

  private async readDefaultSubjectPointer(
    scope: SpaceScope,
    subject: SubjectReference
  ): Promise<{ investigationId: string; responseProjection: InvestigationAck } | null> {
    const found = await this.store.get(subjectPointerKey(scope, subject, 'default'))
    if (!found) return null
    return {
      investigationId: String(found.investigationId),
      responseProjection: found.responseProjection as unknown as InvestigationAck
    }
  }

  private async readCheckFinish(
    scope: InvestigationScope,
    checkId: string
  ): Promise<{ payloadHash: Sha256Hex; responseProjection: MutationAck } | null> {
    const found = await this.store.get(checkFinishKey(scope, checkId))
    if (!found) return null
    return {
      payloadHash: String(found.payloadHash),
      responseProjection: found.responseProjection as unknown as MutationAck
    }
  }

  private async readIdempotency(
    scope: InvestigationScope,
    operationId: string
  ): Promise<IdempotencyRecord | null> {
    const found = await this.store.get(idempotencyKey(scope, operationId))
    if (!found) return null
    return found as unknown as IdempotencyRecord
  }

  /**
   * Return a prior MutationAck for an Operation_ID when the same payload was
   * already applied (idempotent replay); throw on a payload mismatch
   * (Requirement 7.6, 7.7). Returns null when the operation is new.
   */
  private async replayFromIdempotency(
    scope: InvestigationScope,
    operationId: string,
    payloadHash: Sha256Hex
  ): Promise<MutationAck | null> {
    const prior = await this.readIdempotency(scope, operationId)
    if (!prior) return null
    if (prior.payloadHash !== payloadHash) {
      throw payloadMismatch()
    }
    return (prior.responseProjection ?? { operationId }) as unknown as MutationAck
  }

  /**
   * Commit `ops`; on a conflict, fall back to an Operation_ID replay (a
   * concurrent identical retry won the putIfAbsent) before rethrowing.
   */
  private async commitWithReplay(
    scope: InvestigationScope,
    operationId: string,
    payloadHash: Sha256Hex,
    ops: TransactionOp[],
    ack: MutationAck
  ): Promise<MutationAck> {
    try {
      await this.store.transactWrite({ ops })
      return ack
    } catch (error) {
      if (error instanceof TransactionConflictError) {
        const replay = await this.replayFromIdempotency(scope, operationId, payloadHash)
        if (replay) return replay
      }
      throw error
    }
  }

  private asInvestigationScope(scope: SpaceScope | InvestigationScope): InvestigationScope {
    if ('investigationId' in scope) return scope
    // Operations without an Investigation (creation) key idempotency in the
    // space partition using a sentinel investigation id.
    return { ...scope, investigationId: '_space' }
  }
}

/** Convenience factory over an in-memory store for tests / local development. */
export type { TransactionalRecordStore } from './record-store'
