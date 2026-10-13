/**
 * Shared Investigations — transactional record store (task 3.3).
 *
 * Owner: Ghostv2 CollaborationRepository.
 *
 * The CollaborationRepository never talks to DynamoDB directly. Instead it
 * builds a {@link TransactionPlan} — a set of item-level operations that MUST
 * commit all-or-nothing — and hands it to a {@link TransactionalRecordStore}.
 * This keeps the concurrency/idempotency/Revision *rules* (in
 * `repository.ts`) independent of the storage engine and independently
 * testable against the deterministic {@link InMemoryTransactionalRecordStore}.
 *
 * The plan maps directly onto DynamoDB `TransactWriteItems`:
 *   - `putIfAbsent`   -> Put with `attribute_not_exists(pk)` (first writer wins,
 *                        Requirement 7.6, 14.3, 14.4, 24.6).
 *   - `put`           -> Put with no existence condition (new child rows).
 *   - `updateIfRevision` -> Update conditioned on the stored Revision equalling
 *                        the expected one (Requirement 7.8, 7.9, 12.3, 12.4).
 *   - `incrementCounter` -> Update conditioned on the counter's current value,
 *                        so a concurrent allocation of the same Server_Sequence
 *                        fails the whole transaction (Requirement 7.4, 7.5).
 *   - `check`         -> ConditionCheck used to fail closed on a stale read.
 *
 * A `TransactionConflictError` is thrown when any item's condition fails; the
 * repository translates that into either an idempotent replay, a retry with the
 * original Operation_ID (sequence conflict), or a caller-facing conflict.
 */

/** Marker so callers/backends can branch on the conflicting operation kind. */
export type TransactionConflictReason =
  | 'exists' // a putIfAbsent target already existed
  | 'missing' // a check/update target was absent
  | 'revision' // an updateIfRevision expected Revision was stale
  | 'counter' // an incrementCounter expected value was stale
  | 'unknown'

/**
 * Thrown when a transaction's condition fails. It is deliberately generic: the
 * repository, not the store, decides what a conflict *means* (replay vs. retry
 * vs. caller conflict), because only the repository knows the Operation_ID and
 * payload semantics.
 */
export class TransactionConflictError extends Error {
  readonly reason: TransactionConflictReason
  /** The `id` of the plan operation whose condition failed, when known. */
  readonly failedOpId?: string

  constructor(reason: TransactionConflictReason = 'unknown', failedOpId?: string) {
    super(`collaboration transaction conflict: ${reason}`)
    this.name = 'TransactionConflictError'
    this.reason = reason
    this.failedOpId = failedOpId
  }
}

/** A primary key within the single-table Cloud_Record_Store. */
export interface RecordKey {
  pk: string
  sk: string
}

/** A stored item: its key plus arbitrary attributes (already plain JSON). */
export interface StoredRecord extends RecordKey {
  [attribute: string]: unknown
}

/** Put an item only if no item already exists at its key (first writer wins). */
export interface PutIfAbsentOp {
  op: 'putIfAbsent'
  id: string
  item: StoredRecord
}

/** Put an item unconditionally (a brand-new child row with a unique key). */
export interface PutOp {
  op: 'put'
  id: string
  item: StoredRecord
}

/** Replace an item only if its stored `revision` equals `expectedRevision`. */
export interface UpdateIfRevisionOp {
  op: 'updateIfRevision'
  id: string
  item: StoredRecord
  expectedRevision: number
}

/**
 * Set a sequence counter to `next` only if its stored `value` equals
 * `expectedCurrent` (optimistic increment). Creates the counter at `next` when
 * it does not yet exist and `expectedCurrent` is 0.
 */
export interface IncrementCounterOp {
  op: 'incrementCounter'
  id: string
  key: RecordKey
  expectedCurrent: number
  next: number
}

/** Require an item to exist (used to fail closed on a stale precondition). */
export interface CheckExistsOp {
  op: 'check'
  id: string
  key: RecordKey
  mustExist: boolean
}

