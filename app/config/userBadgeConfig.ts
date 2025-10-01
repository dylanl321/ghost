export interface UserBadge {
  id: string
  title: string
  color: 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'gray' | 'pink' | 'indigo' | 'cyan'
  icon?: string
  description?: string
  priority: number // Lower number = higher priority for display order
}

export interface BadgeRule {
  id: string
  badge: UserBadge
  condition: (context: BadgeContext) => boolean | Promise<boolean>
  enabled: boolean
}

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
}

// Badge definitions
const BADGES: Record<string, UserBadge> = {
  ADMIN: {
    id: 'admin',
    title: 'Admin',
    color: 'red',
    icon: 'i-heroicons-shield-exclamation',
    description: 'Has administrative privileges',
    priority: 1
  },
  SECURITY: {
    id: 'security',
    title: 'Security',
    color: 'yellow',
    icon: 'i-heroicons-lock-closed',
    description: 'Member of security team',
    priority: 2
  },
  DEVELOPER: {
    id: 'developer', 
    title: 'Developer',
    color: 'blue',
    icon: 'i-heroicons-code-bracket',
    description: 'Developer access',
    priority: 3
  },
  POWER_USER: {
    id: 'power_user',
    title: 'Power User',
    color: 'purple',
    icon: 'i-heroicons-bolt',
    description: 'Has elevated AWS privileges',
    priority: 4
  },
  AWS_ACCESS: {
    id: 'aws',
    title: 'AWS',
    color: 'orange',
    icon: 'i-heroicons-cloud',
    description: 'Has AWS account access',
    priority: 5
  },
  GOVCLOUD: {
    id: 'govcloud',
    title: 'GovCloud',
    color: 'indigo',
    icon: 'i-heroicons-building-library',
    description: 'Has GovCloud access',
    priority: 6
  },
  MULTI_ACCOUNT: {
    id: 'multi_account',
    title: 'Multi-Account',
    color: 'cyan',
    icon: 'i-heroicons-squares-2x2',
    description: 'Access to multiple AWS accounts',
    priority: 7
  },
  CONTRACTOR: {
    id: 'contractor',
    title: 'Contractor',
    color: 'gray',
    icon: 'i-heroicons-user-circle',
    description: 'External contractor',
    priority: 8
  },
  CLOUD_ARCHITECT: {
    id: 'cloud_architect',
    title: 'Cloud Architect',
    color: 'green',
    icon: 'i-heroicons-cube',
    description: 'Cloud architecture role',
    priority: 9
  },
  DATA_ENGINEER: {
    id: 'data_engineer',
    title: 'Data Engineer',
    color: 'pink',
    icon: 'i-heroicons-circle-stack',
    description: 'Data engineering role',
    priority: 10
  },
  DEVOPS: {
    id: 'devops',
    title: 'DevOps',
    color: 'purple',
    icon: 'i-heroicons-cog',
    description: 'DevOps engineering role',
    priority: 11
  },
  VIP: {
    id: 'vip',
    title: 'VIP',
    color: 'yellow',
    icon: 'i-heroicons-star',
    description: 'VIP user with special privileges',
    priority: 0
  }
}

