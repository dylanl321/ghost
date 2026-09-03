/**
 * Entra ID Session Management
 * Temporary session management until OIDC integration is complete
 */

import type { H3Event } from 'h3'
import { createError } from 'h3'
import { logger } from '../logger'

async function getPersistentOidcRefreshToken(event: H3Event): Promise<string | undefined> {
  try {
    const [{ getUserSessionId }, { decryptToken }, { useStorage }] = await Promise.all([
      import('nuxt-oidc-auth/runtime/server/utils/session.js'),
      import('nuxt-oidc-auth/runtime/server/utils/security.js'),
      import('nitropack/runtime')
    ])
    const sessionId = await getUserSessionId(event)
    const persistentSession = await useStorage('oidc').getItem<{ refreshToken?: unknown }>(sessionId)
    const tokenKey = process.env.NUXT_OIDC_TOKEN_KEY
    if (!persistentSession?.refreshToken || !tokenKey) return undefined
    return await decryptToken(persistentSession.refreshToken as any, tokenKey)
  } catch (error) {
    logger.warn('Unable to read the persistent delegated refresh token:', error)
    return undefined
  }
}

/**
 * Validate JWT token expiration
 */
function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return true
    
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64').toString())
    if (!payload.exp) return false // No expiration claim, assume valid
    
    const now = Math.floor(Date.now() / 1000)
    return payload.exp < now
  } catch (error) {
    logger.warn('Failed to parse token for expiration check:', error)
    return true // Treat unparseable tokens as expired
  }
}

/**
 * Get user session with access token
 * Supports both OIDC sessions and development mode
 * 
 * When integrating with nuxt-oidc, this will use:
 * - await getUserSession(event) from nuxt-oidc server utils
 * - Session will contain the access token from Entra ID
 */
export async function getUserSession(event: H3Event): Promise<{
  accessToken?: string
  refreshToken?: string
  user?: any
} | null> {
  // Development mode - use test token ONLY if explicitly set
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if ((nodeEnv === 'development' || nodeEnv === 'dev') && process.env.ENTRA_TEST_ACCESS_TOKEN) {
    return {
      accessToken: process.env.ENTRA_TEST_ACCESS_TOKEN,
      user: {
        id: 'test-user',
        displayName: 'Test User',
        email: process.env.ENTRA_TEST_USER_EMAIL || 'test@gd-ms.com'
      }
    }
  }

  // Production mode - use actual OIDC session
  try {

    // Try to use nuxt-oidc-auth's built-in session function
    let oidcSession = null
    try {
      // Import getUserSession from nuxt-oidc-auth
      const { getUserSession: getOIDCUserSession } = await import('nuxt-oidc-auth/runtime/server/utils/session.js')
      oidcSession = await getOIDCUserSession(event)
    } catch {
      // Fallback to h3 session silently (this is expected for unauthenticated requests)
      try {
        const { getSession } = await import('h3')
        oidcSession = await getSession(event, {
          password: process.env.NUXT_OIDC_SESSION_SECRET || process.env.NUXT_SESSION_PASSWORD || 'secret-must-be-at-least-32-characters-long'
        })
      } catch {
        // Silently handle - this is expected for unauthenticated requests
      }
    }

    // Check various places where the session might be stored
    const contextSession = event.context?.session ||
                          event.context?.user ||
                          event.context?.oidc ||
                          event.context?.auth ||
                          null

    const session = oidcSession || contextSession

    if (!session) {
      return null
    }

    // h3 sessions wrap data in a 'data' property
    // Check both the top level and inside 'data'
    const sessionData = session.data || session

    // Extract user and token information from session
    // nuxt-oidc-auth might store user in different ways:
    // - session.user: Direct user object (profile info like email, name)
    // - session.claims: OIDC claims containing user info (includes oid, sub)
    // - session.data.user or session.data.claims: Wrapped in data property
    // IMPORTANT: We need to merge user and claims to get both profile info AND id claims (like oid)
    const baseUser = sessionData.user || session.user
    const claims = sessionData.claims || session.claims

    // Merge user object with claims to ensure we have all necessary fields
    // Azure AD/Entra uses 'oid' as the Object ID, which is needed for Graph API calls
    const user = baseUser && claims
      ? { ...baseUser, ...claims } // Merge both to get profile + token claims
      : (baseUser || claims) // Fallback to whichever exists

    const accessToken = sessionData.accessToken || sessionData.access_token || session.accessToken || session.access_token

    // Be more lenient: Accept if we have an access token (proves authentication)
    // OR if we have a user object with some identifying info
    if (!accessToken) {
      if (!user || typeof user !== 'object') {
        return null
      }
      // If no access token, require user to have SOME identifying info
      // Check common OIDC claim fields
      const hasIdentity = user.email || user.id || user.sub || user.preferred_username || user.name || user.upn || user.unique_name
      if (!hasIdentity) {
        return null
      }
    }

    // Validate token expiration if we have an access token
    if (accessToken && isTokenExpired(accessToken)) {
      logger.debug('Session access token is expired')
      return null
    }

    // Log successful authentication (useful for security auditing)
    if (user) {
      logger.debug('User authenticated:', {
        userName: user.name || user.email,
        hasToken: !!accessToken
      })
    }

    return {
      accessToken: accessToken,
      refreshToken: sessionData.refreshToken || sessionData.refresh_token || session.refreshToken || session.refresh_token || await getPersistentOidcRefreshToken(event),
      user: user || { id: 'session-user', email: 'unknown' }
    }
  } catch (error) {
    logger.error('Failed to get OIDC session:', error)
    return null
  }
}

/**
 * Require user session (throws if not authenticated)
 */
export async function requireUserSession(event: H3Event) {
  const session = await getUserSession(event)
  
  if (!session?.accessToken) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required. Please sign in with your Entra ID account.'
    })
  }
  
  return session
}
