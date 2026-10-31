/**
 * Notification Broadcast Service
 *
 * Handles admin-to-user broadcast notifications.
 * Creates individual UserNotification records per target user
 * so each user can independently manage (read/delete) their copy.
 */

import { v4 as uuidv4 } from 'uuid'
import type {
  BroadcastNotification,
  CreateBroadcastOptions,
  BroadcastStatus
} from '#shared/types/notifications'
import { getTableConfig } from '../lib/dynamodb-config'
import { putItem, queryItems, getItem, scanAllItems } from './dynamodb'
import { sendUserNotification } from './notification-service'
import { logger } from './logger'

// ---------------------------------------------------------------------------
// Table access helpers
// ---------------------------------------------------------------------------

async function getBroadcastTableInfo() {
  const config = await getTableConfig('notificationBroadcasts')
  return {
    tableName: config.tableName,
    environment: config.environment,
    accountId: config.accountId
  }
}

function generateBroadcastId(): string {
  const timestamp = Date.now().toString(36).padStart(9, '0')
  const random = uuidv4().replace(/-/g, '').substring(0, 8)
  return `bc-${timestamp}-${random}`
}

// ---------------------------------------------------------------------------
// Create and fan out a broadcast
// ---------------------------------------------------------------------------

export async function createBroadcast(
  options: CreateBroadcastOptions,
  createdBy: string
): Promise<{ success: boolean; broadcastId?: string; deliveredCount?: number; error?: string }> {
  const broadcastId = generateBroadcastId()
  const now = new Date().toISOString()
  const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days

  try {
    const { tableName, environment, accountId } = await getBroadcastTableInfo()

    // Resolve target user IDs
    let targetUserIds: string[] = []

    if (options.targetAudience === 'all') {
      // Every page of the preferences table: one capped scan page left out
      // users once the table grew past it
      const { tableName: prefsTable, environment: prefsEnv, accountId: prefsAccount } = await getTableConfig('userPreferences')
      const allPrefs = await scanAllItems(prefsTable, undefined, prefsEnv, undefined, undefined, prefsAccount)
      targetUserIds = allPrefs.map(p => p.userId).filter((id): id is string => typeof id === 'string' && id.length > 0)
    } else if (options.targetAudience === 'list' && options.targetUserIds) {
      targetUserIds = options.targetUserIds
    } else {
      // 'role' targeted users by preferences.role, a field every user can set
      // through PATCH /api/user/preferences, so anyone could add themselves to
      // a role broadcast. There is no trusted per-user role store to target.
      return { success: false, error: `Unsupported broadcast audience: ${options.targetAudience}` }
    }

    if (targetUserIds.length === 0) {
      return { success: false, error: 'No target users found' }
    }

    // Write broadcast record as in-progress
    const broadcast: BroadcastNotification = {
      broadcastId,
      createdBy,
      title: options.title,
      body: options.body,
      category: options.category || 'SYSTEM',
      severity: options.severity || 'info',
      targetAudience: options.targetAudience,
      targetRole: options.targetRole,
      targetUserIds: options.targetAudience === 'list' ? options.targetUserIds : undefined,
      status: 'in-progress' as BroadcastStatus,
      deliveredCount: 0,
      totalCount: targetUserIds.length,
      createdAt: now,
      ttl
    }

    await putItem(tableName, broadcast, environment, accountId)

    // Fan out individual notifications
    let delivered = 0
    for (const userId of targetUserIds) {
      try {
        const result = await sendUserNotification({
          userId,
          category: broadcast.category,
          title: broadcast.title,
          body: broadcast.body,
          severity: broadcast.severity,
          metadata: { broadcastId }
        })
        // sendUserNotification reports failures in its result, not by throwing
        if (result.success && !result.skipped) delivered++
        else logger.warn(`[Broadcast] Not delivered to ${userId}: ${result.error || result.reason || 'unknown reason'}`)
      } catch (err) {
        logger.warn(`[Broadcast] Failed to deliver to ${userId}:`, err)
      }
    }

    // Update broadcast status to complete
    broadcast.status = 'complete'
    broadcast.deliveredCount = delivered
    await putItem(tableName, broadcast, environment, accountId)

    logger.info(`[Broadcast] ${broadcastId} delivered to ${delivered}/${targetUserIds.length} users`)

    return { success: true, broadcastId, deliveredCount: delivered }
  } catch (error: any) {
    logger.error('[Broadcast] Failed to create broadcast:', error)
    return { success: false, error: error.message }
  }
}

// ---------------------------------------------------------------------------
// List broadcasts
// ---------------------------------------------------------------------------

export async function getBroadcasts(
  limit: number = 20,
  lastKey?: string
): Promise<{ broadcasts: BroadcastNotification[]; nextKey: string | null; hasMore: boolean }> {
  const { tableName, environment, accountId } = await getBroadcastTableInfo()

  // Query by status index to get recent broadcasts (complete + in-progress)
  // Since most broadcasts are 'complete', query that status
  const completeResult = await queryItems(
    {
      tableName,
      indexName: 'StatusIndex',
      queryExpression: '#status = :status',
      expressionAttributeNames: { '#status': 'status' },
      expressionAttributeValues: { ':status': 'complete' },
      scanIndexForward: false,
      limit,
      nextToken: lastKey
    },
    environment,
    accountId
  )

  return {
    broadcasts: completeResult.items as BroadcastNotification[],
    nextKey: completeResult.nextToken || null,
    hasMore: !!completeResult.nextToken
  }
}

// ---------------------------------------------------------------------------
// Get single broadcast
// ---------------------------------------------------------------------------

export async function getBroadcastById(
  broadcastId: string
): Promise<BroadcastNotification | null> {
  const { tableName, environment, accountId } = await getBroadcastTableInfo()

  const item = await getItem(
    tableName,
    { broadcastId },
    environment,
    accountId
  )

  return item as BroadcastNotification | null
}
