/**
 * Composable for handling authentication redirects with return URL preservation
 */

export const useAuthRedirect = () => {
  /**
   * Save the current URL before redirecting to auth
   */
  const saveReturnUrl = (url?: string) => {
    const returnUrl = url || window.location.pathname + window.location.search
    sessionStorage.setItem('auth_return_url', returnUrl)
    console.log('Saved return URL:', returnUrl)
  }

  /**
   * Get the saved return URL or fallback
   */
  const getReturnUrl = (): string => {
    const savedUrl = sessionStorage.getItem('auth_return_url')
    if (savedUrl) {
      sessionStorage.removeItem('auth_return_url') // Clean up after use
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
    
    console.log('Redirecting to auth:', authUrl)
    window.location.href = authUrl
  }

  /**
   * Handle authentication requirement
   * Call this when a page detects the user needs to re-authenticate
   */
  const requireAuth = () => {
    const currentUrl = window.location.pathname + window.location.search
    console.log('Authentication required, current URL:', currentUrl)
    redirectToAuth(currentUrl)
  }

  /**
   * Clear any saved return URL
   */
  const clearReturnUrl = () => {
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