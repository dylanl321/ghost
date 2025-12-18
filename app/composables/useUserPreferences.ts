/**
 * User Preferences Composable
 * Easy access to current user's preferences
 * Singleton pattern - shared state across all components
 *
 * Features:
 * - localStorage caching for resilience when API fails
 * - Auth error detection with non-blocking toast notification
 * - Automatic fallback to cached preferences on auth failure
 */

import type { UserPreferences, UpdatePreferencesRequest } from '#shared/types/user-preferences'
import { getBrowserTimezone } from '#shared/types/user-preferences'

// localStorage cache key for preferences
const PREFS_CACHE_KEY = 'ghost-user-preferences-cache'
const AUTH_ERROR_SESSION_KEY = 'ghost-auth-error-shown'

// Shared state (singleton pattern)
const preferences = ref<UserPreferences | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const initialized = ref(false)
const authError = ref(false)

/**
 * Cache preferences to localStorage for resilience
 */
function cachePreferences(prefs: UserPreferences): void {
  if (!process.client) return
  try {
    localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify({
      data: prefs,
      cachedAt: Date.now()
    }))
  } catch (e) {
    console.warn('Failed to cache preferences to localStorage:', e)
  }
}

/**
 * Get cached preferences from localStorage
 */
function getCachedPreferences(): UserPreferences | null {
  if (!process.client) return null
  try {
    const cached = localStorage.getItem(PREFS_CACHE_KEY)
    if (!cached) return null
    const { data } = JSON.parse(cached)
    return data
  } catch (e) {
    console.warn('Failed to read cached preferences:', e)
    return null
  }
}

/**
 * Check if an error is an authentication error (401)
 */
function isAuthError(err: any): boolean {
  return err?.statusCode === 401 ||
    err?.status === 401 ||
    err?.data?.statusCode === 401 ||
    err?.message?.includes('401') ||
    err?.message?.includes('Authentication required')
}

/**
 * Show toast notification for auth error
 * Uses a custom event to defer toast creation to component context
 */
function emitAuthErrorEvent(): void {
  if (!process.client) return

  // Only show once per session
  const alreadyShown = sessionStorage.getItem(AUTH_ERROR_SESSION_KEY)
  if (alreadyShown) return

  sessionStorage.setItem(AUTH_ERROR_SESSION_KEY, 'true')

  // Emit custom event that components can listen to
  // This allows the toast to be shown from a proper component context
  window.dispatchEvent(new CustomEvent('ghost-auth-error', {
    detail: {
      title: 'Session Issue Detected',
      description: 'Your session may have expired. Click to refresh your login.'
    }
  }))
}

export function useUserPreferences() {
  // Computed helpers
  const timezone = computed(() => preferences.value?.timezone || 'America/New_York')
  const lastLogin = computed(() => preferences.value?.lastLoginAt ? new Date(preferences.value.lastLoginAt) : null)
  const browserTimezone = computed(() => getBrowserTimezone())

  /**
   * Show auth error toast - call from component context
   */
  function showAuthErrorToast(): void {
    try {
      const toast = useToast()
      const { requireAuth } = useAuthRedirect()

      toast.add({
        id: 'auth-session-expired',
        title: 'Session Issue Detected',
        description: 'Your session may have expired. Click to refresh your login.',
        color: 'amber',
        icon: 'i-heroicons-exclamation-triangle',
        timeout: 0, // Don't auto-dismiss
        actions: [{
          label: 'Refresh Login',
          click: () => {
            requireAuth()
          }
        }, {
          label: 'Dismiss',
          variant: 'ghost' as const
        }]
      })
    } catch (e) {
      console.warn('Failed to show auth error toast:', e)
    }
  }

  /**
   * Load user preferences from API
   */
  async function load(force: boolean = false) {
    // Skip if already loaded and not forcing refresh
    if (initialized.value && !force) {
      return
    }

    loading.value = true
    error.value = null
    authError.value = false

    try {
      // Send browser timezone in query params so server can use it during auto-creation
      const browserTz = getBrowserTimezone()
      const response = await $fetch<{ data: UserPreferences }>('/api/user/preferences', {
        query: { timezone: browserTz }
      })
      preferences.value = response.data
      initialized.value = true

      // Cache successful load to localStorage
      cachePreferences(response.data)

      // Clear any previous auth error indicator
      if (process.client) {
        sessionStorage.removeItem(AUTH_ERROR_SESSION_KEY)
      }

      // Auto-fix timezone if it's still the server default (EST) and doesn't match browser
      // This handles users who logged in before this fix was deployed
      if (preferences.value.timezone === 'America/New_York' && browserTz !== 'America/New_York') {
        console.log('Auto-updating timezone from server default (EST) to browser timezone:', browserTz)
        // Update silently in background, don't wait for it
        updateTimezone(browserTz).catch(err => {
          console.warn('Failed to auto-update timezone:', err)
        })
      }
    } catch (err: any) {
      console.error('Failed to load user preferences:', err)
      error.value = err.message || 'Failed to load preferences'

      // Check if this is an auth error (401)
      if (isAuthError(err)) {
        authError.value = true
        console.warn('Auth error detected while loading preferences')
        emitAuthErrorEvent()
      }

      // Try to use cached preferences from localStorage
      const cached = getCachedPreferences()
      if (cached) {
        console.log('Using cached preferences from localStorage')
        preferences.value = cached
      } else {
        // Only use empty defaults if no cache exists
        // This is a true first-time user or cleared cache scenario
        preferences.value = {
          userId: 'unknown',
          timezone: getBrowserTimezone(),
          preferences: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
      }
      initialized.value = true
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

      // Cache successful update to localStorage
      cachePreferences(response.data)

      return true
    } catch (err: any) {
      console.error('Failed to update user preferences:', err)
      error.value = err.message || 'Failed to update preferences'

      // Check if this is an auth error
      if (isAuthError(err)) {
        authError.value = true
        emitAuthErrorEvent()
      }

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
    // Ensure preferences are loaded first
    if (!initialized.value) {
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

  // Set up auth error event listener (client-side only)
  if (process.client) {
    const handleAuthError = () => {
      // Delay slightly to ensure toast system is ready
      setTimeout(() => {
        showAuthErrorToast()
      }, 100)
    }

    // Listen for auth error events
    window.addEventListener('ghost-auth-error', handleAuthError)

    // Clean up on HMR
    if (import.meta.hot) {
      import.meta.hot.dispose(() => {
        window.removeEventListener('ghost-auth-error', handleAuthError)
      })
    }
  }

  // Auto-load on mount (client-side only) if not already loaded
  onMounted(() => {
    if (process.client && !initialized.value) {
      load()
    }
  })

  // Auto-initialize on first call (client-side only)
  if (process.client && !initialized.value && !loading.value) {
    load()
  }

  return {
    // State
    preferences: readonly(preferences),
    loading: readonly(loading),
    error: readonly(error),
    initialized: readonly(initialized),
    authError: readonly(authError),

    // Computed
    timezone,
    lastLogin,
    browserTimezone,

    // Methods
    load,
    update,
    updateTimezone,
    setPreference,
    getPreference,
    showAuthErrorToast
  }
}
