/**
 * Recent Accounts Composable
 * Tracks recently viewed AWS accounts using user preferences
 */

import type { AWSEnclaveData } from '#shared/types/accounts'

const RECENT_ACCOUNTS_KEY = 'recentlyViewedAccounts'
const MAX_RECENT_ACCOUNTS = 10

interface RecentAccount {
  accountId: string
  viewedAt: string // ISO timestamp
}

export function useRecentAccounts() {
  const { setPreference, getPreference, loading } = useUserPreferences()
  const enclaveStore = useEnclaveStore()
  const toast = useToast()

  // Get array of recent account objects with timestamps
  const recentAccountsRaw = computed<RecentAccount[]>(() => {
    return getPreference<RecentAccount[]>(RECENT_ACCOUNTS_KEY, [])
  })

  // Get enriched recent accounts with full details
  const recentAccounts = computed(() => {
    return recentAccountsRaw.value
      .map(recent => {
        const account = enclaveStore.enclaves[recent.accountId]
        if (!account) return null
        return {
          ...account,
          viewedAt: recent.viewedAt
        }
      })
      .filter(Boolean) as (AWSEnclaveData & { viewedAt: string })[]
  })

  /**
   * Add account to recent views (or update timestamp if already present)
   */
  async function addRecentAccount(accountId: string): Promise<boolean> {
    if (!accountId) return false

    try {
      const current = recentAccountsRaw.value || []
      
      // Remove if already exists
      const filtered = current.filter(item => item.accountId !== accountId)
      
      // Add to front with current timestamp
      const updated: RecentAccount[] = [
        { accountId, viewedAt: new Date().toISOString() },
        ...filtered
      ].slice(0, MAX_RECENT_ACCOUNTS) // Keep only the most recent N accounts

      const success = await setPreference(RECENT_ACCOUNTS_KEY, updated)
      return success
    } catch (error) {
      console.error('Failed to add recent account:', error)
      return false
    }
  }

  /**
   * Remove account from recent views
   */
  async function removeRecentAccount(accountId: string): Promise<boolean> {
    if (!accountId) return false

    try {
      const current = recentAccountsRaw.value || []
      const updated = current.filter(item => item.accountId !== accountId)
      const success = await setPreference(RECENT_ACCOUNTS_KEY, updated)

      if (success) {
        const accountName = enclaveStore.enclaves[accountId]?.projectName || accountId
        toast.add({
          title: 'Removed from recent',
          description: `${accountName} removed from recent accounts`,
          icon: 'i-heroicons-clock',
          color: 'gray',
          timeout: 2000
        })
      }

      return success
    } catch (error) {
      console.error('Failed to remove recent account:', error)
      toast.add({
        title: 'Failed to remove',
        description: 'Please try again',
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 3000
      })
      return false
    }
  }

  /**
   * Clear all recent accounts
   */
  async function clearRecentAccounts(): Promise<boolean> {
    try {
      const success = await setPreference(RECENT_ACCOUNTS_KEY, [])
      if (success) {
        toast.add({
          title: 'Recent accounts cleared',
          icon: 'i-heroicons-clock',
          color: 'gray',
          timeout: 2000
        })
      }
      return success
    } catch (error) {
      console.error('Failed to clear recent accounts:', error)
      return false
    }
  }

  return {
    // State
    recentAccounts: readonly(recentAccounts),
    loading: readonly(loading),

    // Methods
    addRecentAccount,
    removeRecentAccount,
    clearRecentAccounts
  }
}


