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

export interface ExecutionLock {
  lockId: string              // Format: {reportId}#{scheduledTime}
  reportId: string
  scheduledTime: string       // ISO timestamp
  claimedAt: string           // ISO timestamp
  claimedBy: string           // Container/instance ID
  expiresAt: number           // Unix timestamp for TTL (1 hour from claim)
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
    const expiresAt = Math.floor(Date.now() / 1000) + 3600 // 1 hour from now

    const lock: ExecutionLock = {
      lockId,
      reportId,
      scheduledTime,
      claimedAt: now,
      claimedBy: getContainerId(),
      expiresAt
    }

    // Try to create the lock with a conditional write
    // This will only succeed if no lock exists for this lockId
    try {
      const client = await getDynamoDBClient(environment, undefined, accountId)

      const command = new PutItemCommand({
        TableName: tableName,
        Item: marshall(lock, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(lockId)'
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
        console.log(`✓ Lock claimed by ${lock.claimedBy}: ${lockId}`)
        return true
      } else {
        console.log(`✗ Lock verification failed for ${lockId}`)
        return false
      }
    } catch (error: any) {
      // Check if it's a conditional check failure
      // This means another container already claimed the lock
      if (error.name === 'ConditionalCheckFailedException' ||
          error.message?.includes('ConditionalCheckFailed')) {
        console.log(`✗ Lock already claimed by another container: ${lockId}`)
        return false
      }

      // For other errors, we can't safely claim the lock
      console.error(`Error claiming lock ${lockId}:`, error)
      return false
    }
  } catch (error: any) {
    console.error('Error in claimExecutionLock:', error)
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
      console.log(`No lock found to release: ${lockId}`)
      return true // Lock doesn't exist, that's fine
    }

    if (lock.claimedBy !== getContainerId()) {
      console.warn(`Cannot release lock ${lockId} - owned by ${lock.claimedBy}, not us`)
      return false
    }

    // Delete the lock
    await deleteItem(
      tableName,
      { lockId },
      environment,
      accountId
    )

    console.log(`✓ Lock released: ${lockId}`)
    return true
  } catch (error: any) {
    console.error('Error releasing lock:', error)
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
    console.error('Error checking lock:', error)
    // If we can't determine lock status, assume it's locked for safety
    return { locked: true }
  }
}
