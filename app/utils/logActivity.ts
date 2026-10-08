const logger = createLogger('LogActivity')

export const logActivity = async (message: string) => {
  // Only run on client-side to avoid SSR issues
  if (typeof window === 'undefined') {
    logger.warn('logToBackend: Skipping server-side logging to avoid URL parsing errors')
    return
  }

  try {
    const response = await fetch('/api/logging/activity-logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      logger.warn('Failed to log to backend:', response.status, response.statusText)
    }
  } catch (error) {
    logger.error('Error logging message:', error);
  }
};

export type ActivityType =
  // Cost dashboard interactions
  | 'cost.timeframe_change'
  | 'cost.tab_switch'
  | 'cost.mode_toggle'
  | 'cost.tag_drilldown'
  | 'cost.account_select'
  // Account interactions
  | 'account.favorite'
  | 'account.unfavorite'
  // Data exports
  | 'export.csv'
  | 'export.json'
  // Dashboard customization
  | 'dashboard.scope_change'
  | 'dashboard.daterange_change'
  // Search
  | 'search.explorer'
  | 'search.cost'

/**
 * Log a structured user action to CloudWatch and local activity store.
 * Fire-and-forget — never blocks the UI.
 */
export const logUserAction = (type: ActivityType, detail?: string) => {
  if (typeof window === 'undefined') return

  try {
    const { user, loggedIn } = useOidcAuth()
    if (!loggedIn.value || !user.value) return

    const email = user.value?.claims?.email || user.value?.userInfo?.email || ''
    if (!email) return
    const username = (email as string).split('@')[0] || 'UnknownUser'

    const detailPart = detail ? `, DETAIL:${detail}` : ''
    const message = `Action - USER:${username}, TYPE:${type}${detailPart}`

    logActivity(message)

    // Push to local activity store for instant My Activity card display
    try {
      const { addLocalAction } = useMyActivity()
      addLocalAction({ type, detail, timestamp: Date.now() })
    } catch {
      // useMyActivity may not be available in all contexts
    }
  } catch {
    // Silently fail — never block UX for telemetry
  }
}