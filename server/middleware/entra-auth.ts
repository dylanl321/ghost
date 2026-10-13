/**
 * Entra Authentication Middleware
 * Handles both OIDC user authentication and API key authentication
 */

import { defineEventHandler, getHeader, createError, getRequestURL } from 'h3'
import type { H3Event } from 'h3'
import { validateApiKey, recordApiKeyUsage } from '../utils/api-keys'
import { getUserSession as getOIDCSession } from '../utils/entra/session'
import { logger } from '../utils/logger'

interface AuthContext {
  isAuthenticated: boolean
  authType: 'oidc' | 'apikey' | 'dev'
  user?: any
  apiKeyId?: string
  scopes?: string[]
}

export function isAllowedVmaasCostPath(pathname: string, method: string): boolean {
  return method === 'GET' && (pathname === '/api/integrations/vmaas/costs' ||
    /^\/api\/integrations\/vmaas\/instances\/i-[0-9a-f]{8,17}\/cost$/.test(pathname))
}

export function isAllowedIntegrationApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/v1/')
}

/**
 * Check if request is for API endpoints that require authentication
 */
export function requiresAuthentication(url: string): boolean {
  // Kiro Crew APIs perform exact OAuth resource/scope validation in their
  // handlers. A Ghost browser session or API key must not satisfy them.
  if (url.startsWith('/api/kirocrew/v1/')) {
    return false
  }
  // Exclude public endpoints that don't need auth
  const publicEndpoints = [
    '/api/health',
    '/api/schema',        // Schema metadata for query builder
    '/_nuxt/',
    '/api/_content',      // Nuxt content API
    '/api/_auth',         // OIDC authentication endpoints
    '/api/_nuxt_icon',    // Nuxt Icon API
    '/api/shortlinks/',
    '/api/reports/download/',
    '/api/dataset-reports/download/'
  ]

  // Check if URL starts with any public endpoint
  if (publicEndpoints.some(endpoint => url.startsWith(endpoint))) {
    return false
  }

  // All other /api/* routes require authentication
  return url.startsWith('/api/')
}


/**
 * Validate API key authentication
 */
async function validateAPIKeyAuth(event: H3Event): Promise<AuthContext | null> {
  const apiKey = getHeader(event, 'x-api-key')
  
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
    logger.error('API key validation failed:', error)
    return null
  }
}

/**
 * Validate OIDC user authentication
 * Uses the project's getUserSession utility which handles OIDC sessions
 */
async function validateOIDCAuth(event: H3Event): Promise<AuthContext | null> {
  try {
    // Check for nuxt-oidc-auth devMode session FIRST
    // Dev mode sessions need special handling to inject mock groups
    // so that server-side admin checks don't call Graph API
    try {
      const { getUserSession: getOIDCUserSession } = await import('nuxt-oidc-auth/runtime/server/utils/session.js')
      const oidcSession = await getOIDCUserSession(event)

      if (oidcSession?.provider === 'dev') {
        // Dev mode session - create auth context with mock groups
        const devGroups = (process.env.DEV_USER_GROUPS || 'AWS-Product-Team')
          .split(',')
          .map(g => g.trim())
          .filter(g => g.length > 0)

        logger.debug('Dev mode session detected, using groups:', devGroups)

        return {
          isAuthenticated: true,
          authType: 'oidc',
          user: {
            id: oidcSession.userName || 'dev-user',
            displayName: oidcSession.userName || 'Dev User',
            email: oidcSession.claims?.email || oidcSession.userInfo?.email || 'dev@localhost',
            groups: devGroups,
            claims: oidcSession.claims
          },
          scopes: ['*']
        }
      }
    } catch {
      // Ignore - devMode check is optional
    }

    // Get the OIDC session using the project's session utility
    const session = await getOIDCSession(event)

    if (session && (session.user || session.accessToken)) {
      // User has valid OIDC session
      // Authenticated users get full access to all APIs
      return {
        isAuthenticated: true,
        authType: 'oidc',
        user: session.user || { id: 'oidc-user', email: 'unknown' }, // User object from session
        scopes: ['*'] // Full access
      }
    }

    return null
  } catch (error) {
    logger.error('OIDC authentication check failed:', error)
    return null
  }
}


/**
 * Main authentication middleware
 */
