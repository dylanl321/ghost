/**
 * Favorite Accounts Composable
 * Manages user's favorite AWS accounts using user preferences
 */

import type { AWSEnclaveData } from '#shared/types/accounts'

const logger = createLogger('FavoriteAccounts')

const FAVORITES_KEY = 'favoriteAccounts'

export function useFavoriteAccounts() {
  const { setPreference, getPreference, loading } = useUserPreferences()
  const enclaveStore = useEnclaveStore()
  const toast = useToast()

  // Optimistic state: when non-null, takes priority over server state
  const optimisticIds = ref<string[] | null>(null)

  // Get array of favorite account IDs
  const favoriteIds = computed<string[]>(() => {
    if (optimisticIds.value !== null) return optimisticIds.value
    return getPreference<string[]>(FAVORITES_KEY, [])
  })

  // Get enriched favorite accounts with full details
  const favorites = computed(() => {
    return favoriteIds.value
      .map(accountId => enclaveStore.enclaves[accountId])
      .filter(Boolean) as AWSEnclaveData[]
  })

  /**
   * Check if an account is favorited
   */
  function isFavorite(accountId: string): boolean {
    return favoriteIds.value.includes(accountId)
  }

  /**
   * Add account to favorites
   */
  async function addFavorite(accountId: string): Promise<boolean> {
    if (!accountId) return false

    // Check if already favorited
    if (isFavorite(accountId)) {
      return true
    }

    // Optimistic update: show change immediately
    const previousIds = favoriteIds.value
    optimisticIds.value = [...previousIds, accountId]

    try {
      const success = await setPreference(FAVORITES_KEY, optimisticIds.value)
      optimisticIds.value = null // Fall through to server state

      if (success) {
        const accountName = enclaveStore.enclaves[accountId]?.projectName || accountId
        toast.add({
          title: 'Account favorited',
          description: `${accountName} added to favorites`,
          icon: 'i-heroicons-star-solid',
          color: 'yellow',
          timeout: 3000
        })
        logUserAction('account.favorite', accountId)
      }

      return success
    } catch (error) {
      optimisticIds.value = null // Rollback
      logger.error('Failed to add favorite:', error)
      toast.add({
        title: 'Failed to add favorite',
        description: 'Please try again',
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 3000
      })
      return false
    }
  }

  /**
   * Remove account from favorites
   */
  async function removeFavorite(accountId: string): Promise<boolean> {
    if (!accountId) return false

    // Optimistic update: remove immediately
    const previousIds = favoriteIds.value
    optimisticIds.value = previousIds.filter(id => id !== accountId)

    try {
      const success = await setPreference(FAVORITES_KEY, optimisticIds.value)
      optimisticIds.value = null // Fall through to server state

      if (success) {
        const accountName = enclaveStore.enclaves[accountId]?.projectName || accountId
        toast.add({
          title: 'Removed from favorites',
          description: `${accountName} removed from favorites`,
          icon: 'i-heroicons-star',
          color: 'gray',
          timeout: 3000
        })
        logUserAction('account.unfavorite', accountId)
      }

      return success
    } catch (error) {
      optimisticIds.value = null // Rollback
      logger.error('Failed to remove favorite:', error)
      toast.add({
        title: 'Failed to remove favorite',
        description: 'Please try again',
        icon: 'i-heroicons-exclamation-triangle',
        color: 'red',
        timeout: 3000
      })
      return false
    }
  }

  /**
   * Toggle favorite status
   */
  async function toggleFavorite(accountId: string): Promise<boolean> {
    if (isFavorite(accountId)) {
      return await removeFavorite(accountId)
    } else {
      return await addFavorite(accountId)
    }
  }

  return {
    // State
    favorites: readonly(favorites),
    favoriteIds: readonly(favoriteIds),
    loading: readonly(loading),

    // Methods
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite
  }
}
