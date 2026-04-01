// Composable for managing user roles and permissions
import { 
  evaluateUserRoles, 
  getRolePermissions, 
  hasPermission, 
  hasAnyPermission, 
  hasAllPermissions,
  type RoleDefinition,
  type UserContext 
} from '~/config/roles'

const logger = createLogger('UserRoles')

export const useUserRoles = () => {
  const { user } = useOidcAuth()
  const userGroupStore = useUserGroupStore()

  // Impersonation state — when active, role evaluation uses the target user's identity
  const impersonating = useState<boolean>('impersonation-active', () => false)
  const impersonatedUser = useState<{ userPrincipalName: string; displayName: string; jobTitle?: string; department?: string } | null>('impersonation-user', () => null)

  // Computed property for user roles
  const userRoles = computed<RoleDefinition[]>(() => {
    if (!user.value) return []

    // Use ALL Entra ID groups from the store (not just AWS-specific ones)
    // This ensures we can check membership in groups like "AWS-Product-Team"
    const groups = userGroupStore.allEntraGroups || []

    // When impersonating, evaluate roles using the target user's identity
    const target = impersonating.value ? impersonatedUser.value : null

    // Build user context
    const context: UserContext = {
      userPrincipalName: target
        ? target.userPrincipalName
        : (user.value.claims?.email || user.value.claims?.preferred_username || '') as string,
      displayName: target
        ? target.displayName
        : (user.value.claims?.name || user.value.claims?.given_name || '') as string,
      jobTitle: target ? target.jobTitle : user.value.claims?.jobTitle as string | undefined,
      department: target ? target.department : user.value.claims?.department as string | undefined,
      groups,
      claims: user.value.claims
    }

    // Evaluate and return roles
    return evaluateUserRoles(context)
  })
  
  // Computed property for user permissions
  const userPermissions = computed<Set<string>>(() => {
    return getRolePermissions(userRoles.value)
  })
  
  // Computed property for highest priority role
  const primaryRole = computed<RoleDefinition | null>(() => {
    return userRoles.value.length > 0 ? userRoles.value[0] : null
  })
  
  // Check if user has admin role
  const isAdmin = computed<boolean>(() => {
    return userRoles.value.some(role => role.id === 'admin')
  })
  
  // Check if user has a specific permission
  const can = (permission: string): boolean => {
    return hasPermission(userRoles.value, permission)
  }
  
  // Check if user has any of the specified permissions
  const canAny = (permissions: string[]): boolean => {
    return hasAnyPermission(userRoles.value, permissions)
  }
  
  // Check if user has all of the specified permissions
  const canAll = (permissions: string[]): boolean => {
    return hasAllPermissions(userRoles.value, permissions)
  }
  
  // Check if user has a specific role
  const hasRole = (roleId: string): boolean => {
    return userRoles.value.some(role => role.id === roleId)
  }
  
  // Get role by ID
  const getRole = (roleId: string): RoleDefinition | undefined => {
    return userRoles.value.find(role => role.id === roleId)
  }
  
  // Debug helper to log current user roles and permissions
  const debug = () => {
    console.group('User Roles & Permissions')
    logger.info('User:', user.value?.claims?.email || 'Unknown')
    logger.info('Roles:', userRoles.value.map(r => r.name).join(', '))
    logger.info('Permissions:', Array.from(userPermissions.value).sort())
    logger.info('All Entra Groups:', userGroupStore.allEntraGroups)
    logger.info('AWS Role Groups:', userGroupStore.roleGroups)
    console.groupEnd()
  }
  
  return {
    // Reactive properties
    userRoles: readonly(userRoles),
    userPermissions: readonly(userPermissions),
    primaryRole: readonly(primaryRole),
    isAdmin: readonly(isAdmin),
    
    // Methods
    can,
    canAny,
    canAll,
    hasRole,
    getRole,
    debug
  }
}