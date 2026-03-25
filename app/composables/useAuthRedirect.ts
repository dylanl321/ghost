const logger = createLogger('GHOST-AUTH')

/**
 * Composable for handling authentication redirects with return URL preservation
 *
 * This composable works with Nuxt OIDC Auth to preserve the user's original URL
 * through the OAuth authentication flow:
 *
 * 1. When auth is needed, middleware calls saveReturnUrl() to save the current URL
 * 2. Middleware returns abortNavigation() to let OIDC handle the redirect to Entra
 * 3. After Entra auth, OIDC redirects to /auth/loading (configured in nuxt.config.ts)
 * 4. The loading page reads from sessionStorage to get the saved URL
 * 5. User is redirected back to their original page
 *
 * SessionStorage is used instead of query parameters because:
 * - Query parameters are lost during the OAuth redirect flow
 * - SessionStorage persists across redirects within the same tab
 */

export const useAuthRedirect = () => {
  /**
   * Save the current URL before redirecting to auth
   * Call this from middleware before letting OIDC handle the auth flow
   */
  const saveReturnUrl = (url?: string) => {
    const returnUrl = url || window.location.pathname + window.location.search
    sessionStorage.setItem('auth_return_url', returnUrl)
    logger.info('Saved return URL:', returnUrl)
  }

  /**
   * Get the saved return URL or fallback
   * NOTE: This does NOT remove the value - call clearReturnUrl() after successful navigation
   */
  const getReturnUrl = (): string => {
    const savedUrl = sessionStorage.getItem('auth_return_url')
    logger.info('Getting return URL:', savedUrl)
    if (savedUrl) {
      // Don't remove here - clearReturnUrl() should be called after successful redirect
      // This prevents issues with re-renders or multiple calls returning '/'
      return savedUrl
    }
    return '/'
  }

  /**
   * Redirect to auth loading page with return URL
   */
  const redirectToAuth = (returnUrl?: string) => {
    // Save the return URL
    saveReturnUrl(returnUrl)
    
    // Use window.location.href for full page navigation
    // This ensures the loading page displays full-screen
    const authUrl = returnUrl 
      ? `/auth/loading?returnTo=${encodeURIComponent(returnUrl)}`
      : '/auth/loading'
    
    logger.info('Redirecting to auth:', authUrl)
    window.location.href = authUrl
  }

  /**
   * Handle authentication requirement
   * Call this when a page detects the user needs to re-authenticate
   */
  const requireAuth = () => {
    const currentUrl = window.location.pathname + window.location.search
    logger.info('Authentication required, current URL:', currentUrl)
    redirectToAuth(currentUrl)
  }

  /**
   * Clear any saved return URL
   * Call this after successful navigation to the return URL
   */
  const clearReturnUrl = () => {
    logger.info('Clearing return URL from sessionStorage')
    sessionStorage.removeItem('auth_return_url')
  }

  return {
    saveReturnUrl,
    getReturnUrl,
    redirectToAuth,
    requireAuth,
    clearReturnUrl
  }
}