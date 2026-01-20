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

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return

      // Tab became visible - check if session is still valid
      const { user, loggedIn } = useOidcAuth()

      if (!loggedIn.value) return // Not logged in anyway

      const accessToken = user.value?.accessToken
      if (!accessToken) return // No token to check

      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]))
        const now = Date.now() / 1000

        if (payload.exp && payload.exp < now) {
          console.log('[GHOST-AUTH] Token expired while tab was hidden, redirecting')
          const { saveReturnUrl } = useAuthRedirect()
          saveReturnUrl()
          window.location.href = '/auth/session-expired'
        }
      } catch {
        // Token parsing failed - let normal flow handle it
        console.warn('[GHOST-AUTH] Could not parse token for visibility check')
      }
    })
  }
}

export default defineNuxtRouteMiddleware((to, from) => {
  // Skip on server-side rendering
  if (import.meta.server) return

  // Skip if already on auth pages
  if (to.path.startsWith('/auth/')) return

  // Skip for public shared content pages (no auth required)
  if (to.path.startsWith('/chat/shared/')) return
  if (to.path.startsWith('/s/')) return

  const { user, loggedIn } = useOidcAuth()
  const { isBypassEnabled } = useDevAuth()

  // Check if authentication is required
  const needsAuth = !loggedIn.value && !isBypassEnabled()
  
  // If authentication is needed and we're not already going to auth
  if (needsAuth) {
    console.log('[GHOST-AUTH] Middleware: Auth required for:', to.fullPath)

    // Save the return URL to sessionStorage before OIDC takes over
    const { saveReturnUrl } = useAuthRedirect()
    saveReturnUrl(to.fullPath)

    // Let OIDC's middleware handle the actual redirect to Entra
    // It will redirect to the configured callbackRedirectUrl after auth
    // Don't manually redirect here - just abort and let OIDC handle it
    console.log('[GHOST-AUTH] Middleware: Aborting navigation, letting OIDC handle redirect')
    return abortNavigation()
  }

  // Check for expired tokens or invalid auth state
  if (loggedIn.value && user.value) {
    // Add token expiration check if available
    const accessToken = user.value.accessToken
    if (accessToken) {
      try {
        // Basic JWT expiration check (if using JWT tokens)
        const payload = JSON.parse(atob(accessToken.split('.')[1]))
        const now = Date.now() / 1000
        
        if (payload.exp && payload.exp < now) {
          console.log('[GHOST-AUTH] Middleware: Token expired, redirecting to auth')
          const { saveReturnUrl } = useAuthRedirect()
          saveReturnUrl(to.fullPath)
          return abortNavigation()
        }
      } catch (error) {
        console.warn('Could not parse token for expiration check:', error)
        // Continue with navigation - let the auth loading page handle validation
      }
    }
  }

  // Log page navigation
  const email = user.value?.claims?.email as string
  const username = email.split("@")[0] || "UnknownUser";
  const logMessage = `Navigation - USER:${username}, PATH:${to.fullPath}`;
  logActivity(logMessage);
})