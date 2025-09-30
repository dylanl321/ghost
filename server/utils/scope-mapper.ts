/**
 * Scope Mapper
 * Maps user roles to available API scopes
 */

import { API_KEY_SCOPES } from './api-keys'

/**
 * Map of role IDs to their allowed scopes
 */
export const ROLE_SCOPE_MAP: Record<string, string[]> = {
  // Admin role - full access to everything
  admin: [
    'admin:all',
    'entra:read',
    'entra:write',
    'entra:admin',
    'accounts:read',
    'accounts:write',
    'costs:read',
    'costs:write',
    'forecast:read',
    'forecast:write',
    'security-lake:read',
    'security-lake:write',
    'groups:read',
    'users:read',
    'cache:manage'
  ],

  // Power User role - read + write access to most resources
  power_user: [
    'accounts:read',
    'accounts:write',
    'costs:read',
    'costs:write',
    'forecast:read',
    'groups:read',
    'users:read'
  ],

  // Finance role - read + write access to costs and forecasts
  finance: [
    'accounts:read',
    'costs:read',
    'costs:write',
    'forecast:read',
    'forecast:write',
    'groups:read',
    'users:read'
  ],

  // Viewer role - read-only access
  viewer: [
    'accounts:read',
    'costs:read',
    'forecast:read',
    'groups:read',
    'users:read'
  ]
}

/**
 * Get scopes for a list of role IDs
 */
export function getScopesForRoles(roleIds: string[]): string[] {
  const scopes = new Set<string>()

  for (const roleId of roleIds) {
    const roleScopes = ROLE_SCOPE_MAP[roleId] || []
    roleScopes.forEach(scope => scopes.add(scope))
  }

  return Array.from(scopes).sort()
}

/**
 * Get scopes for a user based on their permission strings
 * Converts GHOST permissions (e.g., "forecast.import") to API scopes
 */
export function getScopesFromPermissions(permissions: string[]): string[] {
  const scopes = new Set<string>()

  // Map permissions to scopes
  const permissionScopeMap: Record<string, string[]> = {
    // Forecast permissions
    'forecast.import': ['forecast:write'],
    'forecast.edit': ['forecast:write'],
    'forecast.delete': ['forecast:write'],
    'forecast.clear': ['forecast:write'],

    // Cost permissions
    'costs.view': ['costs:read'],
    'costs.settings': ['costs:read', 'costs:write'],
    'costs.export': ['costs:read'],

    // Account permissions
    'accounts.view': ['accounts:read'],
    'accounts.edit': ['accounts:write'],
    'accounts.create': ['accounts:write'],
    'accounts.delete': ['accounts:write'],

    // User permissions
    'users.view': ['users:read'],
    'users.manage': ['users:read', 'admin:all'],

    // Admin permissions
    'admin.logs': ['admin:all'],
    'admin.issues': ['admin:all']
  }

  // Convert permissions to scopes
  for (const permission of permissions) {
    const mappedScopes = permissionScopeMap[permission] || []
    mappedScopes.forEach(scope => scopes.add(scope))
  }

  // Add basic read scopes if user has any permissions
  if (permissions.length > 0) {
    scopes.add('accounts:read')
    scopes.add('costs:read')
    scopes.add('forecast:read')
    scopes.add('users:read')
    scopes.add('groups:read')
  }

  return Array.from(scopes).sort()
}

/**
 * Check if a scope is valid
 */
export function isValidScope(scope: string): boolean {
  return scope in API_KEY_SCOPES
}

/**
 * Get all available scopes
 */
export function getAllScopes(): string[] {
  return Object.keys(API_KEY_SCOPES)
}

/**
 * Get scope description
 */
export function getScopeDescription(scope: string): string {
  return API_KEY_SCOPES[scope as keyof typeof API_KEY_SCOPES] || 'Unknown scope'
}

/**
 * Check if scopes array includes a required scope
 * Supports wildcard admin:all scope
 */
export function hasRequiredScope(userScopes: string[], requiredScope: string): boolean {
  // admin:all grants access to everything
  if (userScopes.includes('admin:all')) {
    return true
  }

  // Check for exact scope match
  if (userScopes.includes(requiredScope)) {
    return true
  }

  // Check for category-level admin scope (e.g., entra:admin includes entra:read and entra:write)
  const [category, level] = requiredScope.split(':')
  const adminScope = `${category}:admin`
  if (userScopes.includes(adminScope)) {
    return true
  }

  return false
}

/**
 * Get available scopes for a user to create API keys with
 * Users can only create API keys with scopes they have access to
 */
export function getAvailableScopesForUser(userScopes: string[]): string[] {
  // If user has admin:all, they can create keys with any scope
  if (userScopes.includes('admin:all')) {
    return getAllScopes()
  }

  // Otherwise, return only scopes the user has
  return userScopes.filter(scope => isValidScope(scope))
}
