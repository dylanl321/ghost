/**
 * Entra Authentication Middleware
 * Handles both OIDC user authentication and API key authentication
 */

import { defineEventHandler, getHeader, createError, getRequestURL, setResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { validateApiKey, recordApiKeyUsage } from '../utils/api-keys'
import { getClientAddress } from '../utils/client-address'
import { isV1Path, sendV1Error } from '../utils/v1-errors'
import { getUserSession as getOIDCSession } from '../utils/entra/session'
import { requireAdmin } from '../utils/user-roles'
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
 * Resolve the request URL to the pathname the router will see. Dot segments
 * (including percent-encoded ones) are collapsed so a path such as
 * /api/health/../admin/x is judged as /api/admin/x, not as a public prefix.
 */
export function normalizeApiPath(url: string): string {
  // Collapse repeated slashes first so //api/... is neither parsed as a
  // protocol-relative URL nor allowed to dodge the /api/ prefix checks.
  const path = `/${url}`.replace(/\/{2,}/g, '/')
  try {
    return new URL(path, 'http://localhost').pathname.replace(/\/{2,}/g, '/')
  } catch {
    return path.split('?')[0] || ''
  }
}

/**
 * Check if request is for API endpoints that require authentication
 */
export function requiresAuthentication(url: string, method = 'GET'): boolean {
  const pathname = normalizeApiPath(url)
  const verb = method.toUpperCase()

  // Kiro Crew APIs perform exact OAuth resource/scope validation in their
  // handlers. A Ghost browser session or API key must not satisfy them.
  if (pathname.startsWith('/api/kirocrew/v1/')) {
    return false
  }

  // ALB and container health probe. Exact match only: /api/health/ready
  // exposes caller identity and host details and must stay authenticated.
  if (pathname === '/api/health') {
    return false
  }

  // The /s/:code redirect page resolves a short code before the visitor has
  // signed in. Only that single-code GET is public; listing (GET /api/shortlinks/)
  // and creation (POST) require a session.
  if ((verb === 'GET' || verb === 'HEAD') && /^\/api\/shortlinks\/[^/]+$/.test(pathname)) {
    return false
  }

  // Exclude public endpoints that don't need auth
  const publicPrefixes = [
    '/_nuxt/',
    '/api/_content',      // Nuxt content API
    '/api/_auth',         // OIDC authentication endpoints
    '/api/_nuxt_icon',    // Nuxt Icon API
    '/api/reports/download/',
    '/api/dataset-reports/download/'
  ]

  if (publicPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return false
  }

  // All other /api/* routes require authentication
  return pathname.startsWith('/api/')
}

/**
 * Admin routes readable by every signed-in user because non-admin pages
 * depend on them (the global announcement banner and the dashboard's
 * organization default layout). Everything else under /api/admin/ is
 * Administrator-only.
 */
const NON_ADMIN_READABLE_ADMIN_ROUTES = new Set([
  '/api/admin/announcements/list',
  '/api/admin/dashboard-layout/get-default'
])

/**
 * Whether a request must pass requireAdmin before reaching its handler.
 * Enforced centrally so an /api/admin/* handler that forgets its own check
 * cannot be reached by a regular user.
 */
export function requiresAdminAccess(url: string, method = 'GET'): boolean {
  const pathname = normalizeApiPath(url).replace(/\/+$/, '')
  if (!pathname.startsWith('/api/admin/')) {
    return false
  }

  const verb = method.toUpperCase()
  if ((verb === 'GET' || verb === 'HEAD') && NON_ADMIN_READABLE_ADMIN_ROUTES.has(pathname)) {
    return false
  }

  return true
}


interface APIKeyAuthResult {
  context: AuthContext | null
  /** Why a presented key was rejected, so the 401 can say so. */
  rejection?: string
  /** Validation could not reach key storage; the key itself may be fine. */
  unavailable?: boolean
}

/**
 * Validate API key authentication
 */
async function validateAPIKeyAuth(event: H3Event): Promise<APIKeyAuthResult> {
  const apiKey = getHeader(event, 'x-api-key')?.trim()
  
  if (!apiKey) {
    return { context: null }
  }
  
  try {
    const keyInfo = await validateApiKey(apiKey)
    if (!keyInfo.valid) {
      return {
        context: null,
        rejection: keyInfo.error || 'Invalid API key',
        unavailable: keyInfo.error === 'API key validation failed'
      }
    }
    
    return {
      context: {
        isAuthenticated: true,
        authType: 'apikey',
        apiKeyId: keyInfo.id,
        scopes: keyInfo.scopes || []
      }
    }
  } catch (error) {
    logger.error('API key validation failed:', error)
    return { context: null, rejection: 'API key validation failed', unavailable: true }
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
  if (!requiresAuthentication(event.node.req.url || '', event.node.req.method || 'GET')) {
    return
  }

  logger.debug(`API auth check for: ${event.node.req.url}`)

  let authContext: AuthContext | null = null

  // Try API key authentication first
  const apiKeyAuth = await validateAPIKeyAuth(event)
  authContext = apiKeyAuth.context

  // If no API key, try OIDC authentication (includes nuxt-oidc-auth devMode sessions)
  if (!authContext) {
    authContext = await validateOIDCAuth(event)
  }
  
  // If no valid authentication found
  if (!authContext || !authContext.isAuthenticated) {
    // A storage outage is not the caller's fault; tell integrations to retry
    // rather than to rotate a key that is probably still valid.
    const statusCode = apiKeyAuth.unavailable ? 503 : 401
    const statusMessage = apiKeyAuth.unavailable
      ? 'API key validation is temporarily unavailable. Retry shortly.'
      : apiKeyAuth.rejection
        ? `${apiKeyAuth.rejection}. Provide a valid, active key in the x-api-key header.`
        : 'Authentication required. Please provide a valid API key or sign in with Entra ID.'
    if (apiKeyAuth.unavailable) setResponseHeader(event, 'Retry-After', 5)
    // The integration contract documents a single error envelope.
    if (isV1Path(getRequestURL(event).pathname)) return sendV1Error(event, statusCode, statusMessage)
    throw createError({ statusCode, statusMessage })
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

  // Every /api/admin/* route is Administrator-only unless explicitly listed
  // as readable by all users. Handler-level checks remain as defense in depth.
  if (requiresAdminAccess(url, event.node.req.method || 'GET')) {
    await requireAdmin(event)
  }

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
    const ipAddress = getClientAddress(event.node.req)
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
