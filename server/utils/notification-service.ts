/**
 * Unified Notification Service
 *
 * Central hub for creating, routing, and managing user notifications.
 * All notification sources (report scheduler, budget alerts, admin events, etc.)
 * call sendUserNotification() which writes to DynamoDB and routes to channels
 * (in-browser inbox, immediate email, digest queue) based on user preferences.
 */

import { v4 as uuidv4 } from 'uuid'
import {
  CATEGORY_PREFERENCE_MAP,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type MuteDuration,
  type UserNotification,
  type NotificationCategory,
  type NotificationStatus,
  type SendUserNotificationOptions,
  type NotificationListParams,
  type NotificationListResponse,
  type UnreadCountResponse,
  type AdminNotificationListParams,
  type NotificationStats
} from '../../shared/types/notifications'
import { getTableConfig } from '../lib/dynamodb-config'
import { getItem, putItem, updateItem, deleteItem, queryItems, queryAllItems, scanItems, scanAllItems } from './dynamodb'
import { getConfigValue } from './site-config'
import { getUserPreferences, updateUserPreferences } from './user-preferences'
import { sendEmail, escapeHtml } from './email-service'
import { notificationEmitter } from './notification-emitter'
import { logger } from './logger'
import { getUserSession } from './entra/session'
import { createError, type H3Event } from 'h3'

// ---------------------------------------------------------------------------
// Caller identity for the /api/notifications routes
// ---------------------------------------------------------------------------

/**
 * The signed-in user's notification inbox id. Every notifications route
 * resolves the caller the same way through here. The service functions
 * lowercase it themselves; it is returned as-is because user preferences
 * (used by mute) are keyed by the unmodified id.
 */
export async function requireNotificationUserId(event: H3Event): Promise<string> {
  const session = await getUserSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: 'Authentication required' })
  }

  const userId = session.user.email || session.user.id || session.user.sub
  if (!userId) {
    throw createError({ statusCode: 401, message: 'User identification failed' })
  }
  return String(userId)
}

// ---------------------------------------------------------------------------
// Table access helpers
// ---------------------------------------------------------------------------

async function getTableInfo() {
  const config = await getTableConfig('userNotifications')
  return {
    tableName: config.tableName,
    environment: config.environment,
    accountId: config.accountId
  }
}

// ---------------------------------------------------------------------------
// ULID-like sortable ID generator (timestamp prefix + random suffix)
// ---------------------------------------------------------------------------

function generateSortableId(): string {
  const timestamp = Date.now().toString(36).padStart(9, '0')
  const random = uuidv4().replace(/-/g, '').substring(0, 12)
  return `${timestamp}-${random}`
}

// ---------------------------------------------------------------------------
// Core: Send a notification to a user
// ---------------------------------------------------------------------------

