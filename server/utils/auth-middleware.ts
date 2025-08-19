/**
 * Authentication Middleware Utilities
 * 
 * Provides reusable authentication functions for protecting API routes
 * using nuxt-oidc-auth and session management.
 */

import type { H3Event } from 'h3'
import { createError } from 'h3'

/**
 * User session structure
 */
export interface UserSession {
  user: {
    id: string
    email: string
    name?: string
    roles?: string[]
    department?: string
    linesOfBusiness?: string[]
    permissions?: string[]
    [key: string]: any
  }
  metadata?: {
    loginTime: string
    provider: string
    expiresAt?: string
    lastActivity?: string
    [key: string]: any
  }
}

/**
 * Require authentication - throws 401 if user is not authenticated
 * @param event - H3 Event object
 * @returns User session
 */
export async function requireAuth(event: H3Event): Promise<UserSession> {
  try {
    // This will automatically throw 401 if no session exists
    const session = await requireUserSession(event) as UserSession
    
    // Validate session is not expired
    if (session.metadata?.expiresAt) {
      const expiresAt = new Date(session.metadata.expiresAt)
      if (expiresAt < new Date()) {
        await clearUserSession(event)
        throw createError({
          statusCode: 401,
          statusMessage: 'Session expired - please log in again'
        })
      }
    }
    
    // Update last activity
    if (session.metadata) {
      session.metadata.lastActivity = new Date().toISOString()
      await setUserSession(event, session)
    }
    
    return session
    
  } catch (error: any) {
    if (error.statusCode === 401) {
      throw error
    }
    
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required'
    })
  }
}

/**
 * Get current user session (returns null if not authenticated)
 * @param event - H3 Event object
 * @returns User session or null
 */
export async function getCurrentUser(event: H3Event): Promise<UserSession | null> {
  try {
    const session = await getUserSession(event) as UserSession | null
    
    if (!session || !session.user) {
      return null
    }
    
    // Check if session is expired
    if (session.metadata?.expiresAt) {
      const expiresAt = new Date(session.metadata.expiresAt)
      if (expiresAt < new Date()) {
        await clearUserSession(event)
        return null
      }
    }
    
    return session
    
  } catch (error) {
    console.warn('Error getting current user session:', error)
    return null
  }
}

/**
 * Require specific role(s) - throws 403 if user doesn't have required role
 * @param roles - Required role or array of roles (user needs at least one)
 * @returns Function that validates the role requirement
 */
export function requireRole(roles: string | string[]) {
  const requiredRoles = Array.isArray(roles) ? roles : [roles]
  
  return async (event: H3Event): Promise<UserSession> => {
    const session = await requireAuth(event)
    
    if (!session.user.roles || session.user.roles.length === 0) {
      throw createError({
        statusCode: 403,
        statusMessage: 'User has no assigned roles'
      })
    }
    
    const hasRequiredRole = requiredRoles.some(role => 
      session.user.roles?.includes(role)
    )
    
    if (!hasRequiredRole) {
      throw createError({
        statusCode: 403,
        statusMessage: `Access denied. Requires one of: ${requiredRoles.join(', ')}`
      })
    }
    
    return session
  }
}

/**
 * Require specific permission(s) - throws 403 if user doesn't have required permission
 * @param permissions - Required permission or array of permissions
 * @returns Function that validates the permission requirement
 */
export function requirePermission(permissions: string | string[]) {
  const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions]
  
  return async (event: H3Event): Promise<UserSession> => {
    const session = await requireAuth(event)
    
    if (!session.user.permissions || session.user.permissions.length === 0) {
      throw createError({
        statusCode: 403,
        statusMessage: 'User has no assigned permissions'
      })
    }
    
    const hasRequiredPermission = requiredPermissions.some(permission => 
      session.user.permissions?.includes(permission)
    )
    
    if (!hasRequiredPermission) {
      throw createError({
        statusCode: 403,
        statusMessage: `Access denied. Requires one of: ${requiredPermissions.join(', ')}`
      })
    }
    
    return session
  }
}

/**
 * Require user to be in specific Line of Business - throws 403 if user is not in required LOB
 * @param lobs - Required LOB or array of LOBs
 * @returns Function that validates the LOB requirement
 */
export function requireLOB(lobs: string | string[]) {
  const requiredLOBs = Array.isArray(lobs) ? lobs : [lobs]
  
  return async (event: H3Event): Promise<UserSession> => {
    const session = await requireAuth(event)
    
    if (!session.user.linesOfBusiness || session.user.linesOfBusiness.length === 0) {
      throw createError({
        statusCode: 403,
        statusMessage: 'User has no assigned Lines of Business'
      })
    }
    
    const hasRequiredLOB = requiredLOBs.some(lob => 
      session.user.linesOfBusiness?.includes(lob)
    )
    
    if (!hasRequiredLOB) {
      throw createError({
        statusCode: 403,
        statusMessage: `Access denied. Requires access to one of: ${requiredLOBs.join(', ')}`
      })
    }
    
    return session
  }
}

