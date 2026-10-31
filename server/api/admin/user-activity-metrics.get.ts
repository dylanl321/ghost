/**
 * GET /api/admin/user-activity-metrics
 *
 * Aggregates navigation activity from CloudWatch logs:
 * - Average session length (length of stay) per user and globally
 * - Most active pages per user and globally
 * Admin only.
 */

import { getQuery } from 'h3'
import { requireAdmin } from '../../utils/user-roles'
import { getLogs } from '../../utils/log-manager'
import { logger } from '../../utils/logger'

const NAV_REGEX = /Navigation - USER:([\w.@-]+),?\s*PATH:(.+)/
const ACTION_REGEX = /Action - USER:([\w.@-]+),?\s*TYPE:([\w.]+)(?:,?\s*DETAIL:(.+))?/
const SESSION_GAP_MS = 30 * 60 * 1000 // 30 minutes

interface NavEntry {
  timestamp: number
  user: string
  path: string
}

interface ActionEntry {
  timestamp: number
  user: string
  type: string
  detail?: string
}

interface UserMetrics {
  userId: string
  avgSessionLengthMs: number
  sessionCount: number
  topPages: Array<{ path: string; count: number }>
  actionCount: number
  topActions: Array<{ type: string; count: number }>
}

interface GlobalMetrics {
  avgSessionLengthMs: number
  totalSessions: number
  topPages: Array<{ path: string; count: number }>
  totalActions: number
  actionsByType: Array<{ type: string; count: number }>
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  try {
    const query = getQuery(event)
    const period = (query.period as '7d' | '30d') || '7d'
    const limit = Math.min(Math.max(parseInt(query.limit as string) || 50, 1), 1000)

    const durationSeconds = period === '30d' ? 30 * 86400 : 7 * 86400
    // Only navigation and action events, so other log lines don't use up the event cap
    const logs = await getLogs(durationSeconds, '?"Navigation - USER:" ?"Action - USER:"', 200_000)

    const navEntries: NavEntry[] = []
    const actionEntries: ActionEntry[] = []

    for (const e of logs) {
      const msg = e.message || ''
      if (msg.startsWith('Navigation - USER:')) {
        const match = msg.match(NAV_REGEX)
        if (match) {
          navEntries.push({ timestamp: e.timestamp ?? 0, user: match[1]!, path: match[2]!.trim() })
        }
      } else if (msg.startsWith('Action - USER:')) {
        const match = msg.match(ACTION_REGEX)
        if (match) {
          actionEntries.push({ timestamp: e.timestamp ?? 0, user: match[1]!, type: match[2]!, detail: match[3]?.trim() })
        }
      }
    }

    const byUser = aggregateByUser(navEntries)
    const actionsByUser = aggregateActionsByUser(actionEntries)

    // Merge action metrics into user metrics
    for (const [user, actions] of Object.entries(actionsByUser)) {
      if (byUser[user]) {
        byUser[user].actionCount = actions.actionCount
        byUser[user].topActions = actions.topActions
      } else {
        byUser[user] = { avgSessionLengthMs: 0, sessionCount: 0, topPages: [], ...actions }
      }
    }

    const global = aggregateGlobal(byUser, navEntries)
    const globalActions = aggregateGlobalActions(actionEntries)

    const byUserList = Object.entries(byUser)
      .map(([userId, m]) => ({ userId, ...m }))
      .sort((a, b) => b.sessionCount - a.sessionCount)
      .slice(0, limit)

    return {
      success: true,
      data: {
        period,
        startDate: new Date(Date.now() - durationSeconds * 1000).toISOString(),
        endDate: new Date().toISOString(),
        byUser: byUserList,
        global: { ...global, ...globalActions }
      }
    }
  } catch (error: any) {
    logger.error('[Admin] Error fetching user activity metrics:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch user activity metrics'
    })
  }
})

