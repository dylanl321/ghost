const MCP_OFFERING_PREFERENCE_KEY = 'mcpOfferingDiscovery'
const MCP_OFFERING_MAX_IMPRESSIONS = 3
const MCP_OFFERING_SESSION_KEY = 'ghost-mcp-offering-impression-recorded'
const MCP_OFFERING_FALLBACK_KEY = 'ghost-mcp-offering-discovery-fallback'

type McpOfferingAcknowledgement = 'dismiss' | 'configure' | 'support' | 'mcp_visit'

export interface McpOfferingDiscoveryPreference {
  seenCount: number
  acknowledged: boolean
  firstSeenAt?: string
  lastShownAt?: string
  acknowledgedAt?: string
  acknowledgedBy?: McpOfferingAcknowledgement
}

function normalizePreference(value?: Partial<McpOfferingDiscoveryPreference> | null): McpOfferingDiscoveryPreference {
  const seenCount = Number(value?.seenCount || 0)
  return {
    seenCount: Number.isFinite(seenCount) ? Math.max(0, seenCount) : 0,
    acknowledged: value?.acknowledged === true,
    firstSeenAt: value?.firstSeenAt,
    lastShownAt: value?.lastShownAt,
    acknowledgedAt: value?.acknowledgedAt,
    acknowledgedBy: value?.acknowledgedBy
  }
}

export function isMcpOfferingIntroActive(value?: Partial<McpOfferingDiscoveryPreference> | null, preferencesReady = true): boolean {
  const normalized = normalizePreference(value)
  return preferencesReady && !normalized.acknowledged && normalized.seenCount < MCP_OFFERING_MAX_IMPRESSIONS
}

export function useMcpOfferingDiscovery() {
  const { getPreference, setPreference, initialized, loading, load } = useUserPreferences()
  const impressionRecordedThisSession = useState('mcp-offering-impression-recorded', () => false)
  const localPreference = useState<Partial<McpOfferingDiscoveryPreference> | null>('mcp-offering-local-preference', () => {
    if (!import.meta.client) return null
    try {
      const stored = localStorage.getItem(MCP_OFFERING_FALLBACK_KEY)
      return stored ? JSON.parse(stored) : null
    } catch {
      return null
    }
  })

  const preference = computed(() => normalizePreference(
    localPreference.value || getPreference<Partial<McpOfferingDiscoveryPreference>>(MCP_OFFERING_PREFERENCE_KEY, {})
  ))
  const isIntroActive = computed(() => isMcpOfferingIntroActive(preference.value, initialized.value))

  async function ensurePreferencesLoaded() {
    if (initialized.value) return
    if (!loading.value) {
      await load()
      return
    }

    await new Promise<void>((resolve) => {
      const stop = watch([initialized, loading], ([ready, stillLoading]) => {
        if (ready || !stillLoading) {
          stop()
          resolve()
        }
      }, { immediate: true })
    })
  }

  function hasRecordedSessionImpression(): boolean {
    if (!import.meta.client) return impressionRecordedThisSession.value
    try {
      return impressionRecordedThisSession.value || sessionStorage.getItem(MCP_OFFERING_SESSION_KEY) === 'true'
    } catch {
      return impressionRecordedThisSession.value
    }
  }

  function markSessionImpressionRecorded() {
    impressionRecordedThisSession.value = true
    if (!import.meta.client) return
    try {
      sessionStorage.setItem(MCP_OFFERING_SESSION_KEY, 'true')
    } catch {
      // The in-memory flag still prevents duplicate impressions during navigation.
    }
  }

  function cacheLocalPreference(value: McpOfferingDiscoveryPreference | null) {
    localPreference.value = value
    if (!import.meta.client) return
    try {
      if (value) localStorage.setItem(MCP_OFFERING_FALLBACK_KEY, JSON.stringify(value))
      else localStorage.removeItem(MCP_OFFERING_FALLBACK_KEY)
    } catch {
      // The reactive fallback still keeps the current session consistent.
    }
  }

  async function persistPreference(value: McpOfferingDiscoveryPreference) {
    cacheLocalPreference(value)
    const saved = await setPreference(MCP_OFFERING_PREFERENCE_KEY, value)
    if (saved) cacheLocalPreference(null)
  }

  async function recordDashboardImpression(): Promise<boolean> {
    await ensurePreferencesLoaded()
    const shouldShow = isIntroActive.value
    if (!shouldShow || hasRecordedSessionImpression()) return shouldShow

    markSessionImpressionRecorded()
    const current = preference.value
    const now = new Date().toISOString()
    await persistPreference({
      ...current,
      seenCount: current.seenCount + 1,
      firstSeenAt: current.firstSeenAt || now,
      lastShownAt: now
    })

    // Keep the third impression visible for the current dashboard visit.
    return true
  }

  async function acknowledge(acknowledgedBy: McpOfferingAcknowledgement): Promise<void> {
    await ensurePreferencesLoaded()
    if (preference.value.acknowledged) return

    await persistPreference({
      ...preference.value,
      acknowledged: true,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy
    })
  }

  return {
    preference: readonly(preference),
    isIntroActive,
    preferencesReady: initialized,
    recordDashboardImpression,
    acknowledge
  }
}
