/**
 * Global middleware to handle authentication redirects
 * This middleware preserves the current URL when redirecting to auth
 */

export default defineNuxtRouteMiddleware((to, from) => {
  // Skip on server-side rendering
  if (import.meta.server) return

  // Skip if already on auth pages
  if (to.path.startsWith('/auth/')) return

  const { user, loggedIn } = useOidcAuth()
  const { isBypassEnabled } = useDevAuth()

  // Check if authentication is required
  const needsAuth = !loggedIn.value && !isBypassEnabled()
  
  // If authentication is needed and we're not already going to auth
  if (needsAuth) {
    console.log('Auth required for:', to.fullPath)
    
    // Use the auth redirect composable
    const { redirectToAuth } = useAuthRedirect()
    
    // Save the current URL and redirect to auth
    redirectToAuth(to.fullPath)
    
    // Abort the current navigation
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
          console.log('Token expired, redirecting to auth')
          const { redirectToAuth } = useAuthRedirect()
          redirectToAuth(to.fullPath)
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