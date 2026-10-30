/**
 * Execution Locks Utility
 * Prevents duplicate report execution in multi-container deployments
 *
 * Uses DynamoDB conditional writes to ensure only one container
 * can claim a report execution at a time.
 */

import { PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { getDynamoDBClient } from '../lib/aws-client-factory'
import { getItem, deleteItem } from './dynamodb'
import { getTableName, getTableEnvironment, getTableAccountId } from '../lib/dynamodb-config'
import { logger } from './logger'

export interface ExecutionLock {
  lockId: string              // Format: {reportId}#{scheduledTime}
  reportId: string
  scheduledTime: string       // ISO timestamp
  claimedAt: string           // ISO timestamp
  claimedBy: string           // Container/instance ID
  expiresAt: number           // Unix timestamp for TTL (1 hour from claim)
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Generate a unique container ID for this instance
 */
function getContainerId(): string {
  // In ECS, this would be the task ID or hostname
  // For now, use hostname + process ID
  return `${process.env.HOSTNAME || 'local'}-${process.pid}`
}

/**
 * Create lock ID from report and scheduled time
 */
export function createLockId(reportId: string, scheduledTime: string): string {
  return `${reportId}#${scheduledTime}`
}

/**
 * Try to claim an execution lock
 * Returns true if lock was successfully claimed, false if another container already has it
 *
 * Includes retry logic (2 attempts with backoff) to absorb transient DynamoDB
 * conditional-write contention or clock skew. ConditionalCheckFailedException
 * (meaning another container definitely has the lock) is never retried.
 */
export async function claimExecutionLock(
  reportId: string,
  scheduledTime: string
): Promise<boolean> {
  try {
    const tableName = await getTableName('reportExecutionLocks')
    const environment = await getTableEnvironment('reportExecutionLocks')
    const accountId = await getTableAccountId('reportExecutionLocks')
    const lockId = createLockId(reportId, scheduledTime)
    const now = new Date().toISOString()

    // TTL set to 1 hour — well above the 15-minute budget-alert-notifier job window
    // (and the ~1-hour scheduled-reports window), preventing self-eviction during slow runs.
    const expiresAt = Math.floor(Date.now() / 1000) + 3600

    const lock: ExecutionLock = {
      lockId,
      reportId,
      scheduledTime,
      claimedAt: now,
      claimedBy: getContainerId(),
      expiresAt
    }

    // Retry delays for transient failures (ms). ConditionalCheckFailed is never retried.
    const retryDelays = [100, 300]

    for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
      try {
        // Try to create the lock with a conditional write
        // This will only succeed if no lock exists for this lockId
        const client = await getDynamoDBClient(environment, undefined, accountId)

        // A lock past its expiresAt belongs to a run that died without
        // releasing it. DynamoDB TTL can take up to 48 hours to delete it,
        // so treat it as free rather than waiting on TTL.
        const command = new PutItemCommand({
          TableName: tableName,
          Item: marshall(lock, { removeUndefinedValues: true }),
          ConditionExpression: 'attribute_not_exists(lockId) OR expiresAt < :now',
          ExpressionAttributeValues: marshall({ ':now': Math.floor(Date.now() / 1000) })
        })

        await client.send(command)

        // Additional check: verify we actually own the lock
        // (in case of race condition with TTL expiry)
        const verification = await getItem(
          tableName,
          { lockId },
          environment,
          accountId
        )

        if (verification && verification.claimedBy === lock.claimedBy) {
          logger.info(`✓ Lock claimed by ${lock.claimedBy}: ${lockId}`)
          return true
        } else {
          // Lock verification failed — another instance holds the lock or TTL race.
          // This is a recoverable skip condition, not a fatal event.
          if (attempt < retryDelays.length) {
            logger.warn(`✗ Lock verification failed for ${lockId} (attempt ${attempt + 1}/${retryDelays.length + 1}), retrying after ${retryDelays[attempt]}ms...`)
            await sleep(retryDelays[attempt])
            continue
          }
          logger.warn(`✗ Lock verification failed for ${lockId} — skipping this tick, lock held elsewhere`)
          return false
        }
      } catch (error: any) {
        // ConditionalCheckFailedException means another container definitely has the lock — don't retry
        if (error.name === 'ConditionalCheckFailedException' ||
            error.message?.includes('ConditionalCheckFailed')) {
          logger.info(`✗ Lock already claimed by another container: ${lockId}`)
          return false
        }

        // For other transient errors, retry if attempts remain
        if (attempt < retryDelays.length) {
          logger.warn(`Error claiming lock ${lockId} (attempt ${attempt + 1}/${retryDelays.length + 1}), retrying after ${retryDelays[attempt]}ms:`, error)
          await sleep(retryDelays[attempt])
          continue
        }

        // All retries exhausted — log at warn (not error/fatal), this is a skip condition
        logger.warn(`Error claiming lock ${lockId} after ${retryDelays.length + 1} attempts — skipping this tick:`, error)
        return false
      }
    }

    // Should not reach here, but TypeScript needs a return
    return false
  } catch (error: any) {
    logger.error('Error in claimExecutionLock:', error)
    return false
  }
}

/**
 * Release an execution lock (optional - TTL will handle cleanup)
 * Only releases if we own the lock
 */
export async function releaseExecutionLock(
  reportId: string,
  scheduledTime: string
): Promise<boolean> {
  try {
    const tableName = await getTableName('reportExecutionLocks')
    const environment = await getTableEnvironment('reportExecutionLocks')
    const accountId = await getTableAccountId('reportExecutionLocks')
    const lockId = createLockId(reportId, scheduledTime)

    // First, check if we own the lock
    const lock = await getItem(
      tableName,
      { lockId },
      environment,
      accountId
    ) as ExecutionLock | null

    if (!lock) {
      logger.debug(`No lock found to release: ${lockId}`)
      return true // Lock doesn't exist, that's fine
    }

    if (lock.claimedBy !== getContainerId()) {
      logger.warn(`Cannot release lock ${lockId} - owned by ${lock.claimedBy}, not us`)
      return false
    }

    // Delete the lock
    await deleteItem(
      tableName,
      { lockId },
      environment,
      accountId
    )

    logger.info(`✓ Lock released: ${lockId}`)
    return true
  } catch (error: any) {
    logger.error('Error releasing lock:', error)
    return false
  }
}

/**
 * Check if a lock exists for a report execution
 */
export async function hasExecutionLock(
  reportId: string,
  scheduledTime: string
): Promise<{ locked: boolean; lock?: ExecutionLock }> {
  try {
    const tableName = await getTableName('reportExecutionLocks')
    const environment = await getTableEnvironment('reportExecutionLocks')
    const accountId = await getTableAccountId('reportExecutionLocks')
    const lockId = createLockId(reportId, scheduledTime)

    const lock = await getItem(
      tableName,
      { lockId },
      environment,
      accountId
    ) as ExecutionLock | null

    if (lock) {
      return {
        locked: true,
        lock
      }
    }

    return { locked: false }
  } catch (error: any) {
    logger.error('Error checking lock:', error)
    // If we can't determine lock status, assume it's locked for safety
    return { locked: true }
  }
}

/**
 * Lock age after which startup cleanup treats a lock as abandoned. It must be
 * longer than the longest job: a shorter threshold lets a task that starts
 * while another task is mid-job delete that job's live lock and run it twice.
 * Matches the 1-hour expiresAt written by claimExecutionLock.
 */
export const STALE_LOCK_MAX_AGE_MINUTES = 60

/**
 * Clean up stale locks on startup
 * Removes locks that are older than the specified age (default 60 minutes)
 * This handles the case where a container restarts and leaves behind old locks
 */
export async function cleanupStaleLocks(maxAgeMinutes: number = STALE_LOCK_MAX_AGE_MINUTES): Promise<number> {
  try {
    const tableName = await getTableName('reportExecutionLocks')
    const environment = await getTableEnvironment('reportExecutionLocks')
    const accountId = await getTableAccountId('reportExecutionLocks')

    logger.info(`Cleaning up execution locks older than ${maxAgeMinutes} minutes...`)

    // Import scanItems for scanning the table
    const { scanItems } = await import('./dynamodb')

    // Scan all locks (no filter, no limit, no nextToken, then environment and accountId)
    const result = await scanItems(tableName, undefined, undefined, undefined, environment, undefined, undefined, accountId)
    const locks = result.items as ExecutionLock[]

    if (!locks || locks.length === 0) {
      logger.debug('  No locks found to clean up')
      return 0
    }

    const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000)
    let deletedCount = 0

    // Delete locks older than cutoff
    for (const lock of locks) {
      const lockAge = new Date(lock.claimedAt).getTime()

      if (lockAge < cutoffTime) {
        logger.info(`  → Deleting stale lock: ${lock.lockId} (claimed by ${lock.claimedBy} at ${lock.claimedAt})`)

        await deleteItem(
          tableName,
          { lockId: lock.lockId },
          environment,
          accountId
        )

        deletedCount++
      }
    }

    if (deletedCount > 0) {
      logger.info(`✓ Cleaned up ${deletedCount} stale execution lock(s)`)
    } else {
      logger.debug('  No stale locks found')
    }

    return deletedCount
  } catch (error: any) {
    logger.error('Error cleaning up stale locks:', error)
    return 0
  }
}