export type TransactionOp =
  | PutIfAbsentOp
  | PutOp
  | UpdateIfRevisionOp
  | IncrementCounterOp
  | CheckExistsOp

/** A set of operations that commit all-or-nothing. */
export interface TransactionPlan {
  ops: TransactionOp[]
}

/**
 * Storage port for the CollaborationRepository. The two implementations are the
 * in-memory store (tests / local) and the DynamoDB store (`dynamo-record-store`).
 */
export interface TransactionalRecordStore {
  /**
   * Commit every op atomically. On any condition failure NOTHING is written and
   * a {@link TransactionConflictError} is thrown (Requirement 7.3 atomicity).
   */
  transactWrite(plan: TransactionPlan): Promise<void>
  /** Strongly consistent single-item read (Requirement 7.11). */
  get(key: RecordKey): Promise<StoredRecord | null>
}

/** Serialize a key to a map key for the in-memory store. */
function keyString(key: RecordKey): string {
  return `${key.pk}\u0000${key.sk}`
}

/**
 * Deterministic in-memory {@link TransactionalRecordStore}. It faithfully
 * models all-or-nothing commit and every condition: the plan is validated
 * against a snapshot first, and only applied if every condition holds. This is
 * the backend the repository unit/property tests run against.
 */
export class InMemoryTransactionalRecordStore implements TransactionalRecordStore {
  private readonly items = new Map<string, StoredRecord>()

  async transactWrite(plan: TransactionPlan): Promise<void> {
    // 1) Validate every condition against the current snapshot. If any fails,
    //    the whole transaction aborts with nothing written.
    for (const op of plan.ops) {
      this.validate(op)
    }
    // 2) Guard against two ops writing the same key in one transaction, which
    //    DynamoDB rejects outright.
    const written = new Set<string>()
    for (const op of plan.ops) {
      const k = this.opKey(op)
      if (!k) continue
      if (written.has(k)) {
        throw new TransactionConflictError('unknown', op.id)
      }
      written.add(k)
    }
    // 3) Apply.
    for (const op of plan.ops) {
      this.apply(op)
    }
  }

  async get(key: RecordKey): Promise<StoredRecord | null> {
    const found = this.items.get(keyString(key))
    return found ? structuredClone(found) : null
  }

  private opKey(op: TransactionOp): string | null {
    switch (op.op) {
      case 'putIfAbsent':
      case 'put':
      case 'updateIfRevision':
        return keyString(op.item)
      case 'incrementCounter':
        return keyString(op.key)
      case 'check':
        return null // checks do not write, so they never collide
    }
  }

  private validate(op: TransactionOp): void {
    switch (op.op) {
      case 'putIfAbsent': {
        if (this.items.has(keyString(op.item))) {
          throw new TransactionConflictError('exists', op.id)
        }
        return
      }
      case 'put':
        return
      case 'updateIfRevision': {
        const existing = this.items.get(keyString(op.item))
        if (!existing) {
          throw new TransactionConflictError('missing', op.id)
        }
        if (Number(existing.revision) !== op.expectedRevision) {
          throw new TransactionConflictError('revision', op.id)
        }
        return
      }
      case 'incrementCounter': {
        const existing = this.items.get(keyString(op.key))
        const current = existing ? Number(existing.value) : 0
        if (current !== op.expectedCurrent) {
          throw new TransactionConflictError('counter', op.id)
        }
        return
      }
      case 'check': {
        const exists = this.items.has(keyString(op.key))
        if (exists !== op.mustExist) {
          throw new TransactionConflictError('missing', op.id)
        }
        return
      }
    }
  }

  private apply(op: TransactionOp): void {
    switch (op.op) {
      case 'putIfAbsent':
      case 'put':
      case 'updateIfRevision':
        this.items.set(keyString(op.item), structuredClone(op.item))
        return
      case 'incrementCounter': {
        const key = op.key
        this.items.set(keyString(key), { pk: key.pk, sk: key.sk, value: op.next })
        return
      }
      case 'check':
        return
    }
  }
}
