/**
 * User Preferences Composable
 * Easy access to current user's preferences
 */

import type { UserPreferences, UpdatePreferencesRequest } from '#shared/types/user-preferences'
import { getBrowserTimezone } from '#shared/types/user-preferences'

export function useUserPreferences() {
  const preferences = ref<UserPreferences | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Computed helpers
  const timezone = computed(() => preferences.value?.timezone || 'America/New_York')
  const lastLogin = computed(() => preferences.value?.lastLoginAt ? new Date(preferences.value.lastLoginAt) : null)
  const browserTimezone = computed(() => getBrowserTimezone())

  /**
   * Load user preferences from API
   */
  async function load() {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ data: UserPreferences }>('/api/user/preferences')
      preferences.value = response.data
    } catch (err: any) {
      console.error('Failed to load user preferences:', err)
      error.value = err.message || 'Failed to load preferences'

      // Set defaults on error
      preferences.value = {
        userId: 'unknown',
        timezone: getBrowserTimezone(),
        preferences: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    } finally {
      loading.value = false
    }
  }

  /**
   * Update user preferences
   */
  async function update(updates: UpdatePreferencesRequest) {
    loading.value = true
    error.value = null

    try {
      const response = await $fetch<{ data: UserPreferences }>('/api/user/preferences', {
        method: 'PATCH',
        body: updates
      })

      preferences.value = response.data
      return true
    } catch (err: any) {
      console.error('Failed to update user preferences:', err)
      error.value = err.message || 'Failed to update preferences'
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * Update timezone
   */
  async function updateTimezone(newTimezone: string) {
    return await update({ timezone: newTimezone })
  }

  /**
   * Set a single preference value
   */
  async function setPreference(key: string, value: any) {
    if (!preferences.value) {
      await load()
    }

    const currentPrefs = preferences.value?.preferences || {}
    return await update({
      preferences: {
        ...currentPrefs,
        [key]: value
      }
    })
  }

  /**
   * Get a single preference value
   */
  function getPreference<T = any>(key: string, defaultValue?: T): T {
    return preferences.value?.preferences?.[key] ?? defaultValue
  }

  // Auto-load on mount (client-side only)
  onMounted(() => {
    if (process.client) {
      load()
    }
  })

  return {
    // State
    preferences: readonly(preferences),
    loading: readonly(loading),
    error: readonly(error),

    // Computed
    timezone,
    lastLogin,
    browserTimezone,

    // Methods
    load,
    update,
    updateTimezone,
    setPreference,
    getPreference
  }
}
