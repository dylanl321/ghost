/**
 * User & Identity Reports Type Definitions
 *
 * Types for user access, group membership, role usage, and identity reporting
 */

// ============================================================================
// User Access Records
// ============================================================================

/**
 * User's AWS account access record
 */
export interface UserAccountAccessRecord {
  userId: string
  userEmail: string
  userName: string
  accountId: string
  accountName: string
  environment: 'commercial' | 'govcloud'
  roles: string[]  // List of roles user can assume
  groups: string[]  // Entra ID groups granting access
  firstSeen: string  // When access was first detected
  lastVerified: string  // Last time access was verified
  isActive: boolean  // Still has access
}

/**
 * Entra ID group membership record
 */
export interface GroupMembershipRecord {
  userId: string
  userEmail: string
  userName: string
  groupId: string
  groupName: string
  groupType: 'aws-role' | 'distribution' | 'security' | 'other'
  joinedDate?: string
  isActive: boolean
  accountId?: string  // For AWS role groups
  roleName?: string   // For AWS role groups
  environment?: 'commercial' | 'govcloud'
}

/**
 * IAM user record (from AWS accounts)
 */
export interface IAMUserRecord {
  accountId: string
  accountName: string
  userName: string
  userId: string
  arn: string
  createdDate: string
  passwordLastUsed?: string
  mfaEnabled: boolean
  accessKeys: Array<{
    accessKeyId: string
    status: 'Active' | 'Inactive'
    createdDate: string
    lastUsedDate?: string
    lastUsedService?: string
    lastUsedRegion?: string
  }>
  tags?: Record<string, string>
  permissionsBoundary?: string
  groups: string[]
  attachedPolicies: string[]
}

/**
 * Role assumption record (from CloudTrail)
 */
export interface RoleAssumptionRecord {
  userId: string
  userEmail: string
  accountId: string
  accountName: string
  roleName: string
  roleArn: string
  assumedAt: string
  sourceIpAddress?: string
  userAgent?: string
  sessionDuration?: number
  mfaUsed: boolean
}

// ============================================================================
// User Activity Tracking
// ============================================================================

/**
 * User login activity record
 */
export interface UserLoginRecord {
  userId: string
  userEmail: string
  userName: string
  loginTime: string
  sourceIp?: string
  userAgent?: string
  loginMethod: 'console' | 'api' | 'sso'
  mfaUsed: boolean
  success: boolean
  failureReason?: string
}

/**
 * User session summary
 */
export interface UserSessionSummary {
  userId: string
  userEmail: string
  totalLogins: number
  lastLoginAt: string
  firstLoginAt: string
  loginsByMethod: Record<string, number>
  uniqueIPs: number
  accountsAccessed: string[]
  rolesAssumed: string[]
  averageSessionDuration?: number
}

// ============================================================================
// Historical Snapshots
// ============================================================================

/**
 * Historical snapshot of user access
 * Stored periodically to track changes over time
 */
export interface UserAccessSnapshot {
  snapshotId: string
  snapshotDate: string
  userId: string
  userEmail: string
  userName: string
  accountAccess: Array<{
    accountId: string
    accountName: string
    roles: string[]
    groups: string[]
  }>
  groupMemberships: string[]  // Group names
  iamUsers: Array<{
    accountId: string
    userName: string
  }>
  metadata: {
    totalAccounts: number
    totalRoles: number
    totalGroups: number
    totalIAMUsers: number
  }
}

/**
 * Group membership change event
 */
export interface GroupMembershipChange {
  changeId: string
  changeDate: string
  userId: string
  userEmail: string
  groupId: string
  groupName: string
  changeType: 'added' | 'removed'
  changedBy?: string
  reason?: string
}

// ============================================================================
// Report Configuration Types
// ============================================================================

/**
 * User access report filters
 */
export interface UserAccessReportFilters {
  /**
   * Specific users to include (empty = all users)
   */
  userEmails?: string[]

  /**
   * Specific accounts to check (empty = all accounts)
   */
  accountIds?: string[]

  /**
   * Filter by environment
   */
  environment?: 'commercial' | 'govcloud' | 'both'

  /**
   * Include only active access
   */
  activeOnly?: boolean

  /**
   * Filter by specific role names
   */
  roles?: string[]

  /**
   * Include IAM users
   */
  includeIAMUsers?: boolean

  /**
   * Include role assumption history
   */
  includeRoleUsage?: boolean

  /**
   * Lookback period for activity (days)
   */
  lookbackDays?: number
}

/**
 * Group membership report filters
 */
export interface GroupMembershipReportFilters {
  /**
   * Specific users to include
   */
  userEmails?: string[]

  /**
   * Specific groups to include
   */
  groupNames?: string[]

  /**
   * Group types to include
   */
  groupTypes?: Array<'aws-role' | 'distribution' | 'security' | 'other'>

  /**
   * Include inactive memberships
   */
  includeInactive?: boolean

  /**
   * Include historical changes
   */
  includeHistory?: boolean

  /**
   * Date range for historical data
   */
  startDate?: string
  endDate?: string
}

/**
 * User activity report filters
 */
export interface UserActivityReportFilters {
  /**
   * Specific users to include
   */
  userEmails?: string[]

  /**
   * Activity lookback period (days)
   */
  lookbackDays?: number

  /**
   * Minimum login threshold (show users with N+ logins)
   */
  minLogins?: number

  /**
   * Show inactive users (no activity in X days)
   */
  showInactive?: boolean
  inactiveDays?: number

  /**
   * Include role assumption activity
   */
  includeRoleAssumptions?: boolean

  /**
   * Specific accounts for role activity
   */
  accountIds?: string[]
}

/**
 * IAM user audit filters
 */
