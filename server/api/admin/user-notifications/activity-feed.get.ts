/**
 * GET /api/admin/user-notifications/activity-feed
 * Unified activity feed merging GHOST notifications with external budget alert history.
 * Allows admins to see all alert activity — including alerts that predate the notification system.
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getAllNotificationsAdmin } from '../../../utils/notification-service'
import { getAlertsByMonth } from '../../../utils/budget-alerts'
import { logger } from '../../../utils/logger'
import type { UnifiedActivityItem } from '#shared/types/notification-sources'
import type { UserNotification } from '#shared/types/notifications'
import type { BudgetAlert } from '#shared/types/budget-alerts'

function mapNotificationToActivity(n: UserNotification): UnifiedActivityItem {
  return {
    id: n.notificationId,
    source: 'ghost-notification',
    timestamp: n.createdAt,
    category: n.category,
    severity: n.severity,
    title: n.title,
    body: n.body,
    userId: n.userId,
    metadata: {
      ...n.metadata,
      status: n.status,
      emailSent: n.emailSent,
      actionUrl: n.actionUrl
    }
  }
}

function mapAlertToActivity(alert: BudgetAlert): UnifiedActivityItem {
  const levelMap: Record<string, 'info' | 'warning' | 'critical'> = {
    INFO: 'info',
    WARNING: 'warning',
    CRITICAL: 'critical',
    ESCALATION: 'critical'
  }

  return {
    id: alert.alert_id,
    source: 'budget-alert-history',
    timestamp: alert.created_at || alert.timestamp,
    category: 'BUDGET_THRESHOLD',
    severity: levelMap[alert.alert_level] || 'info',
    title: `Budget ${alert.alert_level}: Account ${alert.account_id}`,
    body: `$${alert.actual_spend?.toLocaleString()} spent of $${alert.budget?.toLocaleString()} budget (projected: $${alert.projected_spend?.toLocaleString()})`,
    metadata: {
      accountId: alert.account_id,
      alertLevel: alert.alert_level,
      alertType: alert.alert_type,
      actualSpend: alert.actual_spend,
      budget: alert.budget,
      projectedSpend: alert.projected_spend,
      deliveryStatus: alert.delivery_status,
      month: alert.month
    }
  }
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const limit = Math.min(parseInt(query.limit as string) || 30, 100)
    const sourceFilter = (query.source as string) || 'all'
    const category = query.category as string | undefined
    const ghostNextKey = query.ghostNextKey as string | undefined
    const alertsNextToken = query.alertsNextToken as string | undefined

    const items: UnifiedActivityItem[] = []
    let returnGhostNextKey: string | null = null
    let returnAlertsNextToken: string | null = null

    // Fetch GHOST notifications
    if (sourceFilter === 'all' || sourceFilter === 'ghost') {
      try {
        const result = await getAllNotificationsAdmin({
          limit,
          category: category as any,
          lastKey: ghostNextKey
        })
        items.push(...result.notifications.map(mapNotificationToActivity))
        returnGhostNextKey = result.nextKey
      } catch (err: any) {
        logger.warn('Failed to fetch GHOST notifications for activity feed:', err.message)
      }
    }

    // Fetch budget alert history from external table
    if (sourceFilter === 'all' || sourceFilter === 'budget-history') {
      try {
        // Query current and previous month for reasonable coverage
        const now = new Date()
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
        const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`

        const [currentResult, prevResult] = await Promise.all([
          getAlertsByMonth(currentMonth, { limit: Math.ceil(limit / 2), sortOrder: 'desc', nextToken: alertsNextToken }),
          getAlertsByMonth(prevMonth, { limit: Math.ceil(limit / 2), sortOrder: 'desc' })
        ])

        items.push(...currentResult.alerts.map(mapAlertToActivity))
        items.push(...prevResult.alerts.map(mapAlertToActivity))
        returnAlertsNextToken = currentResult.nextToken || null
      } catch (err: any) {
        logger.warn('Failed to fetch budget alert history for activity feed:', err.message)
      }
    }

    // Sort by timestamp descending and trim to limit
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    const trimmed = items.slice(0, limit)

    return {
      success: true,
      data: {
        items: trimmed,
        ghostNextKey: returnGhostNextKey,
        alertsNextToken: returnAlertsNextToken,
        hasMore: !!(returnGhostNextKey || returnAlertsNextToken)
      }
    }
  } catch (error: any) {
    logger.error('Error fetching activity feed:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to fetch activity feed' })
  }
})
