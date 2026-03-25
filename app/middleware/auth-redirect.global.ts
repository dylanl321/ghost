const logger = createLogger('GHOST-AUTH')

/**
 * Global middleware to handle authentication redirects
 * This middleware preserves the current URL when redirecting to auth
 */

// Handle tab visibility changes (user returning to sleeping tab)
// This runs at module level to ensure listener is added once
if (import.meta.client) {
  let visibilityListenerAdded = false

  // Only add once
  if (!visibilityListenerAdded) {
    visibilityListenerAdded = true

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible') return

      // Tab became visible - check if session is still valid
      const { user, loggedIn } = useOidcAuth()

      if (!loggedIn.value) return // Not logged in anyway

      const accessToken = user.value?.accessToken
      if (!accessToken) return // No token to check

      // First check local JWT expiration (fast check)
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]))
        const now = Date.now() / 1000

        if (payload.exp && payload.exp < now) {
          logger.info('Token expired while tab was hidden, redirecting')
          const { saveReturnUrl } = useAuthRedirect()
          saveReturnUrl()
          window.location.href = '/auth/session-expired'
          return
        }
      } catch {
        // Token parsing failed - let normal flow handle it
        logger.warn('Could not parse token for visibility check')
      }

      // Then validate server-side session (catches ECS restart scenario)
      // This ensures we detect when in-memory sessions are lost
      try {
        await $fetch('/api/user/session-check', { method: 'HEAD' })
      } catch (error: any) {
        if (error?.statusCode === 401 || error?.status === 401) {
          logger.info('Server session invalid after tab resume, redirecting')
          const { saveReturnUrl } = useAuthRedirect()
          saveReturnUrl()
          window.location.href = '/auth/session-expired'
        }
        // Other errors (network, 500) - don't redirect, let normal flow handle
      }
    })
  }
}

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip on server-side rendering
  if (import.meta.server) return

  // Skip if already on auth pages
  if (to.path.startsWith('/auth/')) return

  // Skip for public shared content pages (no auth required)
  if (to.path.startsWith('/chat/shared/')) return
  if (to.path.startsWith('/s/')) return

  const { user, loggedIn, login } = useOidcAuth()

  // Check if authentication is required (devMode handled by nuxt-oidc-auth)
  const needsAuth = !loggedIn.value

  // If authentication is needed and we're not already going to auth
  if (needsAuth) {
    logger.info('Middleware: Auth required for:', to.fullPath)

    // Save the return URL to sessionStorage before OIDC takes over
    const { saveReturnUrl } = useAuthRedirect()
    saveReturnUrl(to.fullPath)

    // Trigger OIDC login directly (global OIDC middleware is disabled so we control ordering)
    logger.info('Middleware: Triggering login redirect')
    await login()
    return
  }

  // Skip JWT expiration check for dev provider (dev tokens don't have real exp)
  if (user.value?.provider === 'dev') {
    // Log navigation for dev mode
    const email = user.value?.claims?.email || user.value?.userInfo?.email || 'dev@localhost'
    const username = email.split("@")[0] || "DevUser"
    logActivity(`Navigation - USER:${username}, PATH:${to.fullPath}`)
    return
  }

  // Check for expired tokens or invalid auth state
  if (loggedIn.value && user.value) {
    const accessToken = user.value.accessToken
    if (accessToken) {
      try {
        // Basic JWT expiration check (if using JWT tokens)
        const payload = JSON.parse(atob(accessToken.split('.')[1]))
        const now = Date.now() / 1000

        if (payload.exp && payload.exp < now) {
          logger.info('Middleware: Token expired, redirecting to auth')
          const { saveReturnUrl } = useAuthRedirect()
          saveReturnUrl(to.fullPath)
          await login()
          return
        }
      } catch (error) {
        logger.warn('Could not parse token for expiration check:', error)
        // Continue with navigation - let the auth loading page handle validation
      }
    }
  }

  // Log page navigation (guarded - only when logged in with valid email)
  if (loggedIn.value && user.value) {
    const email = user.value?.claims?.email || user.value?.userInfo?.email || ''
    if (email) {
      const username = email.split("@")[0] || "UnknownUser"
      logActivity(`Navigation - USER:${username}, PATH:${to.fullPath}`)
    }
  }
})