export async function sendUserNotification(
  options: SendUserNotificationOptions
): Promise<{ success: boolean; notificationId?: string; error?: string; skipped?: boolean; reason?: string; deduplicated?: boolean }> {
  // Normalize userId to lowercase for consistent DynamoDB lookups
  options = { ...options, userId: options.userId.toLowerCase() }

  // Check kill switch
  const enabled = await getConfigValue<boolean>('notifications.enabled')
  if (enabled === false) {
    logger.warn('Notification system is disabled, skipping notification', { userId: options.userId, category: options.category })
    return { success: true, skipped: true, reason: 'notifications_disabled' }
  }

  // Dry-run mode: redirect all notifications to a single admin email
  const dryRunEnabled = await getConfigValue<boolean>('notifications.dryRun.enabled')
  if (dryRunEnabled) {
    const redirectTo = await getConfigValue<string>('notifications.dryRun.redirectTo')
    if (redirectTo && options.userId !== redirectTo) {
      logger.info('Dry-run mode: redirecting notification', {
        originalUserId: options.userId,
        redirectTo,
        category: options.category
      })
      options = {
        ...options,
        metadata: {
          ...options.metadata,
          dryRunOriginalUserId: options.userId,
          dryRunRedirected: true
        },
        userId: redirectTo
      }
    }
  }

  const notificationId = generateSortableId()
  const now = new Date().toISOString()
  const ttl = Math.floor(Date.now() / 1000) + (90 * 24 * 60 * 60) // 90 days

  try {
    const { tableName, environment, accountId } = await getTableInfo()

    // Determine email routing based on user preferences
    let emailSent = true // Default: skip email (will be set to false if digest needed)
    let shouldSendImmediateEmail = false

    if (options.skipEmail) {
      // External system handles email — inbox + SSE only
      emailSent = true
      shouldSendImmediateEmail = false
    } else if (CATEGORY_PREFERENCE_MAP[options.category] !== null) {
      // Category has a preference toggle — check if user has it enabled
      const prefKey = CATEGORY_PREFERENCE_MAP[options.category]!
      try {
        const userPrefs = await getUserPreferences(options.userId)
        const notifPrefs = { ...DEFAULT_NOTIFICATION_PREFERENCES, ...userPrefs.preferences?.notificationPreferences }
        const isEnabled = notifPrefs[prefKey as keyof typeof notifPrefs] !== false

        if (isEnabled && options.severity === 'critical') {
          shouldSendImmediateEmail = true
          emailSent = true
        } else if (isEnabled && notifPrefs.emailDigestEnabled) {
          emailSent = false // Mark for digest inclusion
        }
        // If disabled: emailSent stays true (skip email)
      } catch (prefError) {
        logger.warn('Failed to load user preferences for notification routing:', prefError)
        // On error, deliver to inbox only (emailSent = true = skip email)
      }
    } else {
      // Always-deliver categories (REPORT_READY, SYSTEM)
      // Only send immediate email for critical severity
      if (options.severity === 'critical') {
        shouldSendImmediateEmail = true
      }
    }

    // Write to DynamoDB inbox
    const notification: UserNotification = {
      userId: options.userId,
      notificationId,
      category: options.category,
      title: options.title,
      body: options.body,
      severity: options.severity,
      status: 'unread',
      actionUrl: options.actionUrl,
      actionLabel: options.actionLabel,
      metadata: options.metadata,
      dedupeKey: options.dedupeKey,
      emailSent,
      emailPending: emailSent ? undefined : 'PENDING', // Sparse GSI key for digest queries
      createdAt: now,
      ttl
    }

    // If dedupeKey is set, check for existing notification to prevent duplicates.
    // Read the whole partition (stopping at the first match): with Limit 1 the
    // filter only ever saw the user's oldest notification, so dedupe never hit.
    if (options.dedupeKey) {
      const existing = await queryAllItems(
        {
          tableName,
          queryExpression: 'userId = :userId',
          filterExpression: 'dedupeKey = :dk',
          expressionAttributeValues: { ':userId': options.userId, ':dk': options.dedupeKey },
          projectionExpression: 'notificationId',
          scanIndexForward: false
        },
        environment,
        accountId,
        { stopWhen: items => items.length > 0 }
      )
      if (existing.length > 0) {
        return { success: true, notificationId: existing[0]!.notificationId as string, deduplicated: true }
      }
    }

    await putItem(tableName, notification, environment, accountId)

    // Push to connected SSE streams for instant delivery
    notificationEmitter.emitNotification(options.userId, notification)

    // Send immediate email for critical notifications
    if (shouldSendImmediateEmail) {
      try {
        await sendImmediateNotificationEmail(options)
        // Update emailSent to true after successful send
        await updateItem(
          tableName,
          { userId: options.userId, notificationId },
          { emailSent: true },
          environment,
          accountId
        )
      } catch (emailError) {
        logger.error('Failed to send immediate notification email:', emailError)
        // Notification is still in inbox, just email failed
      }
    }

    logger.info('User notification created:', {
      notificationId,
      userId: options.userId,
      category: options.category,
      severity: options.severity,
      emailSent: shouldSendImmediateEmail
    })

    return { success: true, notificationId }
  } catch (error: any) {
    logger.error('Failed to create user notification:', error)
    return { success: false, error: error.message }
  }
}

// ---------------------------------------------------------------------------
// Query: Get notifications for a user
// ---------------------------------------------------------------------------

