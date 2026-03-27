/**
 * GET /api/admin/user-notifications/sources
 * Returns all registered notification sources with health status and volume metrics.
 */

import { requireAdmin } from '../../../utils/user-roles'
import { getNotificationStats } from '../../../utils/notification-service'
import { readSourceHeartbeat } from '../../../utils/source-heartbeat'
import { logger } from '../../../utils/logger'
import { NOTIFICATION_SOURCE_REGISTRY } from '#shared/types/notification-sources'
import type { NotificationCategory } from '#shared/types/notifications'
import type { SourceHealthStatus, SourceHealthInfo } from '#shared/types/notification-sources'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    // Get 7-day stats and derive 24h from byDay
    const stats = await getNotificationStats(7)
    const today = new Date().toISOString().substring(0, 10) // YYYY-MM-DD

    const volume24hByCategory: Partial<Record<NotificationCategory, number>> = {}
    for (const day of stats.byDay) {
      if (day.date === today) {
        // The byDay data doesn't break down by category, so we use total stats
        // For per-category 24h, we'd need a separate scan — use 7d proportions as approximation
        break
      }
    }

    // Build per-category volume from 7-day stats
    const volume7dByCategory = stats.byCategory

    // Compute today's total from byDay
    const todayEntry = stats.byDay.find(d => d.date === today)
    const todayTotal = todayEntry?.count || 0
    const weekTotal = stats.totalNotifications

    const sources: SourceHealthInfo[] = await Promise.all(
      NOTIFICATION_SOURCE_REGISTRY.map(async (source) => {
        // Read heartbeat for cron sources
        const heartbeat = source.triggerType === 'cron'
          ? await readSourceHeartbeat(source.id)
          : null

        // Compute health status
        let healthStatus: SourceHealthStatus = 'healthy'
        if (source.triggerType === 'cron') {
          if (!heartbeat) {
            healthStatus = 'unknown'
          } else if (heartbeat.status === 'error') {
            healthStatus = 'degraded'
          } else if (source.expectedIntervalMinutes) {
            const lastRunAge = (Date.now() - new Date(heartbeat.lastRun).getTime()) / 60000
            if (lastRunAge > source.expectedIntervalMinutes * 3) {
              healthStatus = 'stale'
            }
          }
        }

        // Sum volume across this source's categories
        let volume7d = 0
        for (const cat of source.categories) {
          volume7d += volume7dByCategory[cat] || 0
        }

        // Approximate 24h as (today/week * 7d volume) — rough but avoids extra scan
        const volume24h = weekTotal > 0
          ? Math.round((todayTotal / weekTotal) * volume7d)
          : 0

        return {
          source,
          heartbeat,
          healthStatus,
          volume24h,
          volume7d,
          lastNotificationAt: heartbeat?.lastRun || null
        }
      })
    )

    return { success: true, data: sources }
  } catch (error: any) {
    logger.error('Error fetching notification sources:', error)
    if (error.statusCode) throw error
    throw createError({ statusCode: 500, message: error.message || 'Failed to fetch sources' })
  }
})
