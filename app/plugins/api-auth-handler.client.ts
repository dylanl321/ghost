/**
 * Global API auth error handler plugin
 *
 * This plugin intercepts all $fetch API calls and handles authentication errors.
 * When a 401 is detected:
 * 1. First attempts to refresh the session via nuxt-oidc-auth
 * 2. If refresh succeeds, retries the original request
 * 3. If refresh fails, redirects to /auth/session-expired
 */

// Track if we're currently refreshing to prevent multiple simultaneous refreshes
let isRefreshing = false
let refreshPromise: Promise<boolean> | null = null

/**
 * Check if a 500 error is session-related (e.g., from ECS restart losing sessions)
 */
function isSessionRelated500Error(error: any): boolean {
  if (error?.statusCode !== 500 && error?.status !== 500) return false
  const message = (
    error?.message ||
    error?.statusMessage ||
    error?.data?.message ||
    ''
  ).toLowerCase()
  return (
    message.includes('session') ||
    message.includes('authentication') ||
    message.includes('unauthorized') ||
    message.includes('not authenticated')
  )
}

/**
 * Check if error is an auth error (401 or session-related)
 */
function isAuthError(error: any): boolean {
  return (
    error?.statusCode === 401 ||
    error?.status === 401 ||
    error?.data?.requiresReauth === true ||
    isSessionRelated500Error(error)
  )
}

/**
 * Attempt to refresh the session
 * Returns true if refresh succeeded, false otherwise
 */
async function tryRefreshSession(): Promise<boolean> {
  // If already refreshing, wait for that refresh to complete
  if (isRefreshing && refreshPromise) {
    return refreshPromise
  }

  isRefreshing = true
  refreshPromise = (async () => {
    try {
      console.log('[GHOST-AUTH] Attempting to refresh session...')

      // Call the nuxt-oidc-auth refresh endpoint directly
      // This is more reliable than using the composable in plugin context
      const response = await fetch('/api/_auth/refresh', {
        method: 'POST',
        credentials: 'include'
      })

      if (response.ok) {
        console.log('[GHOST-AUTH] Session refresh successful')
        return true
      } else {
        console.log('[GHOST-AUTH] Session refresh failed with status:', response.status)
        return false
      }
    } catch (err) {
      console.error('[GHOST-AUTH] Session refresh error:', err)
      return false
    } finally {
      isRefreshing = false
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Redirect to session expired page
 */
function redirectToSessionExpired(): void {
  const currentPath = window.location.pathname

  // Skip if already on auth pages to avoid loops
  if (currentPath.startsWith('/auth/')) {
    console.log('[GHOST-AUTH] Already on auth page, not redirecting')
    return
  }

  console.log('[GHOST-AUTH] Redirecting to session-expired page')

  try {
    const { saveReturnUrl } = useAuthRedirect()
    saveReturnUrl()
  } catch (e) {
    // Fallback: save to sessionStorage directly
    sessionStorage.setItem('auth_return_url', window.location.href)
  }

  window.location.href = '/auth/session-expired'
}

export default defineNuxtPlugin(() => {
  // Only run on client side
  if (import.meta.server) return

  const originalFetch = globalThis.$fetch

  // Track requests that have already been retried to prevent infinite loops
  const retriedRequests = new WeakSet<object>()

  globalThis.$fetch = async (...args: Parameters<typeof originalFetch>) => {
    try {
      return await originalFetch(...args)
    } catch (error: any) {
      // Check if this is an authentication error
      if (!isAuthError(error)) {
        throw error
      }

      console.log('[GHOST-AUTH] Auth error detected:', error?.statusCode || error?.status)

      // Get the request options to check if we've already retried
      const requestOptions = args[1] || {}

      // Check if we've already retried this request
      if (retriedRequests.has(requestOptions)) {
        console.log('[GHOST-AUTH] Already retried this request, redirecting')
        redirectToSessionExpired()
        throw error
      }

      // Try to refresh the session
      const refreshed = await tryRefreshSession()

      if (refreshed) {
        // Mark this request as retried
        retriedRequests.add(requestOptions)

        console.log('[GHOST-AUTH] Retrying original request after refresh')
        try {
          // Retry the original request
          return await originalFetch(...args)
        } catch (retryError: any) {
          // If retry also fails with auth error, redirect
          if (isAuthError(retryError)) {
            console.log('[GHOST-AUTH] Retry also failed with auth error, redirecting')
            redirectToSessionExpired()
          }
          throw retryError
        }
      } else {
        // Refresh failed, redirect to session expired
        console.log('[GHOST-AUTH] Session refresh failed, redirecting')
        redirectToSessionExpired()
        throw error
      }
    }
  }
})
