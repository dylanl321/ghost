/**
 * Entra Authentication Middleware
 * Handles both OIDC user authentication and API key authentication
 */

import { defineEventHandler, getHeader, createError } from 'h3'
import type { H3Event } from 'h3'
import { validateApiKey } from '../utils/api-keys'
import { getUserSession } from '../utils/entra/session'

interface AuthContext {
  isAuthenticated: boolean
  authType: 'oidc' | 'apikey' | 'dev'
  user?: any
  apiKeyId?: string
  scopes?: string[]
}

/**
 * Check if request is for Entra API endpoints
 */
function isEntraAPIRequest(url: string): boolean {
  return url.startsWith('/api/entra/')
}

/**
 * Check if development mode is enabled
 */
function isDevelopmentMode(): boolean {
  // Allow dev bypass without explicit env var in development
  return process.env.NODE_ENV === 'development'
}

/**
 * Check if request has dev mode token
 */
function hasDevModeToken(event: H3Event): boolean {
  const authHeader = getHeader(event, 'authorization')
  return authHeader?.includes('dev-mode-token-') || false
}

/**
 * Validate API key authentication
 */
async function validateAPIKeyAuth(event: H3Event): Promise<AuthContext | null> {
  const apiKey = getHeader(event, 'x-api-key') || getHeader(event, 'authorization')?.replace('Bearer ', '')
  
  if (!apiKey) {
    return null
  }
  
  try {
    const keyInfo = await validateApiKey(apiKey)
    if (!keyInfo.valid) {
      return null
    }
    
    return {
      isAuthenticated: true,
      authType: 'apikey',
      apiKeyId: keyInfo.id,
      scopes: keyInfo.scopes || []
    }
  } catch (error) {
    console.error('API key validation failed:', error)
    return null
  }
}

/**
 * Validate OIDC user authentication
 */
async function validateOIDCAuth(event: H3Event): Promise<AuthContext | null> {
  try {
    // This will be replaced with actual OIDC session check
    // For now, try to get user session
    const session = await getUserSession(event)
    
    if (!session?.accessToken) {
      return null
    }
    
    // Validate token is still valid (basic check)
    if (session.user && session.accessToken) {
      return {
        isAuthenticated: true,
        authType: 'oidc',
        user: session.user,
        scopes: ['read', 'write'] // Default scopes for authenticated users
      }
    }
    
    return null
  } catch (error) {
    console.error('OIDC authentication check failed:', error)
    return null
  }
}

/**
 * Development mode authentication bypass
 */
function createDevAuthContext(): AuthContext {
  return {
    isAuthenticated: true,
    authType: 'dev',
    user: {
      id: 'dev-user',
      displayName: 'Development User',
      email: 'dev@localhost'
    },
    scopes: ['read', 'write', 'admin']
  }
}

/**
 * Main authentication middleware
 */
export default defineEventHandler(async (event) => {
  // Only apply to Entra API routes
  if (!isEntraAPIRequest(event.node.req.url || '')) {
    return
  }
  
  console.log(`Entra auth check for: ${event.node.req.url}`)
  
  let authContext: AuthContext | null = null
  
  // Development mode bypass - check for dev token or dev environment
  if (isDevelopmentMode() && hasDevModeToken(event)) {
    authContext = createDevAuthContext()
    console.log('Development mode: bypassing authentication with dev token')
  } else if (isDevelopmentMode() && process.env.ENTRA_DEV_BYPASS === 'true') {
    // Legacy env var check for backwards compatibility
    authContext = createDevAuthContext()
    console.log('Development mode: bypassing authentication (ENTRA_DEV_BYPASS=true)')
  } else {
    // Try API key authentication first
    authContext = await validateAPIKeyAuth(event)
    
    // If no API key, try OIDC authentication
    if (!authContext) {
      authContext = await validateOIDCAuth(event)
    }
  }
  
  // If no valid authentication found
  if (!authContext || !authContext.isAuthenticated) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required. Please provide a valid API key or sign in with Entra ID.'
    })
  }
  
  // Add auth context to event for use in API handlers
  event.context.auth = authContext
  
  // Log successful authentication
  console.log(`Authenticated via ${authContext.authType} for ${event.node.req.url}`)
})

/**
 * Helper function to get auth context in API handlers
 */
export function getAuthContext(event: H3Event): AuthContext {
  return event.context.auth as AuthContext
}

/**
 * Check if user has required scope
 */
export function hasScope(event: H3Event, requiredScope: string): boolean {
  const auth = getAuthContext(event)
  return auth?.scopes?.includes(requiredScope) || auth?.scopes?.includes('admin') || false
}

/**
 * Require specific scope (throws if not authorized)
 */
export function requireScope(event: H3Event, requiredScope: string): void {
  if (!hasScope(event, requiredScope)) {
    throw createError({
      statusCode: 403,
      statusMessage: `Insufficient permissions. Required scope: ${requiredScope}`
    })
  }
}