/**
 * Server-side user role checking utilities
 * Provides functions to check user admin status and roles on the backend
 */

import type { H3Event } from 'h3'
import { createError } from 'h3'
import { getUserGroups } from './entra/graph-client'
import { logger } from './logger'
import {
  ROLES,
  evaluateUserRoles,
  getRolePermissions,
  type UserContext
} from '../../app/config/roles'

// In-memory cache for admin status checks (TTL: 10 minutes)
const adminCache = new Map<string, { isAdmin: boolean, expiresAt: number }>()
const ADMIN_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// ADMIN_BYPASS is a deliberate, human-owned security decision for non-production
// deployments and its behavior must not change. The warning is identical on every
// admin/permission check, so emit it only once per process to avoid log noise
// while still recording the posture.
let adminBypassWarned = false
function warnAdminBypassOnce(): void {
  if (adminBypassWarned) return
  adminBypassWarned = true
  logger.warn('⚠️  ADMIN_BYPASS enabled - all authenticated users receive admin/all permissions')
}

// Periodic cleanup of expired cache entries (every 5 minutes)
setInterval(() => {
  const now = Date.now()
  for (const [userId, entry] of adminCache.entries()) {
    if (entry.expiresAt <= now) {
      adminCache.delete(userId)
    }
  }
}, 5 * 60 * 1000)

/**
 * Check if a user is an admin
 * Fetches user groups from Microsoft Graph API to check for admin group membership
 * Results are cached for 10 minutes to avoid excessive Graph API calls
 */
export async function isUserAdmin(event: H3Event): Promise<boolean> {
  const auth = event.context.auth
  if (!auth || !auth.isAuthenticated) {
    return false
  }

  // Allow admin bypass via environment variable for non-production deployments
  if (process.env.ADMIN_BYPASS === 'true') {
    warnAdminBypassOnce()
    return true
  }

  const user = auth.user
  if (!user) {
    return false
  }

  // Check if groups are already in the session (for API key auth or cached sessions)
  const sessionGroups = user.groups || user.claims?.groups || []
  if (sessionGroups.length > 0) {
    return sessionGroups.includes('AWS-Product-Team')
  }

  // For OIDC auth, fetch groups from Microsoft Graph API
  if (auth.authType === 'oidc') {
    // Try to get user ID from various possible locations in the session
    const userId = user.id || user.oid || user.sub ||
                   user.claims?.id || user.claims?.oid || user.claims?.sub ||
                   user.email || user.claims?.email
    if (!userId) {
      logger.error('Cannot fetch groups: user ID not found in session. User object:', JSON.stringify(user, null, 2))
      return false
    }

    // Check cache first
    const cached = adminCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.isAdmin
    }

    // Fetch from Graph API
    try {
      // Fetch user's groups from Microsoft Graph
      const userGroups = await getUserGroups(event, userId)

      // Check if user is in AWS-Product-Team group
      const isAdmin = userGroups.some(group => group.displayName === 'AWS-Product-Team')

      // Cache the result
      adminCache.set(userId, {
        isAdmin,
        expiresAt: Date.now() + ADMIN_CACHE_TTL
      })

      return isAdmin
    } catch (error) {
      logger.error('Failed to fetch user groups for admin check:', error)
      // Fail closed - don't grant admin access if we can't verify
      return false
    }
  }

  // No groups found and not OIDC auth
  return false
}

/**
 * Clear admin cache for a specific user (useful for logout or permission changes)
 */
export function clearAdminCache(userId: string): void {
  adminCache.delete(userId)
}

/**
 * Clear all admin cache entries (useful for server restart or bulk permission updates)
 */
export function clearAllAdminCache(): void {
  adminCache.clear()
}

/**
 * Require user to be an admin (throws 403 if not)
 */
export async function requireAdmin(event: H3Event): Promise<void> {
  const isAdmin = await isUserAdmin(event)

  if (!isAdmin) {
    throw createError({
      statusCode: 403,
      message: 'Admin access required'
    })
  }
}

/**
 * Resolve the set of permissions for the current user by re-evaluating the
 * shared role definitions (app/config/roles.ts) server-side.
 *
 * This mirrors the client-side useUserRoles() composable, but runs on the
 * backend so API endpoints can enforce permissions independently of the
 * client middleware (which only runs in the browser and can be bypassed).
 *
 * Group source is identical to isUserAdmin(): session groups when present
 * (API-key / dev sessions), otherwise Microsoft Graph memberOf for OIDC users.
 */
export async function getUserPermissions(event: H3Event): Promise<Set<string>> {
  const auth = event.context.auth
  if (!auth || !auth.isAuthenticated || !auth.user) {
    return new Set<string>()
  }

  // Non-production bypass: same env flag isUserAdmin honours.
  if (process.env.ADMIN_BYPASS === 'true') {
    warnAdminBypassOnce()
    const everything = ROLES.flatMap(r => r.permissions)
    return new Set<string>(everything)
  }

  const user = auth.user

  // Gather the user's group display names.
  let groupNames: string[] = []
  const sessionGroups: string[] = user.groups || user.claims?.groups || []
  if (sessionGroups.length > 0) {
    groupNames = sessionGroups
  } else if (auth.authType === 'oidc') {
    const userId = user.id || user.oid || user.sub ||
                   user.claims?.id || user.claims?.oid || user.claims?.sub ||
                   user.email || user.claims?.email
    if (userId) {
      try {
        const groups = await getUserGroups(event, userId)
        groupNames = groups.map(g => g.displayName).filter(Boolean)
      } catch (error) {
        logger.error('Failed to fetch user groups for permission check:', error)
        // Fail closed - no groups means only default (viewer) permissions.
      }
    }
  }

  const context: UserContext = {
    userPrincipalName: user.email || user.claims?.email || user.claims?.preferred_username || '',
    displayName: user.displayName || user.claims?.name,
    jobTitle: user.claims?.jobTitle,
    department: user.department || user.claims?.department,
    groups: groupNames,
    claims: user.claims
  }

  const roles = evaluateUserRoles(context)
  return getRolePermissions(roles)
}

/**
 * Require the current user to hold a specific permission (throws 403 if not).
 * Use in API handlers to enforce access server-side, independent of the
 * client-side route middleware.
 */
export async function requirePermission(event: H3Event, permission: string): Promise<void> {
  const permissions = await getUserPermissions(event)

  if (!permissions.has(permission)) {
    throw createError({
      statusCode: 403,
      message: `Missing required permission: ${permission}`
    })
  }
}

/**
 * Get user email from session
 */
export function getUserEmail(event: H3Event): string | null {
  const auth = event.context.auth
  if (!auth || !auth.isAuthenticated || !auth.user) {
    return null
  }

  const user = auth.user
  return user.email || user.claims?.email || user.claims?.preferred_username || null
}
