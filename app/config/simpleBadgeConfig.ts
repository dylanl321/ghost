// Simple badge configuration system
// Edit the badge rules below to customize which badges users receive

export interface BadgeDefinition {
  id: string
  title: string
  color: string
  icon?: string
  description?: string
  priority: number
  rules: {
    groups_include?: string[]        // Group name contains these strings (case-insensitive)
    groups_start_with?: string[]     // Group name starts with these strings
    groups_exact?: string[]          // Group name exactly matches
    username_ends_with?: string[]    // Username ends with these strings (before @domain)
    username_starts_with?: string[]  // Username starts with these strings
    username_contains?: string[]     // Username contains these strings
    job_title_includes?: string[]    // Job title contains these strings
    department_includes?: string[]   // Department contains these strings
    min_aws_accounts?: number        // Minimum number of AWS accounts
    max_aws_accounts?: number        // Maximum number of AWS accounts
    is_primary_admin?: boolean       // User is primary admin for any enclave
    is_delegate_admin?: boolean      // User is delegate admin for any enclave
    is_cost_manager?: boolean        // User is cost manager for any enclave
    min_admin_accounts?: number      // Minimum number of accounts where user is admin
  }
}

// EDIT THIS CONFIGURATION TO ADD/MODIFY BADGE RULES
export const BADGE_CONFIG: BadgeDefinition[] = [
  {
    id: 'super_user',
    title: 'Super User',
    color: 'red',
    icon: 'i-heroicons-bolt',
    description: 'Super user account with elevated privileges',
    priority: 0,
    rules: {
      username_ends_with: ['.su']
    }
  },
  {
    id: 'contractor',
    title: 'External Contractor',
    color: 'gray',
    icon: 'i-heroicons-user-circle',
    description: 'External contractor account',
    priority: 1,
    rules: {
      username_ends_with: ['.ex']
    }
  },
  {
    id: 'microsoft_account',
    title: 'Microsoft',
    color: 'blue',
    icon: 'i-simple-icons-microsoft',
    description: 'Microsoft Azure account',
    priority: 2,
    rules: {
      username_ends_with: ['.ms']
    }
  },
  {
    id: 'lz_team',
    title: 'LZ Team',
    color: 'purple',
    icon: 'i-heroicons-rocket-launch',
    description: 'Landing Zone team member',
    priority: 3,
    rules: {
      groups_exact: ['AWS-Product-Team']
    }
  },
  {
    id: 'account_admin',
    title: 'Account Admin',
    color: 'orange',
    icon: 'i-heroicons-shield-check',
    description: 'AWS account administrator',
    priority: 4,
    rules: {
      is_primary_admin: true
    }
  },
  {
    id: 'delegate_admin',
    title: 'Delegate Admin',
    color: 'yellow',
    icon: 'i-heroicons-user-group',
    description: 'AWS account delegate administrator',
    priority: 5,
    rules: {
      is_delegate_admin: true
    }
  },
  {
    id: 'cost_manager',
    title: 'Cost Manager',
    color: 'green',
    icon: 'i-heroicons-currency-dollar',
    description: 'AWS account cost manager',
    priority: 6,
    rules: {
      is_cost_manager: true
    }
  }
]

// Context for evaluating badges
export interface BadgeContext {
  userPrincipalName: string
  displayName?: string
  jobTitle?: string
  department?: string
  groups: string[]
  awsAccounts?: Array<{
    accountId: string
    accountName: string
    roles: string[]
    isGovCloud: boolean
  }>
  // Enclave admin roles (from enclave store, not Entra)
  enclaveRoles?: {
    isPrimaryAdmin: boolean
    isDelegateAdmin: boolean
    isCostManager: boolean
    totalAdminAccounts: number
  }
}

// Simple evaluation function
export function evaluateUserBadges(context: BadgeContext): BadgeDefinition[] {
  const badges: BadgeDefinition[] = []
  const username = context.userPrincipalName.split('@')[0].toLowerCase()
  
  for (const badge of BADGE_CONFIG) {
    const rules = badge.rules
    let shouldApply = false
    
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
    
    // Check AWS account rules
    if (rules.min_aws_accounts && context.awsAccounts) {
      shouldApply = shouldApply || context.awsAccounts.length >= rules.min_aws_accounts
    }

    if (rules.max_aws_accounts && context.awsAccounts) {
      shouldApply = shouldApply || context.awsAccounts.length <= rules.max_aws_accounts
    }

    // Check enclave role rules (from enclave store)
    if (rules.is_primary_admin && context.enclaveRoles) {
      shouldApply = shouldApply || context.enclaveRoles.isPrimaryAdmin
    }

    if (rules.is_delegate_admin && context.enclaveRoles) {
      shouldApply = shouldApply || context.enclaveRoles.isDelegateAdmin
    }

    if (rules.is_cost_manager && context.enclaveRoles) {
      shouldApply = shouldApply || context.enclaveRoles.isCostManager
    }

    if (rules.min_admin_accounts && context.enclaveRoles) {
      shouldApply = shouldApply || context.enclaveRoles.totalAdminAccounts >= rules.min_admin_accounts
    }

    if (shouldApply) {
      badges.push(badge)
    }
  }

  // Sort by priority (lower number = higher priority)
  return badges.sort((a, b) => a.priority - b.priority)
}