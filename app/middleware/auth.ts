/**
 * Authentication middleware for protected pages
 * Use this middleware on pages that require authentication
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  // Skip on server-side rendering
  if (process.server) return

  const { user, loggedIn, login } = useOidcAuth()
  const { isBypassEnabled } = useDevAuth()

  // Allow bypass in development
  if (isBypassEnabled()) {
    return
  }

  // Check if user is authenticated
  if (!loggedIn.value || !user.value) {
    console.log('Authentication required for protected route:', to.fullPath)

    const { saveReturnUrl } = useAuthRedirect()
    saveReturnUrl(to.fullPath)

    await login()
    return
  }

  // Additional validation for token freshness
  const accessToken = user.value.accessToken
  if (!accessToken) {
    console.log('No access token available, redirecting to auth')

    const { saveReturnUrl } = useAuthRedirect()
    saveReturnUrl(to.fullPath)

    await login()
    return
  }

  // Validate essential user claims
  const claims = user.value.claims
  if (!claims?.email || !claims?.given_name) {
    console.log('Incomplete user profile, redirecting to auth')

    const { saveReturnUrl } = useAuthRedirect()
    saveReturnUrl(to.fullPath)

    await login()
    return
  }
})