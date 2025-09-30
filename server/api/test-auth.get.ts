/**
 * Test endpoint to check authentication status
 */
export default defineEventHandler(async (event) => {
  const authContext = event.context.auth

  return {
    success: true,
    authenticated: !!authContext,
    authType: authContext?.authType || 'none',
    message: authContext ? 'Authenticated' : 'NOT AUTHENTICATED - MIDDLEWARE NOT RUNNING',
    middlewareRan: true,
    env: {
      NODE_ENV: process.env.NODE_ENV,
      ENTRA_DEV_BYPASS: process.env.ENTRA_DEV_BYPASS
    }
  }
})
