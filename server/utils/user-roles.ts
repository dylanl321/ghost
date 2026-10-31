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

function hasConfiguredAdminRole(user: any, groups: string[]): boolean {
  const claims = user.claims || {}
  return evaluateUserRoles({
    userPrincipalName: user.email || claims.email || claims.preferred_username || '',
    displayName: user.displayName || claims.name,
    jobTitle: claims.jobTitle,
    department: user.department || claims.department,
    groups,
    claims
  }).some(role => role.id === 'admin')
}

function getSessionGroupNames(user: any): string[] {
  const groups = user.groups || user.claims?.groups || []
  if (!Array.isArray(groups)) {
    return []
  }

  return groups
    .map((group: any) => {
      if (typeof group === 'string') {
        return group
      }
      return group?.displayName || group?.name || ''
    })
    .filter(Boolean)
}

// Graph is addressed by the Entra object id; email is the last resort.
function getGraphUserId(user: any): string | undefined {
  return user.id || user.oid || user.sub ||
    user.claims?.id || user.claims?.oid || user.claims?.sub ||
    user.email || user.claims?.email || undefined
}

async function loadGraphGroupNames(
  event: H3Event,
  userId: string,
  loadUserGroups: typeof getUserGroups
): Promise<string[]> {
  const groups = await loadUserGroups(event, userId)
  return groups.map(group => group.displayName).filter(Boolean)
}

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
const adminCacheCleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [userId, entry] of adminCache.entries()) {
    if (entry.expiresAt <= now) {
      adminCache.delete(userId)
    }
  }
}, 5 * 60 * 1000)
adminCacheCleanupTimer.unref()

/**
 * Check if a user is an admin
 * Fetches user groups from Microsoft Graph API to check for admin group membership
 * Results are cached for 10 minutes to avoid excessive Graph API calls
 */
export async function isUserAdmin(
  event: H3Event,
  loadUserGroups: typeof getUserGroups = getUserGroups
): Promise<boolean> {
  const auth = event.context.auth
  if (!auth || !auth.isAuthenticated) {
    return false
  }

  // The local bypass is never honored in a production deployment.
  if (process.env.ADMIN_BYPASS === 'true' && !['prod', 'production'].includes((process.env.NODE_ENV || '').toLowerCase())) {
    warnAdminBypassOnce()
    return true
  }

  const user = auth.user
  if (!user) {
    return false
  }

  // Use the same named-group role rules as the browser. Entra commonly stores
  // group object IDs in the session, so a failed direct match must fall
  // through to Graph instead of becoming an immediate denial.
  const sessionGroups = getSessionGroupNames(user)
  if (hasConfiguredAdminRole(user, sessionGroups)) {
    return true
  }

  // For OIDC auth, fetch groups from Microsoft Graph API
  if (auth.authType === 'oidc') {
    const userId = getGraphUserId(user)
    if (!userId) {
      logger.error('Cannot fetch groups: user ID not found in session')
      return false
    }

    // Check cache first
    const cached = adminCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.isAdmin
    }

    try {
      const graphGroups = await loadGraphGroupNames(event, userId, loadUserGroups)
      const isAdmin = hasConfiguredAdminRole(user, [...sessionGroups, ...graphGroups])

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
 * Group source is identical to isUserAdmin(): named session groups, plus
 * Microsoft Graph memberOf for OIDC users.
 */
export async function getUserPermissions(
  event: H3Event,
  loadUserGroups: typeof getUserGroups = getUserGroups
): Promise<Set<string>> {
  const auth = event.context.auth
  if (!auth || !auth.isAuthenticated || !auth.user) {
    return new Set<string>()
  }

  // Non-production bypass: same env flag isUserAdmin honours.
  if (process.env.ADMIN_BYPASS === 'true' && !['prod', 'production'].includes((process.env.NODE_ENV || '').toLowerCase())) {
    warnAdminBypassOnce()
    const everything = ROLES.flatMap(r => r.permissions)
    return new Set<string>(everything)
  }

  const user = auth.user

  // Same group sources as isUserAdmin(): named session groups, plus Graph
  // memberOf for OIDC users. Entra sessions usually carry group object IDs,
  // so session groups alone must never stand in for the Graph lookup.
  let groupNames = getSessionGroupNames(user)
  if (auth.authType === 'oidc') {
    const userId = getGraphUserId(user)
    if (userId) {
      try {
        groupNames = [...new Set([...groupNames, ...await loadGraphGroupNames(event, userId, loadUserGroups)])]
      } catch (error) {
        logger.error('Failed to fetch user groups for permission check:', error)
        // Fail closed - session groups only, which usually means viewer permissions.
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
  return user.email || user.preferred_username || user.claims?.email || user.claims?.preferred_username || null
}
