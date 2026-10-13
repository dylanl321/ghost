/**
 * Scope Mapper
 * Maps user roles to available API scopes
 */

import { API_KEY_SCOPES } from './api-keys'

/**
 * Map of role IDs to their allowed scopes
 */
export const ROLE_SCOPE_MAP: Record<string, string[]> = {
  admin: ['accounts:read', 'costs:read', 'forecast:read', 'security:read'],
  power_user: ['accounts:read', 'costs:read', 'forecast:read', 'security:read'],
  finance: ['accounts:read', 'costs:read', 'forecast:read'],
  viewer: ['accounts:read', 'costs:read', 'forecast:read', 'security:read']
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
    'forecast.import': ['forecast:read'],
    'forecast.edit': ['forecast:read'],
    'forecast.delete': ['forecast:read'],
    'forecast.clear': ['forecast:read'],

    // Cost permissions
    'costs.view': ['costs:read'],
    'costs.settings': ['costs:read'],
    'costs.export': ['costs:read'],

    // Account permissions
    'accounts.view': ['accounts:read'],
    'accounts.edit': ['accounts:read'],
    'accounts.create': ['accounts:read'],
    'accounts.delete': ['accounts:read'],

    // User permissions
    'users.view': ['accounts:read'],
    'users.manage': ['accounts:read'],

    // Admin permissions
    'admin.logs': ['security:read'],
    'admin.issues': ['security:read']
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
    scopes.add('security:read')
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
 * Integration scopes require an exact match.
 */
export function hasRequiredScope(userScopes: string[], requiredScope: string): boolean {
  return userScopes.includes(requiredScope)
}

/**
 * Get available scopes for a user to create API keys with
 * Users can only create API keys with scopes they have access to
 */
export function getAvailableScopesForUser(userScopes: string[]): string[] {
  return userScopes.filter(scope => isValidScope(scope))
}