function aggregateByUser(entries: NavEntry[]): Record<string, Omit<UserMetrics, 'userId'>> {
  const byUser: Record<string, NavEntry[]> = {}
  for (const e of entries) {
    if (!byUser[e.user]) byUser[e.user] = []
    byUser[e.user].push(e)
  }

  const result: Record<string, Omit<UserMetrics, 'userId'>> = {}
  for (const [user, list] of Object.entries(byUser)) {
    const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp)
    const sessions: number[][] = []
    let current: number[] = []

    for (const e of sorted) {
      const prevTs = current.length ? current[current.length - 1] : 0
      if (current.length && e.timestamp - prevTs > SESSION_GAP_MS) {
        sessions.push(current)
        current = []
      }
      current.push(e.timestamp)
    }
    if (current.length) sessions.push(current)

    const sessionDurations = sessions.map(s => (s.length ? s[s.length - 1]! - s[0]! : 0))
    const totalMs = sessionDurations.reduce((a, b) => a + b, 0)
    const sessionCount = sessions.length
    const avgSessionLengthMs = sessionCount > 0 ? totalMs / sessionCount : 0

    const pathCounts: Record<string, number> = {}
    for (const e of list) {
      const p = simplifyPath(e.path)
      pathCounts[p] = (pathCounts[p] || 0) + 1
    }
    const topPages = Object.entries(pathCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, count]) => ({ path, count }))

    result[user] = { avgSessionLengthMs, sessionCount, topPages, actionCount: 0, topActions: [] }
  }
  return result
}

function aggregateActionsByUser(entries: ActionEntry[]): Record<string, { actionCount: number; topActions: Array<{ type: string; count: number }> }> {
  const byUser: Record<string, ActionEntry[]> = {}
  for (const e of entries) {
    if (!byUser[e.user]) byUser[e.user] = []
    byUser[e.user].push(e)
  }

  const result: Record<string, { actionCount: number; topActions: Array<{ type: string; count: number }> }> = {}
  for (const [user, list] of Object.entries(byUser)) {
    const typeCounts: Record<string, number> = {}
    for (const e of list) {
      typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
    }
    const topActions = Object.entries(typeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([type, count]) => ({ type, count }))

    result[user] = { actionCount: list.length, topActions }
  }
  return result
}

function aggregateGlobalActions(entries: ActionEntry[]): { totalActions: number; actionsByType: Array<{ type: string; count: number }> } {
  const typeCounts: Record<string, number> = {}
  for (const e of entries) {
    typeCounts[e.type] = (typeCounts[e.type] || 0) + 1
  }
  const actionsByType = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([type, count]) => ({ type, count }))

  return { totalActions: entries.length, actionsByType }
}

function aggregateGlobal(byUser: Record<string, Omit<UserMetrics, 'userId'>>, navEntries: NavEntry[]): GlobalMetrics {
  let totalSessions = 0
  let weightedSumMs = 0
  const pathCounts: Record<string, number> = {}

  for (const m of Object.values(byUser)) {
    totalSessions += m.sessionCount
    weightedSumMs += m.avgSessionLengthMs * m.sessionCount
  }

  // Count every visit, not just each user's top ten pages
  for (const e of navEntries) {
    const p = simplifyPath(e.path)
    pathCounts[p] = (pathCounts[p] || 0) + 1
  }

  const avgSessionLengthMs = totalSessions > 0 ? weightedSumMs / totalSessions : 0
  const topPages = Object.entries(pathCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }))

  return { avgSessionLengthMs, totalSessions, topPages, totalActions: 0, actionsByType: [] }
}

function simplifyPath(path: string): string {
  const p = path.split(/[?#]/)[0]!.replace(/^\//, '').split('/')[0] || 'home'
  const labels: Record<string, string> = {
    '': 'Dashboard',
    home: 'Dashboard',
    account: 'Account',
    admin: 'Admin',
    costs: 'Costs',
    explorer: 'Explorer',
    profile: 'Profile',
    reports: 'Reports',
    settings: 'Settings',
    support: 'Support'
  }
  return labels[p] || p
}
