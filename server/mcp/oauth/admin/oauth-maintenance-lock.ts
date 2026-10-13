/**
 * OAuth Administration — OAuth-specific maintenance lock namespace (task 11.1).
 *
 * The diagnostics maintenance loop reuses the existing scheduler/execution-lock
 * CONVENTIONS (DynamoDB conditional write, renewable lease, TTL) but a SEPARATE,
 * OAuth-specific lock NAMESPACE that is independent of report scheduling (design
 * "Diagnostics, maintenance, and alerts"). Report locks live in the
 * `reportExecutionLocks` table keyed `{reportId}#{scheduledTime}`; these locks
 * live in the isolated OAuth administration table keyed
 * `oauth-diagnostics#<deployment>#<scope>` so a diagnostics worker can never
 * collide with, evict, or be evicted by report scheduling.
 *
 * The lock is deliberately minimal:
 *   - `claim(key, leaseMs)`      — atomically acquire when free/expired.
 *   - `renew(key, token, leaseMs)` — extend a lease the holder still owns
 *                                    (a RENEWABLE lease — Requirement 11.2).
 *   - `release(key, token)`      — drop a lease the holder owns.
 *
 * A holder token proves ownership so a worker that lost its lease (expiry +
 * another claim) can DETECT the loss on the next renew and resolve its job to a
 * non-success state (Requirement 11.5). The durable store is selected the same
 * way as the repository: DynamoDB when an administration table is configured,
 * otherwise a process-local in-memory store.
 */

