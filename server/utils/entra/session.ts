/**
 * Entra ID Session Management
 * Temporary session management until OIDC integration is complete
 */

import type { H3Event } from 'h3'
import { createError } from 'h3'

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
  console.log('getUserSession called - checking all sources...')

  // Always check Authorization header first (works for both dev and prod)
  const authHeader = event.node.req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    console.log('Found Bearer token in Authorization header')
    const token = authHeader.substring(7)
    return {
      accessToken: token,
      user: {
        id: 'bearer-user',
        displayName: 'Bearer Token User',
        email: 'bearer@auth'
      }
    }
  }

  // Development mode - use test token ONLY if explicitly set
  const nodeEnv = process.env.NODE_ENV?.toLowerCase()
  if ((nodeEnv === 'development' || nodeEnv === 'dev') && process.env.ENTRA_TEST_ACCESS_TOKEN) {
    console.log('Using test access token from environment variable')
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
    console.log('Checking for OIDC session...')
    console.log('Event context keys:', Object.keys(event.context || {}))

    // Try to use nuxt-oidc-auth's built-in session function
    let oidcSession = null
    try {
      // Import getUserSession from nuxt-oidc-auth
      const { getUserSession: getOIDCUserSession } = await import('nuxt-oidc-auth/runtime/server/utils/session.js')
      oidcSession = await getOIDCUserSession(event)
      // console.log('OIDC Session from nuxt-oidc-auth:', {
      //   hasSession: !!oidcSession,
      //   keys: oidcSession ? Object.keys(oidcSession) : []
      // })
    } catch (e) {
      console.log('Could not get session from nuxt-oidc-auth:', e.message)

      // Fallback to h3 session
      try {
        const { getSession } = await import('h3')
        oidcSession = await getSession(event, {
          password: process.env.NUXT_OIDC_SESSION_SECRET || process.env.NUXT_SESSION_PASSWORD || 'secret-must-be-at-least-32-characters-long'
        })
        console.log('OIDC Session from h3:', {
          hasSession: !!oidcSession,
          keys: oidcSession ? Object.keys(oidcSession) : []
        })
      } catch (e2) {
        console.log('Could not get h3 session:', e2.message)
      }
    }

    // Check various places where the session might be stored
    const contextSession = event.context?.session ||
                          event.context?.user ||
                          event.context?.oidc ||
                          event.context?.auth ||
                          null

    const session = oidcSession || contextSession

    // console.log('Session details:', {
    //   hasSession: !!session,
    //   hasAccessToken: !!session?.accessToken,
    //   hasAccess_token: !!session?.access_token,
    //   hasUser: !!session?.user,
    //   hasData: !!session?.data,
    //   sessionKeys: session ? Object.keys(session) : [],
    //   dataKeys: session?.data ? Object.keys(session.data) : [],
    //   userKeys: session?.user ? Object.keys(session.user) : [],
    //   sessionType: typeof session
    // })

    if (!session) {
      console.log('No session found in any location')
      return null
    }

    // h3 sessions wrap data in a 'data' property
    // Check both the top level and inside 'data'
    const sessionData = session.data || session

    // console.log('Session data structure:', {
    //   hasSessionData: !!sessionData,
    //   dataKeys: sessionData ? Object.keys(sessionData) : [],
    //   hasAccessToken: !!sessionData?.accessToken,
    //   hasUser: !!sessionData?.user
    // })

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

    // Debug log to verify we have the necessary ID claims
    if (user) {
      console.log('Extracted user with ID claims:', {
        hasEmail: !!user.email,
        hasOid: !!user.oid,
        hasSub: !!user.sub,
        hasId: !!user.id,
        userName: user.name || user.email,
        mergedFromBoth: !!(baseUser && claims)
      })
    }

    const accessToken = sessionData.accessToken || sessionData.access_token || session.accessToken || session.access_token

    // Be more lenient: Accept if we have an access token (proves authentication)
    // OR if we have a user object with some identifying info
    if (!accessToken) {
      if (!user || typeof user !== 'object') {
        console.log('Session exists but has no valid access token or user info')
        console.log('User value:', user)
        return null
      }
      // If no access token, require user to have SOME identifying info
      // Check common OIDC claim fields
      const hasIdentity = user.email || user.id || user.sub || user.preferred_username || user.name || user.upn || user.unique_name
      if (!hasIdentity) {
        console.log('User object exists but has no identifying information')
        console.log('User keys:', Object.keys(user))
        console.log('User sample values:', {
          email: user.email,
          id: user.id,
          sub: user.sub,
          name: user.name,
          preferred_username: user.preferred_username
        })
        return null
      }
    }

    console.log('Session validated successfully')
    // console.log('Session validated successfully with:', {
    //   hasToken: !!accessToken,
    //   hasUser: !!user,
    //   userEmail: user?.email || user?.preferred_username || user?.upn || user?.unique_name,
    //   userId: user?.id || user?.sub || user?.oid,
    //   userName: user?.name || user?.displayName,
    //   claimsKeys: user ? Object.keys(user) : []
    // })

    return {
      accessToken: accessToken,
      refreshToken: sessionData.refreshToken || sessionData.refresh_token || session.refreshToken || session.refresh_token,
      user: user || { id: 'session-user', email: 'unknown' }
    }
  } catch (error) {
    console.error('Failed to get OIDC session:', error)
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