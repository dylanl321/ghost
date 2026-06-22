// Role-based access control configuration
// This file defines user roles and permissions for the application

export interface RoleDefinition {
  id: string
  name: string
  description: string
  priority: number
  permissions: string[]
  rules: {
    groups_include?: string[]        // Group name contains these strings (case-insensitive)
    groups_start_with?: string[]     // Group name starts with these strings
    groups_exact?: string[]          // Group name exactly matches
    username_ends_with?: string[]    // Username ends with these strings (before @domain)
    username_starts_with?: string[]  // Username starts with these strings
    username_contains?: string[]     // Username contains these strings
    job_title_includes?: string[]    // Job title contains these strings
    department_includes?: string[]   // Department contains these strings
    default?: boolean                // Default role for all authenticated users
  }
}

export interface UserContext {
  userPrincipalName: string
  displayName?: string
  jobTitle?: string
  department?: string
  groups: string[]
  claims?: Record<string, any>
}

// Role configuration
export const ROLES: RoleDefinition[] = [
  {
    id: 'admin',
    name: 'Administrator',
    description: 'Full administrative access to all features',
    priority: 0,
    permissions: [
      'forecast.import',
      'forecast.edit',
      'forecast.delete',
      'forecast.clear',
      'costs.settings',
      'costs.export',
      'costs.budget_vs_actual',
      'admin.logs',
      'admin.issues',
      'accounts.edit',
      'accounts.create',
      'accounts.delete',
      'users.manage'
    ],
    rules: {
      groups_exact: ['AWS-Product-Team'],
      username_ends_with: ['.admin']
    }
  },
  {
    id: 'power_user',
    name: 'Power User',
    description: 'Enhanced access to cost and account management features',
    priority: 1,
    permissions: [
      'forecast.import',
      'forecast.edit',
      'costs.settings',
      'costs.export',
      'accounts.edit'
    ],
    rules: {
      groups_include: ['AWS-Power-Users'],
      groups_start_with: ['AWS-Managers-'],
      username_ends_with: ['.pu']
    }
  },
  {
    id: 'finance',
    name: 'Finance User',
    description: 'Access to cost analysis and forecasting features',
    priority: 2,
    permissions: [
      'forecast.import',
      'forecast.edit',
      'costs.export',
      'costs.budget_vs_actual'
    ],
    rules: {
      groups_exact: ['AWS-Finance-Team'],
      department_includes: ['Finance', 'Accounting']
    }
  },
  {
    id: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to dashboards and reports',
    priority: 99,
    permissions: [
      'costs.view',
      'accounts.view',
      'users.view'
    ],
    rules: {
      default: true
    }
  }
]

// Permission categories for UI grouping
export const PERMISSION_CATEGORIES = {
  forecast: {
    label: 'Forecast Management',
    permissions: {
      'forecast.import': 'Import forecast data files',
      'forecast.edit': 'Edit forecast entries',
      'forecast.delete': 'Delete forecast entries',
      'forecast.clear': 'Clear all forecast data'
    }
  },
  costs: {
    label: 'Cost Management',
    permissions: {
      'costs.view': 'View cost data and reports',
      'costs.settings': 'Modify cost display settings',
      'costs.export': 'Export cost data',
      'costs.budget_vs_actual': 'View Budget vs Actual by Department report'
    }
  },
  accounts: {
    label: 'Account Management',
    permissions: {
      'accounts.view': 'View account information',
      'accounts.edit': 'Edit account metadata',
      'accounts.create': 'Create new account entries',
      'accounts.delete': 'Delete account entries'
    }
  },
  users: {
    label: 'User Management',
    permissions: {
      'users.view': 'View user information',
      'users.manage': 'Manage user roles and permissions'
    }
  },
  admin: {
    label: 'Administration',
    permissions: {
      'admin.logs': 'Access system logs',
      'admin.issues': 'Access issue management'
    }
  }
}

// Evaluate user roles based on context
export function evaluateUserRoles(context: UserContext): RoleDefinition[] {
  const roles: RoleDefinition[] = []
  const username = context.userPrincipalName.split('@')[0].toLowerCase()
  
  for (const role of ROLES) {
    const rules = role.rules
    let shouldApply = false
    
    // Default role applies to everyone
    if (rules.default) {
      shouldApply = true
    }
    
    // Check group rules
    if (rules.groups_include?.length) {
      const groupsLower = context.groups.map(g => g.toLowerCase())
      shouldApply = shouldApply || rules.groups_include.some(term => 
        groupsLower.some(group => group.includes(term.toLowerCase()))
      )
    }
    
    if (rules.groups_start_with?.length) {
      const groupsLower = context.groups.map(g => g.toLowerCase())
      shouldApply = shouldApply || rules.groups_start_with.some(prefix => 
        groupsLower.some(group => group.startsWith(prefix.toLowerCase()))
      )
    }
    
    if (rules.groups_exact?.length) {
      const groupsLower = context.groups.map(g => g.toLowerCase())
      shouldApply = shouldApply || rules.groups_exact.some(exact => 
        groupsLower.includes(exact.toLowerCase())
      )
    }
    
    // Check username rules  
    if (rules.username_ends_with?.length) {
      shouldApply = shouldApply || rules.username_ends_with.some(suffix => 
        username.endsWith(suffix.toLowerCase())
      )
    }
    
    if (rules.username_starts_with?.length) {
      shouldApply = shouldApply || rules.username_starts_with.some(prefix => 
        username.startsWith(prefix.toLowerCase())
      )
    }
    
    if (rules.username_contains?.length) {
      shouldApply = shouldApply || rules.username_contains.some(term => 
        username.includes(term.toLowerCase())
      )
    }
    
    // Check job title rules
    if (rules.job_title_includes?.length && context.jobTitle) {
      const jobTitleLower = context.jobTitle.toLowerCase()
      shouldApply = shouldApply || rules.job_title_includes.some(term => 
        jobTitleLower.includes(term.toLowerCase())
      )
    }
    
    // Check department rules
    if (rules.department_includes?.length && context.department) {
      const departmentLower = context.department.toLowerCase()
      shouldApply = shouldApply || rules.department_includes.some(term => 
        departmentLower.includes(term.toLowerCase())
      )
    }
    
    if (shouldApply) {
      roles.push(role)
    }
  }
  
  // Sort by priority (lower number = higher priority)
  return roles.sort((a, b) => a.priority - b.priority)
}

// Get all permissions for a set of roles
export function getRolePermissions(roles: RoleDefinition[]): Set<string> {
  const permissions = new Set<string>()
  
  for (const role of roles) {
    for (const permission of role.permissions) {
      permissions.add(permission)
    }
  }
  
  return permissions
}

// Check if user has a specific permission
export function hasPermission(roles: RoleDefinition[], permission: string): boolean {
  const permissions = getRolePermissions(roles)
  return permissions.has(permission)
}

// Check if user has any of the specified permissions
export function hasAnyPermission(roles: RoleDefinition[], permissions: string[]): boolean {
  const userPermissions = getRolePermissions(roles)
  return permissions.some(p => userPermissions.has(p))
}

// Check if user has all of the specified permissions
export function hasAllPermissions(roles: RoleDefinition[], permissions: string[]): boolean {
  const userPermissions = getRolePermissions(roles)
  return permissions.every(p => userPermissions.has(p))
}