export async function getUserNotifications(
  userId: string,
  params: NotificationListParams = {}
): Promise<NotificationListResponse> {
  userId = userId.toLowerCase()
  const { tableName, environment, accountId } = await getTableInfo()

  const limit = Math.min(params.limit || 20, 50)

  // Build filter expression parts
  const filterParts: string[] = []
  const exprValues: Record<string, any> = { ':userId': userId }
  const exprNames: Record<string, string> = {}

  if (params.category) {
    const categories = Array.isArray(params.category) ? params.category : [params.category]
    if (categories.length === 1) {
      filterParts.push('category = :category')
      exprValues[':category'] = categories[0]
    } else {
      const placeholders = categories.map((_, i) => `:cat${i}`)
      filterParts.push(`category IN (${placeholders.join(', ')})`)
      categories.forEach((cat, i) => { exprValues[`:cat${i}`] = cat })
    }
  }
  if (params.status) {
    filterParts.push('#status = :status')
    exprNames['#status'] = 'status'
    exprValues[':status'] = params.status
  }

  const result = await queryItems(
    {
      tableName,
      queryExpression: 'userId = :userId',
      filterExpression: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
      expressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
      expressionAttributeValues: exprValues,
      scanIndexForward: false, // Newest first (ULID sort)
      limit,
      nextToken: params.lastKey
    },
    environment,
    accountId
  )

  return {
    notifications: result.items as UserNotification[],
    nextKey: result.nextToken || null,
    hasMore: !!result.nextToken
  }
}

// ---------------------------------------------------------------------------
// Query: Get unread count for a user (lightweight)
// ---------------------------------------------------------------------------

export async function getUnreadCount(userId: string): Promise<UnreadCountResponse> {
  userId = userId.toLowerCase()
  const { tableName, environment, accountId } = await getTableInfo()

  // Limit applies before the filter, so a limited query counted unread items
  // among the user's oldest 100 notifications only. Read every page instead
  // (a user's partition is bounded by the 90-day TTL).
  const unread = await queryAllItems(
    {
      tableName,
      queryExpression: 'userId = :userId',
      filterExpression: '#status = :status',
      expressionAttributeNames: { '#status': 'status' },
      expressionAttributeValues: {
        ':userId': userId,
        ':status': 'unread'
      },
      projectionExpression: 'notificationId'
    },
    environment,
    accountId
  )

  return { count: unread.length }
}

// ---------------------------------------------------------------------------
// Mutations: Mark as read, mark all read, delete
// ---------------------------------------------------------------------------

export async function markNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<void> {
  await setNotificationStatus(userId, notificationId, 'read')
}

export async function setNotificationStatus(
  userId: string,
  notificationId: string,
  status: Extract<NotificationStatus, 'read' | 'archived'>
): Promise<boolean> {
  userId = userId.toLowerCase()
  const { tableName, environment, accountId } = await getTableInfo()
  const existing = await getItem(tableName, { userId, notificationId }, environment, accountId)
  if (!existing) return false

  await updateItem(
    tableName,
    { userId, notificationId },
    { status },
    environment,
    accountId
  )
  return true
}

const MUTE_DURATIONS: Record<MuteDuration, number> = {
  '1h': 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000
}

export async function setNotificationMute(userId: string, options: { duration?: MuteDuration; unmute?: boolean }, now = Date.now()) {
  const preferences = await getUserPreferences(userId)
  const notificationPreferences = { ...(preferences.preferences?.notificationPreferences || {}) }
  if (options.unmute) delete notificationPreferences.mutedUntil
  else {
    const duration = options.duration || '1h'
    const durationMs = MUTE_DURATIONS[duration]
    if (!durationMs) throw Object.assign(new Error('Invalid mute duration.'), { code: 'INVALID_MUTE_DURATION' })
    notificationPreferences.mutedUntil = new Date(now + durationMs).toISOString()
  }
  await updateUserPreferences(userId, { preferences: { notificationPreferences } })
  return { mutedUntil: notificationPreferences.mutedUntil || null }
}