// Badge rules configuration
export const BADGE_RULES: BadgeRule[] = [
  // VIP Rule - Check for C-level executives or VPs
  {
    id: 'vip_rule',
    badge: BADGES.VIP,
    enabled: true,
    condition: (context) => {
      const title = context.jobTitle?.toLowerCase() || ''
      return title.includes('chief') || 
             title.includes('vp ') || 
             title.includes('vice president') ||
             title.includes('director') ||
             title.includes('cto') ||
             title.includes('ceo') ||
             title.includes('cfo') ||
             title.includes('cio')
    }
  },
  
  // Admin Rule - Check for admin groups
  {
    id: 'admin_rule',
    badge: BADGES.ADMIN,
    enabled: true,
    condition: (context) => {
      const groupNames = context.groups.map(g => g.toLowerCase())
      return groupNames.some(g => 
        g.includes('admin') || 
        g.includes('administrator') ||
        g.includes('global-admin')
      )
    }
  },
  
  // Security Rule - Check for security groups
  {
    id: 'security_rule',
    badge: BADGES.SECURITY,
    enabled: true,
    condition: (context) => {
      const groupNames = context.groups.map(g => g.toLowerCase())
      return groupNames.some(g => 
        g.includes('security') || 
        g.includes('infosec') ||
        g.includes('cybersecurity') ||
        g.includes('compliance')
      )
    }
  },
  
  // Developer Rule - Check for developer groups or job title
  {
    id: 'developer_rule',
    badge: BADGES.DEVELOPER,
    enabled: true,
    condition: (context) => {
      const groupNames = context.groups.map(g => g.toLowerCase())
      const jobTitle = context.jobTitle?.toLowerCase() || ''
      return groupNames.some(g => 
        g.includes('developer') || 
        g.includes('engineering') ||
        g.includes('software')
      ) || jobTitle.includes('developer') || jobTitle.includes('engineer')
    }
  },
  
  // Power User Rule - Check for power user AWS roles
  {
    id: 'power_user_rule',
    badge: BADGES.POWER_USER,
    enabled: true,
    condition: (context) => {
      if (!context.awsAccounts) return false
      const allRoles = context.awsAccounts.flatMap(acc => acc.roles.map(r => r.toLowerCase()))
      return allRoles.some(role => 
        role.includes('poweruser') || 
        role.includes('power-user') ||
        role.includes('power_user')
      )
    }
  },
  
  // AWS Access Rule - Check for any AWS access
  {
    id: 'aws_access_rule',
    badge: BADGES.AWS_ACCESS,
    enabled: true,
    condition: (context) => {
      const groupNames = context.groups.map(g => g.toLowerCase())
      return groupNames.some(g => g.startsWith('aws'))
    }
  },
  
  // GovCloud Rule - Check for GovCloud access
  {
    id: 'govcloud_rule',
    badge: BADGES.GOVCLOUD,
    enabled: true,
    condition: (context) => {
      const groupNames = context.groups.map(g => g.toLowerCase())
      const hasGovCloudGroup = groupNames.some(g => g.includes('govcloud'))
      const hasGovCloudAccount = context.awsAccounts?.some(acc => acc.isGovCloud) || false
      return hasGovCloudGroup || hasGovCloudAccount
    }
  },
  
  // Multi-Account Rule - Check for access to multiple AWS accounts
  {
    id: 'multi_account_rule',
    badge: BADGES.MULTI_ACCOUNT,
    enabled: true,
    condition: (context) => {
      if (!context.awsAccounts) return false
      return context.awsAccounts.length >= 5
    }
  },
  
  // Contractor Rule - Check for contractor groups or email domain
  {
    id: 'contractor_rule',
    badge: BADGES.CONTRACTOR,
    enabled: true,
    condition: (context) => {
      const groupNames = context.groups.map(g => g.toLowerCase())
      const isContractorGroup = groupNames.some(g => 
        g.includes('contractor') || 
        g.includes('external') ||
        g.includes('vendor')
      )
      // Check for non-standard email domains (not @gd-ms.com)
      const isExternalEmail = context.userPrincipalName && 
                             !context.userPrincipalName.toLowerCase().endsWith('@gd-ms.com')
      return isContractorGroup || isExternalEmail
    }
  },
  
  // Cloud Architect Rule
  {
    id: 'cloud_architect_rule',
    badge: BADGES.CLOUD_ARCHITECT,
    enabled: true,
    condition: (context) => {
      const jobTitle = context.jobTitle?.toLowerCase() || ''
      const groupNames = context.groups.map(g => g.toLowerCase())
      return jobTitle.includes('architect') || 
             jobTitle.includes('cloud') ||
             groupNames.some(g => g.includes('architect'))
    }
  },
  
  // Data Engineer Rule
  {
    id: 'data_engineer_rule',
    badge: BADGES.DATA_ENGINEER,
    enabled: true,
    condition: (context) => {
      const jobTitle = context.jobTitle?.toLowerCase() || ''
      const groupNames = context.groups.map(g => g.toLowerCase())
      return jobTitle.includes('data') || 
             groupNames.some(g => g.includes('data') || g.includes('analytics'))
    }
  },
  
  // DevOps Rule
  {
    id: 'devops_rule',
    badge: BADGES.DEVOPS,
    enabled: true,
    condition: (context) => {
      const jobTitle = context.jobTitle?.toLowerCase() || ''
      const groupNames = context.groups.map(g => g.toLowerCase())
      return jobTitle.includes('devops') || 
             jobTitle.includes('sre') ||
             groupNames.some(g => g.includes('devops') || g.includes('sre'))
    }
  }
]

// Function to evaluate badges for a user
export async function evaluateUserBadges(context: BadgeContext): Promise<UserBadge[]> {
  const badges: UserBadge[] = []
  const addedBadgeIds = new Set<string>()
  
  // Evaluate each rule
  for (const rule of BADGE_RULES) {
    if (!rule.enabled) continue
    
    try {
      const shouldApply = await rule.condition(context)
      if (shouldApply && !addedBadgeIds.has(rule.badge.id)) {
        badges.push(rule.badge)
        addedBadgeIds.add(rule.badge.id)
      }
    } catch (error) {
      console.warn(`Error evaluating badge rule ${rule.id}:`, error)
    }
  }
  
  // Sort badges by priority
  badges.sort((a, b) => a.priority - b.priority)
  
  return badges
}

// Function to get enabled badge rules
export function getEnabledBadgeRules(): BadgeRule[] {
  return BADGE_RULES.filter(rule => rule.enabled)
}

// Function to toggle a badge rule
export function toggleBadgeRule(ruleId: string, enabled: boolean): void {
  const rule = BADGE_RULES.find(r => r.id === ruleId)
  if (rule) {
    rule.enabled = enabled
  }
}

// Function to add a custom badge rule
export function addCustomBadgeRule(rule: BadgeRule): void {
  BADGE_RULES.push(rule)
}

// Export badge definitions for reference
export { BADGES }