/**
 * My Activity Composable (Hybrid)
 * Local layer: stores recent actions in user preferences for instant display.
 * Server layer: fetches from CloudWatch for cross-device persistence.
 * Merges both sources with deduplication.
 */

const ACTIVITY_KEY = 'recentActions'
const MAX_LOCAL_ACTIONS = 20

export interface ActionItem {
  type: string
  detail?: string
  timestamp: number
}

// Singleton refs so all consumers share state
const serverActions = ref<ActionItem[]>([])
const serverLoading = ref(false)
const serverFetched = ref(false)

export function useMyActivity() {
  const { setPreference, getPreference, initialized } = useUserPreferences()

  const localActions = computed<ActionItem[]>(() => {
    return getPreference<ActionItem[]>(ACTIVITY_KEY, [])
  })

  /** Push an action to local preferences immediately (called by logUserAction) */
  function addLocalAction(item: ActionItem) {
    try {
      if (!initialized.value) return
      const current = localActions.value
      const updated = [item, ...current].slice(0, MAX_LOCAL_ACTIONS)
      setPreference(ACTIVITY_KEY, updated)
    } catch {
      // Silent fail
    }
  }

  /** Fetch action history from CloudWatch via server API */
  async function fetchServerActions() {
    if (serverFetched.value || serverLoading.value) return
    serverLoading.value = true
    try {
      const data = await $fetch<{ success: boolean; data: ActionItem[] }>('/api/user/my-activity')
      if (data.success) {
        serverActions.value = data.data
      }
      serverFetched.value = true
    } catch {
      // Silent fail — local actions still available
    } finally {
      serverLoading.value = false
    }
  }

  /** Force refresh from server */
  async function refresh() {
    serverFetched.value = false
    await fetchServerActions()
  }

  /**
   * Merged and deduplicated action items from both sources.
   * Local items take priority for recent actions; server backfills older ones.
   */
  const actionItems = computed<ActionItem[]>(() => {
    const local = localActions.value
    const server = serverActions.value

    if (server.length === 0) return local

    // Merge: start with local, add server items that don't match any local item
    const merged = [...local]
    for (const sItem of server) {
      const isDuplicate = local.some(
        lItem =>
          lItem.type === sItem.type &&
          lItem.detail === sItem.detail &&
          Math.abs(lItem.timestamp - sItem.timestamp) < 2000
      )
      if (!isDuplicate) {
        merged.push(sItem)
      }
    }

    return merged
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_LOCAL_ACTIONS)
  })

  return {
    actionItems: readonly(actionItems),
    loading: readonly(serverLoading),
    addLocalAction,
    fetchServerActions,
    refresh,
  }
}
