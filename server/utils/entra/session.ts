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
  
  // Development mode - use test token or mock session
  if (process.env.NODE_ENV === 'development') {
    // Use environment variable for development testing
    if (process.env.ENTRA_TEST_ACCESS_TOKEN) {
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
    
    console.log('Development mode: No test token configured')
  }
  
  // Production mode - use actual OIDC session
  try {
    console.log('Checking for OIDC session...')
    console.log('Event context keys:', Object.keys(event.context || {}))
    console.log('Request headers:', {
      authorization: !!event.node.req.headers.authorization,
      cookie: !!event.node.req.headers.cookie
    })
    
    // Check various places where the session might be stored
    const session = event.context?.session || 
                   event.context?.user || 
                   event.context?.oidc ||
                   event.context?.auth ||
                   null
    
    console.log('Session from context:', {
      hasSession: !!session,
      hasAccessToken: !!session?.accessToken,
      hasUser: !!session?.user,
      sessionKeys: session ? Object.keys(session) : [],
      sessionType: typeof session
    })
    
    // Check Authorization header as fallback
    const authHeader = event.node.req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      console.log('Found Bearer token in Authorization header')
      const token = authHeader.substring(7)
      
      // If we don't have a session but have a token, create a minimal session
      if (!session?.accessToken) {
        return {
          accessToken: token,
          user: {
            id: 'header-user',
            displayName: 'Header User',
            email: 'unknown@header'
          }
        }
      }
    }
    
    // Try to get session from cookies if available
    const cookies = event.node.req.headers.cookie
    if (cookies && !session?.accessToken) {
      console.log('Found cookies, but no direct session access method available')
      console.log('Cookie names:', cookies.split(';').map(c => c.split('=')[0].trim()))
    }
    
    if (!session?.accessToken) {
      console.log('No access token found anywhere')
      return null
    }
    
    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      user: session.user || session
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