/**
 * Check if user has permission to access specific account
 * @param session - User session
 * @param accountId - AWS Account ID to check access for
 * @returns Boolean indicating if user has access
 */
export function hasAccountAccess(session: UserSession, accountId: string): boolean {
  // Super admin has access to everything
  if (session.user.roles?.includes('super-admin')) {
    return true
  }
  
  // If user has account-specific permissions
  if (session.user.permissions?.includes(`account:${accountId}:read`)) {
    return true
  }
  
  // If user has global account read permission
  if (session.user.permissions?.includes('accounts:read')) {
    return true
  }
  
  // Check if user's LOB has access to this account
  // This would need to be implemented based on your business logic
  // For now, return true for authenticated users
  return true
}

/**
 * Enhanced wrapper for API handlers that require authentication
 * @param handler - API handler function
 * @returns Protected API handler
 */
export function withAuth<T>(
  handler: (event: H3Event, session: UserSession) => Promise<T>
) {
  return defineEventHandler(async (event: H3Event) => {
    try {
      const session = await requireAuth(event)
      return await handler(event, session)
    } catch (error: any) {
      // Re-throw auth/permission errors
      if (error.statusCode === 401 || error.statusCode === 403) {
        throw error
      }
      
      // Log other errors
      console.error('API handler error:', error)
      throw createError({
        statusCode: 500,
        statusMessage: 'Internal server error'
      })
    }
  })
}

/**
 * Enhanced wrapper for API handlers that require specific roles
 * @param roles - Required roles
 * @param handler - API handler function
 * @returns Protected API handler with role validation
 */
export function withRole<T>(
  roles: string | string[],
  handler: (event: H3Event, session: UserSession) => Promise<T>
) {
  return defineEventHandler(async (event: H3Event) => {
    const session = await requireRole(roles)(event)
    return await handler(event, session)
  })
}

/**
 * Enhanced wrapper for API handlers that require specific permissions
 * @param permissions - Required permissions
 * @param handler - API handler function
 * @returns Protected API handler with permission validation
 */
export function withPermission<T>(
  permissions: string | string[],
  handler: (event: H3Event, session: UserSession) => Promise<T>
) {
  return defineEventHandler(async (event: H3Event) => {
    const session = await requirePermission(permissions)(event)
    return await handler(event, session)
  })
}

/**
 * Log API request with user context
 * @param event - H3 Event object
 * @param action - Action being performed
 * @param details - Additional details to log
 */
export async function logApiRequest(
  event: H3Event, 
  action: string, 
  details?: Record<string, any>
) {
  const session = await getCurrentUser(event)
  const url = getURL(event)
  const method = getMethod(event)
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    method,
    url,
    action,
    userId: session?.user?.id || 'anonymous',
    userEmail: session?.user?.email || null,
    userRoles: session?.user?.roles || [],
    userAgent: getHeader(event, 'user-agent'),
    ...details
  }
  
  console.log('API Request:', JSON.stringify(logEntry, null, 2))
}

/**
 * Create session for new user login
 * @param event - H3 Event object
 * @param userInfo - User information from OIDC provider
 * @param sessionOptions - Additional session options
 */
export async function createUserSession(
  event: H3Event,
  userInfo: any,
  sessionOptions: {
    provider: string
    expiresIn?: number // Minutes
    roles?: string[]
    permissions?: string[]
  }
) {
  const now = new Date()
  const expiresAt = sessionOptions.expiresIn 
    ? new Date(now.getTime() + sessionOptions.expiresIn * 60 * 1000)
    : new Date(now.getTime() + 24 * 60 * 60 * 1000) // Default 24 hours
  
  const session: UserSession = {
    user: {
      id: userInfo.sub || userInfo.id,
      email: userInfo.email,
      name: userInfo.name || userInfo.preferred_username,
      roles: sessionOptions.roles || ['user'],
      permissions: sessionOptions.permissions || [],
      department: userInfo.department,
      linesOfBusiness: userInfo.linesOfBusiness || []
    },
    metadata: {
      loginTime: now.toISOString(),
      provider: sessionOptions.provider,
      expiresAt: expiresAt.toISOString(),
      lastActivity: now.toISOString()
    }
  }
  
  await setUserSession(event, session)
  return session
}