export default defineEventHandler(async (event) => {
  // Only apply to API routes that require authentication
  if (!requiresAuthentication(event.node.req.url || '')) {
    return
  }

  logger.debug(`API auth check for: ${event.node.req.url}`)

  let authContext: AuthContext | null = null

  // Try API key authentication first
  authContext = await validateAPIKeyAuth(event)

  // If no API key, try OIDC authentication (includes nuxt-oidc-auth devMode sessions)
  if (!authContext) {
    authContext = await validateOIDCAuth(event)
  }
  
  // If no valid authentication found
  if (!authContext || !authContext.isAuthenticated) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required. Please provide a valid API key or sign in with Entra ID.'
    })
  }

  // Special rule: Entra APIs require OIDC authentication (need user's Entra token)
  const url = event.node.req.url || ''
  if (url.startsWith('/api/entra/') && authContext.authType !== 'oidc') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Entra APIs require user authentication. API keys cannot be used for Entra endpoints.'
    })
  }

  // Add auth context to event for use in API handlers
  event.context.auth = authContext

  // Compute Foundry's VMaaS key is intentionally incapable of reaching any
  // other GHOST surface, even if it is accidentally sent to the wrong path.
  if (authContext.authType === 'apikey' && authContext.scopes?.includes('vmaas:costs:read')) {
    const pathname = getRequestURL(event).pathname
    if (!isAllowedVmaasCostPath(pathname, event.node.req.method || '')) {
      throw createError({
        statusCode: 403,
        statusMessage: 'The VMaaS cost key is restricted to VMaaS cost APIs.'
      })
    }
  }

  if (authContext.authType === 'apikey' && !authContext.scopes?.includes('vmaas:costs:read')) {
    const pathname = getRequestURL(event).pathname
    if (!isAllowedIntegrationApiPath(pathname)) {
      throw createError({
        statusCode: 403,
        statusMessage: 'Integration API keys are restricted to the supported /api/v1 contract.'
      })
    }
  }

  // Log successful authentication
  logger.debug(`Authenticated via ${authContext.authType} for ${event.node.req.url}`)

  // Record API key usage for audit trail (async, non-blocking)
  if (authContext.authType === 'apikey' && authContext.apiKeyId) {
    const url = getRequestURL(event)
    const method = event.node.req.method || 'GET'
    const ipAddress = event.node.req.headers['x-forwarded-for'] as string ||
                      event.node.req.headers['x-real-ip'] as string ||
                      event.node.req.socket?.remoteAddress
    const userAgent = event.node.req.headers['user-agent'] as string

    // Record usage after request completes
    event.node.res.on('finish', () => {
      const statusCode = event.node.res.statusCode
      recordApiKeyUsage(
        authContext.apiKeyId!,
        url.pathname,
        method,
        statusCode,
        ipAddress,
        userAgent
      ).catch(err => {
        logger.error('Failed to record API key usage:', err)
      })
    })
  }
})

/**
 * Helper function to get auth context in API handlers
 */
export function getAuthContext(event: H3Event): AuthContext {
  return event.context.auth as AuthContext
}

/**
 * Check if user is authenticated
 * Simplified: authenticated users have full access (except API keys can't use Entra APIs)
 */
export function isAuthenticated(event: H3Event): boolean {
  const auth = getAuthContext(event)
  return auth?.isAuthenticated || false
}

/**
 * Check if user is authenticated via OIDC (not API key)
 * Use this for Entra API endpoints that require user's token
 */
export function isOIDCAuthenticated(event: H3Event): boolean {
  const auth = getAuthContext(event)
  return auth?.isAuthenticated && auth?.authType === 'oidc' || false
}

/**
 * Require OIDC authentication (throws if not authenticated via OIDC)
 * Use this for Entra API endpoints
 */
export function requireOIDCAuth(event: H3Event): void {
  if (!isOIDCAuthenticated(event)) {
    throw createError({
      statusCode: 403,
      statusMessage: 'This endpoint requires user authentication. API keys are not supported.'
    })
  }
}

/**
 * Legacy scope functions - updated to perform actual scope checks
 * For 'admin' scope, delegates to the real admin group membership check
 */
export function hasScope(event: H3Event, requiredScope: string): boolean {
  const auth = getAuthContext(event)
  if (!auth?.isAuthenticated) return false
  if (auth.authType !== 'apikey' || !requiredScope.includes(':')) return true
  return Boolean(auth.scopes?.includes(requiredScope))
}

export async function requireScope(event: H3Event, requiredScope: string): Promise<void> {
  if (!isAuthenticated(event)) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }

  if (!hasScope(event, requiredScope)) {
    throw createError({
      statusCode: 403,
      statusMessage: `API key requires ${requiredScope} scope`
    })
  }

  // For admin scope, perform a real admin group membership check
  if (requiredScope === 'admin') {
    const { requireAdmin } = await import('../utils/user-roles')
    await requireAdmin(event)
  }
}