export async function markAllNotificationsAsRead(userId: string): Promise<number> {
  userId = userId.toLowerCase()
  const { tableName, environment, accountId } = await getTableInfo()

  // Get all unread notifications for this user (every page; see getUnreadCount)
  const unread = await queryAllItems(
    {
      tableName,
      queryExpression: 'userId = :userId',
      filterExpression: '#status = :status',
      expressionAttributeNames: { '#status': 'status' },
      expressionAttributeValues: {
        ':userId': userId,
        ':status': 'unread'
      },
      projectionExpression: 'userId, notificationId'
    },
    environment,
    accountId
  )

  // Update each one (batch updates not supported in DynamoDB, but volume is small)
  let updated = 0
  for (const item of unread) {
    try {
      await updateItem(
        tableName,
        { userId: item.userId, notificationId: item.notificationId },
        { status: 'read' as NotificationStatus },
        environment,
        accountId
      )
      updated++
    } catch (err) {
      logger.warn('Failed to mark notification as read:', { notificationId: item.notificationId, error: err })
    }
  }

  return updated
}

export async function deleteNotification(
  userId: string,
  notificationId: string
): Promise<void> {
  userId = userId.toLowerCase()
  const { tableName, environment, accountId } = await getTableInfo()

  await deleteItem(
    tableName,
    { userId, notificationId },
    environment,
    accountId
  )
}

// ---------------------------------------------------------------------------
// Digest: Get pending notifications for email digest delivery
// ---------------------------------------------------------------------------

export async function getNotificationsForDigest(maxPages: number = 20): Promise<Map<string, UserNotification[]>> {
  const { tableName, environment, accountId } = await getTableInfo()

  // All pending items, not the oldest 500: users whose digest hour is not now
  // would otherwise fill the window and starve everyone else.
  const items = await queryAllItems(
    {
      tableName,
      indexName: 'EmailPendingIndex',
      queryExpression: 'emailPending = :pending',
      expressionAttributeValues: { ':pending': 'PENDING' },
      scanIndexForward: true
    },
    environment,
    accountId,
    { maxPages }
  )

  // Group by userId
  const grouped = new Map<string, UserNotification[]>()
  for (const item of items) {
    const notif = item as UserNotification
    const existing = grouped.get(notif.userId) || []
    existing.push(notif)
    grouped.set(notif.userId, existing)
  }

  return grouped
}

export async function markNotificationsAsEmailed(
  userId: string,
  notificationIds: string[]
): Promise<void> {
  const { tableName, environment, accountId } = await getTableInfo()

  for (const notificationId of notificationIds) {
    try {
      // REMOVE emailPending so the item leaves the sparse EmailPendingIndex.
      // Setting it to null was stripped by sanitization, leaving every
      // notification PENDING and re-sent in every later digest.
      await updateItem(
        tableName,
        { userId, notificationId },
        { emailSent: true },
        environment,
        accountId,
        ['emailPending']
      )
    } catch (err) {
      logger.warn('Failed to mark notification as emailed:', { notificationId, error: err })
    }
  }
}

// ---------------------------------------------------------------------------
// Admin: Browse all notifications across users
// ---------------------------------------------------------------------------

