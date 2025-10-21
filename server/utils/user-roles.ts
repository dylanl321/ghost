/**
 * Server-side user role checking utilities
 * Provides functions to check user admin status and roles on the backend
 */

import type { H3Event } from 'h3'
import { createError } from 'h3'

/**
 * Check if a user is an admin
 * Just check if groups exist in session, otherwise allow in dev mode
 */
export async function isUserAdmin(event: H3Event): Promise<boolean> {
  const auth = event.context.auth
  if (!auth || !auth.isAuthenticated) {
    return false
  }

  // In development, allow admin access
  if (process.env.NODE_ENV === 'development') {
    return true
  }

  const user = auth.user
  if (!user) {
    return false
  }

  // Check if groups are in the session
  const groups = user.groups || user.claims?.groups || []
  return groups.includes('AWS-Product-Team')
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
