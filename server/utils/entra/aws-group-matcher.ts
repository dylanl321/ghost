/**
 * AWS Group Matcher Utility
 * Matches Entra groups to AWS accounts and handles account lookups
 */

import type { 
  EntraGroup,
  ParsedAWSGroup,
  DistributionGroup,
  AccountGroups,
  AWSEnvironmentType
} from '../../types/entra'
import { parseAWSGroup, groupByAccount } from './group-parser'
import { entraConfig } from './config'

/**
 * Match groups to a specific AWS account
 */
export function matchGroupsToAccount(
  groups: EntraGroup[],
  accountId: string
): AccountGroups {
  const result: AccountGroups = {
    accountId,
    commercial: [],
    govcloud: [],
    distribution: null,
    uniqueOwners: []
  }
  
  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (!parsed) continue
    
    // Handle AWS authentication groups
    if ('accountId' in parsed && parsed.accountId === accountId) {
      if (parsed.environment === 'commercial') {
        result.commercial.push(parsed)
      } else if (parsed.environment === 'govcloud') {
        result.govcloud.push(parsed)
      }
    }
  }
  
  return result
}

/**
 * Find groups by account email/name
 */
export async function findGroupsByAccountEmail(
  groups: EntraGroup[],
  accountEmail: string
): Promise<{
  authGroups: AccountGroups
  distributionGroup: DistributionGroup | null
}> {
  // Extract account name from email (e.g., production@gd-ms.com -> production)
  const accountName = accountEmail.split('@')[0]
  
  let distributionGroup: DistributionGroup | null = null
  const authGroups: ParsedAWSGroup[] = []
  
  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (!parsed) continue
    
    // Check if it's the distribution group for this account
    if ('accountName' in parsed && parsed.accountName === accountName) {
      distributionGroup = parsed
    }
    // Collect auth groups (we'll need to match them separately)
    else if ('accountId' in parsed) {
      authGroups.push(parsed)
    }
  }
  
  // Group auth groups by account
  const grouped = groupByAccount(groups)
  
  // Find the matching account groups
  // This requires looking up the account ID from the email
  // For now, return empty auth groups - this will be linked with account lookup
  return {
    authGroups: {
      accountId: '',
      commercial: [],
      govcloud: [],
      distribution: distributionGroup,
      uniqueOwners: []
    },
    distributionGroup
  }
}

/**
 * Filter groups by environment
 */
export function filterGroupsByEnvironment(
  groups: ParsedAWSGroup[],
  environment: AWSEnvironmentType
): ParsedAWSGroup[] {
  return groups.filter(g => g.environment === environment)
}

/**
 * Get all unique account IDs from groups
 */
export function extractAccountIds(groups: EntraGroup[]): string[] {
  const accountIds = new Set<string>()
  
  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (parsed && 'accountId' in parsed && parsed.accountId) {
      accountIds.add(parsed.accountId)
    }
  }
  
  return Array.from(accountIds)
}

/**
 * Match groups to multiple accounts
 */
export function matchGroupsToAccounts(
  groups: EntraGroup[],
  accountIds: string[]
): Record<string, AccountGroups> {
  const result: Record<string, AccountGroups> = {}
  
  // Initialize result for each account
  for (const accountId of accountIds) {
    result[accountId] = {
      accountId,
      commercial: [],
      govcloud: [],
      distribution: null,
      uniqueOwners: []
    }
  }
  
  // Parse and distribute groups
  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (!parsed || !('accountId' in parsed)) continue
    
    if (result[parsed.accountId]) {
      if (parsed.environment === 'commercial') {
        result[parsed.accountId].commercial.push(parsed)
      } else if (parsed.environment === 'govcloud') {
        result[parsed.accountId].govcloud.push(parsed)
      }
    }
  }
  
  return result
}

/**
 * Find groups with specific role patterns
 */
export function findGroupsByRole(
  groups: ParsedAWSGroup[],
  rolePattern: string | RegExp
): ParsedAWSGroup[] {
  const pattern = typeof rolePattern === 'string' 
    ? new RegExp(rolePattern, 'i')
    : rolePattern
  
  return groups.filter(g => pattern.test(g.role))
}

/**
 * Get groups that have owners
 */
export function getGroupsWithOwners(groups: ParsedAWSGroup[]): ParsedAWSGroup[] {
  return groups.filter(g => g.owners && g.owners.length > 0)
}

/**
 * Find groups by owner
 */
export function findGroupsByOwner(
  groups: ParsedAWSGroup[],
  ownerIdentifier: string
): ParsedAWSGroup[] {
  return groups.filter(g => 
    g.owners.some(owner => 
      owner.toLowerCase() === ownerIdentifier.toLowerCase()
    )
  )
}

/**
 * Build a summary of groups by role across all accounts
 */
export function summarizeGroupsByRole(
  accountGroups: Record<string, AccountGroups>
): Record<string, {
  commercial: number
  govcloud: number
  total: number
  accounts: string[]
}> {
  const summary: Record<string, any> = {}
  
  for (const [accountId, groups] of Object.entries(accountGroups)) {
    // Process commercial groups
    for (const group of groups.commercial) {
      if (!summary[group.role]) {
        summary[group.role] = {
          commercial: 0,
          govcloud: 0,
          total: 0,
          accounts: []
        }
      }
      summary[group.role].commercial++
      summary[group.role].total++
      if (!summary[group.role].accounts.includes(accountId)) {
        summary[group.role].accounts.push(accountId)
      }
    }
    
    // Process govcloud groups
    for (const group of groups.govcloud) {
      if (!summary[group.role]) {
        summary[group.role] = {
          commercial: 0,
          govcloud: 0,
          total: 0,
          accounts: []
        }
      }
      summary[group.role].govcloud++
      summary[group.role].total++
      if (!summary[group.role].accounts.includes(accountId)) {
        summary[group.role].accounts.push(accountId)
      }
    }
  }
  
  return summary
}

/**
 * Validate group naming convention
 */
export function validateGroupName(displayName: string): {
  valid: boolean
  type: 'aws_auth' | 'distribution' | 'invalid'
  errors: string[]
} {
  const errors: string[] = []
  
  // Check if it's an AWS auth group
  const awsPattern = new RegExp(
    `^${entraConfig.search.groupPrefix}\\d{12}_(commercial|govcloud)_.+$`
  )
  if (awsPattern.test(displayName)) {
    return { valid: true, type: 'aws_auth', errors: [] }
  }
  
  // Check if it's a distribution group
  if (displayName.endsWith(entraConfig.search.distributionSuffix)) {
    return { valid: true, type: 'distribution', errors: [] }
  }
  
  // Invalid group name
  errors.push(`Group name doesn't match expected patterns`)
  errors.push(`Expected: ${entraConfig.search.groupPrefix}[AccountId]_[Environment]_[Role]`)
  errors.push(`Or: [AccountName]${entraConfig.search.distributionSuffix}`)
  
  return { valid: false, type: 'invalid', errors }
}