export async function getAllNotificationsAdmin(
  params: AdminNotificationListParams = {}
): Promise<NotificationListResponse & { total?: number }> {
  let tableInfo: { tableName: string; environment: string; accountId?: string }
  try {
    tableInfo = await getTableInfo()
  } catch (err: any) {
    // Table may not exist in dev — return empty result gracefully
    logger.warn('getAllNotificationsAdmin: table not available:', err.message)
    return { notifications: [], nextKey: null, hasMore: false }
  }
  const { tableName, environment, accountId } = tableInfo

  const limit = Math.min(params.limit || 20, 100)

  // If userId is provided, query by partition key
  if (params.userId) {
    const filterParts: string[] = []
    const exprValues: Record<string, any> = { ':userId': params.userId }
    const exprNames: Record<string, string> = {}

    if (params.category) {
      filterParts.push('category = :category')
      exprValues[':category'] = params.category
    }
    if (params.status) {
      filterParts.push('#status = :status')
      exprNames['#status'] = 'status'
      exprValues[':status'] = params.status
    }

    const result = await queryItems(
      {
        tableName,
        queryExpression: 'userId = :userId',
        filterExpression: filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
        expressionAttributeNames: Object.keys(exprNames).length > 0 ? exprNames : undefined,
        expressionAttributeValues: exprValues,
        scanIndexForward: false,
        limit,
        nextToken: params.lastKey
      },
      environment,
      accountId
    )

    let notifications = result.items as UserNotification[]

    // Client-side text search filter
    if (params.search) {
      const searchLower = params.search.toLowerCase()
      notifications = notifications.filter(n =>
        n.title.toLowerCase().includes(searchLower) ||
        n.body.toLowerCase().includes(searchLower)
      )
    }

    return {
      notifications,
      nextKey: result.nextToken || null,
      hasMore: !!result.nextToken
    }
  }

  // No userId — scan with filters
  const filterParts: string[] = []
  const exprNames: Record<string, string> = {}
  const exprValues: Record<string, any> = {}

  if (params.category) {
    filterParts.push('category = :category')
    exprValues[':category'] = params.category
  }
  if (params.status) {
    filterParts.push('#status = :status')
    exprNames['#status'] = 'status'
    exprValues[':status'] = params.status
  }

  const result = await scanItems(
    tableName,
    filterParts.length > 0 ? filterParts.join(' AND ') : undefined,
    limit,
    params.lastKey,
    environment,
    Object.keys(exprNames).length > 0 ? exprNames : undefined,
    Object.keys(exprValues).length > 0 ? exprValues : undefined,
    accountId
  )

  let notifications = (result.items || []) as UserNotification[]

  // Client-side text search filter
  if (params.search) {
    const searchLower = params.search.toLowerCase()
    notifications = notifications.filter(n =>
      n.title.toLowerCase().includes(searchLower) ||
      n.body.toLowerCase().includes(searchLower) ||
      n.userId.toLowerCase().includes(searchLower)
    )
  }

  // Sort by createdAt desc
  notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    notifications,
    nextKey: result.nextToken || null,
    hasMore: !!result.nextToken
  }
}

// ---------------------------------------------------------------------------
// Admin: Notification stats for analytics dashboard
// ---------------------------------------------------------------------------

export async function getNotificationStats(days: number = 7): Promise<NotificationStats> {
  let items: UserNotification[] = []

  try {
    const { tableName, environment, accountId } = await getTableInfo()

    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceISO = since.toISOString()

    // Every page: a Limit of 1000 applied before the date filter, so once the
    // table held more than 1000 items the stats only covered an arbitrary slice.
    items = await scanAllItems(
      tableName,
      'createdAt >= :since',
      environment,
      undefined,
      { ':since': sinceISO },
      accountId
    ) as UserNotification[]
  } catch (err: any) {
    // Table may not exist in dev — return empty stats gracefully
    logger.warn('getNotificationStats: table not available, returning empty stats:', err.message)
  }

  // Aggregate stats
  const byCategory: Partial<Record<NotificationCategory, number>> = {}
  const byDayMap: Record<string, number> = {}
  const userSet = new Set<string>()
  let emailsSent = 0

  for (const item of items) {
    byCategory[item.category] = (byCategory[item.category] || 0) + 1
    const day = item.createdAt.substring(0, 10) // YYYY-MM-DD
    byDayMap[day] = (byDayMap[day] || 0) + 1
    userSet.add(item.userId)
    if (item.emailSent) emailsSent++
  }

  const byDay = Object.entries(byDayMap)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    totalNotifications: items.length,
    byCategory,
    byDay,
    emailsSent,
    digestsSent: 0, // TODO: track in separate table
    activeUsers: userSet.size,
    broadcastCount: 0 // Populated by broadcast service
  }
}

// ---------------------------------------------------------------------------
// User: Clear all notifications
// ---------------------------------------------------------------------------

