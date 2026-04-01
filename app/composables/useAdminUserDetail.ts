import type { UserPreferences } from '#shared/types/user-preferences'

interface UserActivityMetric {
  userId: string
  avgSessionLengthMs: number
  sessionCount: number
  topPages: Array<{ path: string; count: number }>
  actionCount?: number
  topActions?: Array<{ type: string; count: number }>
}

interface GlobalActivityMetric {
  avgSessionLengthMs: number
  totalSessions: number
  topPages: Array<{ path: string; count: number }>
  totalActions?: number
  actionsByType?: Array<{ type: string; count: number }>
}

export interface ActivityMetricsData {
  byUser: UserActivityMetric[]
  global: GlobalActivityMetric
}

// Shared formatting helpers

export function formatSessionDuration(ms: number): string {
  if (ms <= 0 || !Number.isFinite(ms)) return '—'
  const sec = Math.round(ms / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const s = sec % 60
  if (min < 60) return s ? `${min}m ${s}s` : `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

export function formatRelativeDate(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`

    return date.toLocaleDateString()
  } catch {
    return dateStr
  }
}

export function formatAbsoluteDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return dateStr
  }
}

export function truncateEmail(email: string): { name: string; full: string } {
  const atIndex = email.indexOf('@')
  if (atIndex === -1) return { name: email, full: email }
  return { name: email.substring(0, atIndex), full: email }
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  'cost.timeframe_change': 'Cost Timeframe',
  'cost.tab_switch': 'Cost Tab',
  'cost.mode_toggle': 'Cost Mode',
  'cost.tag_drilldown': 'Tag Drilldown',
  'cost.account_select': 'Cost Accounts',
  'account.favorite': 'Favorite',
  'account.unfavorite': 'Unfavorite',
  'export.csv': 'CSV Export',
  'export.json': 'JSON Export',
  'dashboard.scope_change': 'Scope Change',
  'dashboard.daterange_change': 'Date Range',
  'search.explorer': 'Search',
  'search.cost': 'Cost Search',
  'chat.thread_create': 'New Chat',
  'chat.thread_share': 'Share Chat',
}

export function formatActionType(type: string): string {
  return ACTION_TYPE_LABELS[type] || type.replace('.', ': ')
}

// Composable for admin user data operations
export function useAdminUserDetail() {
  const toast = useToast()

  async function fetchAllPreferences(limit = 100): Promise<UserPreferences[]> {
    const response = await $fetch<{ data: { preferences: UserPreferences[]; total: number } }>('/api/admin/user-preferences', {
      query: { limit }
    })
    return response.data.preferences
  }

  async function fetchActivityMetrics(period: '7d' | '30d'): Promise<ActivityMetricsData | null> {
    try {
      const res = await $fetch<{
        success: boolean
        data: ActivityMetricsData
      }>('/api/admin/user-activity-metrics', { query: { period } })
      if (res.success && res.data) {
        return {
          byUser: res.data.byUser ?? [],
          global: res.data.global ?? { avgSessionLengthMs: 0, totalSessions: 0, topPages: [] }
        }
      }
      return null
    } catch {
      return null
    }
  }

  async function patchUserPreferences(userId: string, updates: { timezone?: string; preferences?: Record<string, any> }) {
    await $fetch(`/api/admin/user-preferences/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: updates
    })
  }

  async function deleteUserPreferences(userId: string) {
    await $fetch(`/api/admin/user-preferences/${encodeURIComponent(userId)}`, {
      method: 'DELETE'
    })
  }

  async function resetTourForUser(userId: string, currentPrefs: Record<string, any>, tourKey: string, label: string) {
    try {
      await patchUserPreferences(userId, {
        preferences: {
          ...currentPrefs,
          [tourKey]: {
            ...(currentPrefs[tourKey] || {}),
            completed: false,
            ...(tourKey === 'welcomeBanner'
              ? { dismissed: false, seenCount: 0, clicked: false }
              : { lastStep: 0 }),
            resetByAdminAt: new Date().toISOString()
          }
        }
      })
      toast.add({
        title: `${label} Reset`,
        description: `${label} will restart for ${truncateEmail(userId).name}`,
        color: 'green',
        icon: 'i-heroicons-check-circle'
      })
      return true
    } catch (err: any) {
      toast.add({
        title: 'Action Failed',
        description: err.message || `Could not reset ${label.toLowerCase()}`,
        color: 'red',
        icon: 'i-heroicons-x-circle'
      })
      return false
    }
  }

  return {
    fetchAllPreferences,
    fetchActivityMetrics,
    patchUserPreferences,
    deleteUserPreferences,
    resetTourForUser
  }
}
