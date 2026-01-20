/**
 * Global API auth error handler plugin
 *
 * This plugin intercepts all $fetch API calls and catches 401 authentication errors.
 * When a 401 is detected (indicating token expiration or invalid auth), it:
 * 1. Saves the current URL for return after re-authentication
 * 2. Redirects to /auth/session-expired for user-friendly UX
 * 3. Re-throws the error so calling code can handle it if needed
 */
export default defineNuxtPlugin(() => {
  // Only run on client side
  if (import.meta.server) return

  const originalFetch = globalThis.$fetch

  globalThis.$fetch = async (...args: Parameters<typeof originalFetch>) => {
    try {
      return await originalFetch(...args)
    } catch (error: any) {
      // Check if this is an authentication error
      const isAuthError =
        error?.statusCode === 401 ||
        error?.status === 401 ||
        error?.data?.requiresReauth === true

      const currentPath = window.location.pathname

      // Redirect to session-expired page, but skip if already on auth pages
      // to avoid redirect loops
      if (isAuthError && !currentPath.startsWith('/auth/')) {
        console.log('[GHOST-AUTH] API returned 401, redirecting to session-expired')
        const { saveReturnUrl } = useAuthRedirect()
        saveReturnUrl()
        window.location.href = '/auth/session-expired'
      }

      // Always re-throw so calling code sees the error
      throw error
    }
  }
})