export interface IAMUserAuditFilters {
  /**
   * Specific accounts to audit
   */
  accountIds?: string[]

  /**
   * Show users without MFA
   */
  noMFAOnly?: boolean

  /**
   * Show users with old access keys (days)
   */
  accessKeyAgeDays?: number

  /**
   * Show inactive users (no password use in X days)
   */
  inactiveDays?: number

  /**
   * Include access key usage details
   */
  includeAccessKeyUsage?: boolean
}

// ============================================================================
// Report Data Structures
// ============================================================================

/**
 * User access report data
 */
export interface UserAccessReportData {
  metadata: {
    generatedAt: string
    totalUsers: number
    totalAccounts: number
    filters: UserAccessReportFilters
  }

  userAccess: UserAccountAccessRecord[]

  summary: {
    usersByAccountCount: Record<number, number>  // { accountCount: userCount }
    usersByEnvironment: {
      commercial: number
      govcloud: number
      both: number
    }
    topAccounts: Array<{
      accountId: string
      accountName: string
      userCount: number
    }>
    topRoles: Array<{
      roleName: string
      userCount: number
    }>
  }

  iamUsers?: IAMUserRecord[]
  roleUsage?: RoleAssumptionRecord[]
}

/**
 * Group membership report data
 */
export interface GroupMembershipReportData {
  metadata: {
    generatedAt: string
    totalMembers: number
    totalGroups: number
    filters: GroupMembershipReportFilters
  }

  memberships: GroupMembershipRecord[]

  summary: {
    membersByGroup: Record<string, number>
    groupsByType: Record<string, number>
    topGroups: Array<{
      groupName: string
      memberCount: number
      groupType: string
    }>
  }

  changes?: GroupMembershipChange[]
}

/**
 * User activity report data
 */
export interface UserActivityReportData {
  metadata: {
    generatedAt: string
    totalUsers: number
    dateRange: {
      startDate: string
      endDate: string
    }
    filters: UserActivityReportFilters
  }

  sessionSummaries: UserSessionSummary[]

  loginRecords?: UserLoginRecord[]
  roleAssumptions?: RoleAssumptionRecord[]

  summary: {
    totalLogins: number
    activeUsers: number
    inactiveUsers: number
    averageLoginsPerUser: number
    topUsers: Array<{
      userEmail: string
      loginCount: number
      accountsAccessed: number
      rolesAssumed: number
    }>
  }
}

/**
 * IAM user audit report data
 */
export interface IAMUserAuditReportData {
  metadata: {
    generatedAt: string
    totalIAMUsers: number
    accountsAudited: number
    filters: IAMUserAuditFilters
  }

  iamUsers: IAMUserRecord[]

  findings: {
    usersWithoutMFA: IAMUserRecord[]
    usersWithOldAccessKeys: Array<IAMUserRecord & { oldestKeyAge: number }>
    inactiveUsers: Array<IAMUserRecord & { daysSinceLastUse: number }>
    usersWithMultipleAccessKeys: IAMUserRecord[]
  }

  summary: {
    totalUsers: number
    usersWithMFA: number
    usersWithoutMFA: number
    totalAccessKeys: number
    activeAccessKeys: number
    inactiveAccessKeys: number
    averageAccessKeyAge: number
  }
}

// ============================================================================
// Column Definitions for Exports
// ============================================================================

export const USER_ACCESS_COLUMNS = [
  { key: 'userEmail', label: 'User Email', width: 30 },
  { key: 'userName', label: 'User Name', width: 25 },
  { key: 'accountName', label: 'Account', width: 30 },
  { key: 'accountId', label: 'Account ID', width: 15 },
  { key: 'environment', label: 'Environment', width: 12 },
  { key: 'roles', label: 'Roles', width: 40 },
  { key: 'groups', label: 'Groups', width: 40 },
  { key: 'isActive', label: 'Active', width: 10 },
  { key: 'lastVerified', label: 'Last Verified', width: 20, type: 'date' as const }
]

export const GROUP_MEMBERSHIP_COLUMNS = [
  { key: 'userEmail', label: 'User Email', width: 30 },
  { key: 'userName', label: 'User Name', width: 25 },
  { key: 'groupName', label: 'Group Name', width: 40 },
  { key: 'groupType', label: 'Type', width: 15 },
  { key: 'accountId', label: 'Account ID', width: 15 },
  { key: 'roleName', label: 'Role', width: 25 },
  { key: 'environment', label: 'Environment', width: 12 },
  { key: 'isActive', label: 'Active', width: 10 }
]

export const IAM_USER_AUDIT_COLUMNS = [
  { key: 'accountName', label: 'Account', width: 30 },
  { key: 'userName', label: 'User Name', width: 25 },
  { key: 'mfaEnabled', label: 'MFA', width: 8 },
  { key: 'createdDate', label: 'Created', width: 15, type: 'date' as const },
  { key: 'passwordLastUsed', label: 'Last Login', width: 15, type: 'date' as const },
  { key: 'accessKeys', label: 'Access Keys', width: 12 },
  { key: 'groups', label: 'Groups', width: 30 },
  { key: 'attachedPolicies', label: 'Policies', width: 30 }
]

export const ROLE_USAGE_COLUMNS = [
  { key: 'userEmail', label: 'User', width: 30 },
  { key: 'accountName', label: 'Account', width: 30 },
  { key: 'roleName', label: 'Role', width: 25 },
  { key: 'assumedAt', label: 'Assumed At', width: 20, type: 'date' as const },
  { key: 'sourceIpAddress', label: 'Source IP', width: 15 },
  { key: 'mfaUsed', label: 'MFA', width: 8 },
  { key: 'sessionDuration', label: 'Duration (min)', width: 15 }
]