export async function clearAllUserNotifications(userId: string): Promise<number> {
  userId = userId.toLowerCase()
  const { tableName, environment, accountId } = await getTableInfo()

  // Get all notifications for this user (every page, not just the oldest 200)
  const items = await queryAllItems(
    {
      tableName,
      queryExpression: 'userId = :userId',
      expressionAttributeValues: { ':userId': userId },
      projectionExpression: 'userId, notificationId'
    },
    environment,
    accountId
  )

  let deleted = 0
  for (const item of items) {
    try {
      await deleteItem(
        tableName,
        { userId: item.userId, notificationId: item.notificationId },
        environment,
        accountId
      )
      deleted++
    } catch (err) {
      logger.warn('Failed to delete notification:', { notificationId: item.notificationId, error: err })
    }
  }

  return deleted
}

// ---------------------------------------------------------------------------
// Email: Send immediate notification email for critical alerts
// ---------------------------------------------------------------------------

const SITE_URL = process.env.NUXT_PUBLIC_SITE_URL || 'https://ghost.gd-ms.com'

async function sendImmediateNotificationEmail(options: SendUserNotificationOptions): Promise<void> {
  // Titles and bodies carry user-entered text (report names, broadcasts), so
  // escape them; links must stay on this site.
  const title = escapeHtml(options.title)
  const body = escapeHtml(options.body)
  const actionHref = options.actionUrl?.startsWith('/') && !options.actionUrl.startsWith('//')
    ? `${SITE_URL}${options.actionUrl}`
    : null
  const actionButton = actionHref
    ? `<tr>
        <td align="center" style="padding:0 32px 24px;">
          <table role="presentation" border="0" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="border-radius:6px; background:#2563eb;">
                <a href="${escapeHtml(actionHref)}" style="display:inline-block; padding:12px 24px; background:#2563eb; color:#ffffff; font-size:14px; font-weight:bold; text-decoration:none; border-radius:6px;">${escapeHtml(options.actionLabel || 'View in GHOST')}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : ''

  const severityColor = options.severity === 'critical' ? '#dc2626'
    : options.severity === 'warning' ? '#d97706'
    : '#2563eb'

  const html = `
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background-color:#f3f4f6; font-family: Arial, sans-serif;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f3f4f6; border-collapse:collapse;">
    <tr>
      <td align="center" style="padding:30px 15px;">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="600" style="background-color:#ffffff; border:1px solid #d1d5db; border-collapse:collapse;">
          <tr>
            <td style="padding:24px 32px; border-bottom:1px solid #e5e7eb; background-color:#f9fafb;">
              <span style="display:inline-block; padding:4px 10px; background-color:${severityColor}; color:#ffffff; border-radius:4px; font-size:12px; font-weight:600; text-transform:uppercase; margin-bottom:8px;">${options.severity}</span>
              <h1 style="margin:8px 0 0; font-size:20px; font-weight:600; color:#111827;">${title}</h1>
              <p style="margin:6px 0 0; font-size:14px; color:#6b7280;">GHOST Notification</p>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;">
              <div style="padding:16px; background-color:#f9fafb; border-left:3px solid ${severityColor}; border-radius:4px;">
                <p style="margin:0; font-size:14px; color:#111827; line-height:1.6; white-space:pre-wrap;">${body}</p>
              </div>
            </td>
          </tr>
          ${actionButton}
          <tr>
            <td style="padding:20px 32px; border-top:1px solid #e5e7eb; text-align:center; background-color:#f9fafb;">
              <p style="margin:0 0 4px; font-size:13px; font-weight:600; color:#374151;">GHOST Dashboard</p>
              <p style="margin:2px 0; font-size:12px; color:#9ca3af;">Notification System</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim()

  const text = `${options.severity.toUpperCase()}: ${options.title}\n\n${options.body}${actionHref ? `\n\nView: ${actionHref}` : ''}`

  const result = await sendEmail({
    to: [options.userId],
    subject: `[GHOST] ${options.title}`,
    html,
    text
  })
  // sendEmail reports failure in its result rather than throwing
  if (!result.success) {
    throw new Error(result.error || 'Failed to send notification email')
  }
}