import { PutItemCommand, GetItemCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { OAuthDeploymentContext } from '#shared/types/oauth-administration'
import type { OAuthAdminTableConfig } from './types'
import { getDynamoDBClient } from '../../../lib/aws-client-factory'
import { getOAuthAdminTableConfig, useDurableOAuthAdminStore } from '../../config'

/** Namespace prefix separating OAuth maintenance locks from report locks. */
export const OAUTH_MAINTENANCE_LOCK_NAMESPACE = 'oauth-diagnostics'

/** Default lease duration for a diagnostics worker (renewable). */
export const DEFAULT_MAINTENANCE_LEASE_MS = 30 * 1000

/** A held lease: its opaque owner token and expiry. */
export interface OAuthMaintenanceLease {
  key: string
  token: string
  expiresAt: number
}

/**
 * An OAuth-namespaced maintenance lock. Distinct from `claimExecutionLock` (the
 * report namespace); this contract exposes a renewable lease with an ownership
 * token so a lost lease is detectable.
 */
export interface OAuthMaintenanceLockStore {
  claim(key: string, leaseMs?: number, now?: number): Promise<OAuthMaintenanceLease | null>
  renew(lease: OAuthMaintenanceLease, leaseMs?: number, now?: number): Promise<OAuthMaintenanceLease | null>
  release(lease: OAuthMaintenanceLease): Promise<void>
}

/**
 * Build a deployment-scoped, OAuth-namespaced lock key. `scope` distinguishes
 * the loop lock (`worker`) from a per-job lock (`job#<jobId>`).
 */
export function maintenanceLockKey(ctx: OAuthDeploymentContext, scope: string): string {
  return `${OAUTH_MAINTENANCE_LOCK_NAMESPACE}#${ctx.deploymentId}#${scope}`
}

function newToken(): string {
  return `${process.env.HOSTNAME || 'local'}-${process.pid}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Process-local in-memory lock store for tests and memory-only deployments.
 * Semantically identical to the durable store: a claim succeeds only when the
 * key is free or its lease has expired; a renew succeeds only for the current
 * holder token before expiry.
 */
export class InMemoryOAuthMaintenanceLockStore implements OAuthMaintenanceLockStore {
  private readonly held = new Map<string, { token: string, expiresAt: number }>()

  /** Test helper: clear all locks. */
  clear(): void {
    this.held.clear()
  }

  async claim(key: string, leaseMs = DEFAULT_MAINTENANCE_LEASE_MS, now = Date.now()): Promise<OAuthMaintenanceLease | null> {
    const existing = this.held.get(key)
    if (existing && existing.expiresAt > now) return null
    const token = newToken()
    const expiresAt = now + leaseMs
    this.held.set(key, { token, expiresAt })
    return { key, token, expiresAt }
  }

  async renew(lease: OAuthMaintenanceLease, leaseMs = DEFAULT_MAINTENANCE_LEASE_MS, now = Date.now()): Promise<OAuthMaintenanceLease | null> {
    const existing = this.held.get(lease.key)
    // Lost the lease if it is gone, expired, or now held by a different token.
    if (!existing || existing.token !== lease.token || existing.expiresAt <= now) return null
    const expiresAt = now + leaseMs
    this.held.set(lease.key, { token: lease.token, expiresAt })
    return { key: lease.key, token: lease.token, expiresAt }
  }

  async release(lease: OAuthMaintenanceLease): Promise<void> {
    const existing = this.held.get(lease.key)
    if (existing && existing.token === lease.token) this.held.delete(lease.key)
  }
}

/** Stored lock row shape in the OAuth administration table. */
interface StoredLockRow {
  PK: string
  SK: string
  lockToken: string
  expiresAtMs: number
  /** DynamoDB TTL (epoch seconds) — physical cleanup only. */
  ttl: number
}

/**
 * DynamoDB-backed maintenance lock using conditional writes on the isolated
 * OAuth administration table. The condition allows a claim only when the row is
 * absent OR its lease has expired, and a renew only when the current token
 * matches and the lease has not expired.
 */
export class DynamoOAuthMaintenanceLockStore implements OAuthMaintenanceLockStore {
  constructor(private readonly config: OAuthAdminTableConfig) {}

  private async client() {
    return getDynamoDBClient(this.config.environment, undefined, this.config.accountId)
  }

  private key(lockKey: string): Record<string, string> {
    return { PK: `LOCK#${lockKey}`, SK: 'LOCK' }
  }

  async claim(key: string, leaseMs = DEFAULT_MAINTENANCE_LEASE_MS, now = Date.now()): Promise<OAuthMaintenanceLease | null> {
    const token = newToken()
    const expiresAt = now + leaseMs
    const row: StoredLockRow = {
      ...this.key(key),
      lockToken: token,
      expiresAtMs: expiresAt,
      ttl: Math.floor(expiresAt / 1000) + 60
    } as StoredLockRow
    try {
      const client = await this.client()
      await client.send(new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall(row, { removeUndefinedValues: true }),
        // Acquire only when free or the previous lease expired.
        ConditionExpression: 'attribute_not_exists(PK) OR expiresAtMs <= :now',
        ExpressionAttributeValues: marshall({ ':now': now })
      }))
      return { key, token, expiresAt }
    } catch (error: any) {
      if (isConditionalFailure(error)) return null
      // A durable-store failure is treated as "not acquired" so the loop skips
      // this tick safely rather than running unlocked.
      return null
    }
  }

  async renew(lease: OAuthMaintenanceLease, leaseMs = DEFAULT_MAINTENANCE_LEASE_MS, now = Date.now()): Promise<OAuthMaintenanceLease | null> {
    const expiresAt = now + leaseMs
    const row: StoredLockRow = {
      ...this.key(lease.key),
      lockToken: lease.token,
      expiresAtMs: expiresAt,
      ttl: Math.floor(expiresAt / 1000) + 60
    } as StoredLockRow
    try {
      const client = await this.client()
      await client.send(new PutItemCommand({
        TableName: this.config.tableName,
        Item: marshall(row, { removeUndefinedValues: true }),
        // Extend only if we still hold it (same token) and it has not expired.
        ConditionExpression: 'attribute_exists(PK) AND lockToken = :token AND expiresAtMs > :now',
        ExpressionAttributeValues: marshall({ ':token': lease.token, ':now': now })
      }))
      return { key: lease.key, token: lease.token, expiresAt }
    } catch (error: any) {
      // Lost the lease (expired or reclaimed) — signal loss to the worker.
      if (isConditionalFailure(error)) return null
      return null
    }
  }

  async release(lease: OAuthMaintenanceLease): Promise<void> {
    try {
      const client = await this.client()
      await client.send(new DeleteItemCommand({
        TableName: this.config.tableName,
        Key: marshall(this.key(lease.key)),
        ConditionExpression: 'lockToken = :token',
        ExpressionAttributeValues: marshall({ ':token': lease.token })
      }))
    } catch {
      // A release we do not own or a transient failure is non-fatal; the lease
      // TTL guarantees eventual availability.
    }
  }

  /** Read a lock row (diagnostic/testing helper); not part of the loop path. */
  async read(key: string): Promise<StoredLockRow | null> {
    try {
      const client = await this.client()
      const response = await client.send(new GetItemCommand({
        TableName: this.config.tableName,
        Key: marshall(this.key(key))
      }))
      return response.Item ? (unmarshall(response.Item) as StoredLockRow) : null
    } catch {
      return null
    }
  }
}

function isConditionalFailure(error: any): boolean {
  return error?.name === 'ConditionalCheckFailedException'
    || String(error?.message || '').includes('ConditionalCheckFailed')
}

// A single in-memory lock store shared across a memory-only deployment so
// claims within the process are consistent.
let sharedMemoryLockStore: InMemoryOAuthMaintenanceLockStore | undefined

/**
 * Resolve the OAuth maintenance lock store for the current deployment. Durable
 * when an administration table is configured; otherwise the shared in-memory
 * store.
 */
export function getOAuthMaintenanceLockStore(): OAuthMaintenanceLockStore {
  if (useDurableOAuthAdminStore()) {
    return new DynamoOAuthMaintenanceLockStore(getOAuthAdminTableConfig())
  }
  if (!sharedMemoryLockStore) sharedMemoryLockStore = new InMemoryOAuthMaintenanceLockStore()
  return sharedMemoryLockStore
}
