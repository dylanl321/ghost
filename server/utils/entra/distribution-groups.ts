/**
 * Distribution Groups Handler
 * Manages distribution groups in format accountname.aws
 */

import type { H3Event } from 'h3'
import type { 
  EntraGroup, 
  DistributionGroup,
  EntraUser
} from '../../types/entra'
import { entraConfig, getCacheKey } from './config'
import { parseGroupDescription } from './group-parser'
import { graphRequest, getAllPages } from './graph-client'
import { accountCache, CacheTags } from '../cache-manager'

/**
 * Check if a group is a distribution group
 */
export function isDistributionGroup(displayName: string): boolean {
  return displayName.endsWith(entraConfig.search.distributionSuffix)
}

/**
 * Extract account name from distribution group name
 */
export function extractAccountName(displayName: string): string | null {
  if (!isDistributionGroup(displayName)) {
    return null
  }
  
  return displayName.replace(entraConfig.search.distributionSuffix, '')
}

/**
 * Find distribution group by account name or email
 */
export async function findDistributionGroup(
  event: H3Event,
  accountIdentifier: string
): Promise<DistributionGroup | null> {
  try {
    // Extract account name from email if needed
    const accountName = accountIdentifier.includes('@') 
      ? accountIdentifier.split('@')[0]
      : accountIdentifier
    
    // Check if the account name already ends with .AWS (case insensitive)
    const suffix = entraConfig.search.distributionSuffix
    const groupName = accountName.toLowerCase().endsWith(suffix.toLowerCase()) 
      ? accountName 
      : `${accountName}${suffix}`
    const cacheKey = getCacheKey('groups', `dist-${accountName}`)
    
    // Check cache first
    const cached = await accountCache.get(cacheKey)
    if (cached) {
      console.log(`Cache hit for distribution group ${groupName}`)
      return cached
    }
    
    console.log(`Looking for distribution group: ${groupName}`)
    
    // Search for the specific distribution group
    const filter = `displayName eq '${groupName}'`
    const queryParams = new URLSearchParams({
      '$filter': filter,
      '$select': 'id,displayName,description,mail,mailEnabled'
    })
    
    const response = await graphRequest<any>(event, `/groups?${queryParams}`)
    
    if (!response.value || response.value.length === 0) {
      console.log(`No distribution group found for ${accountName}`)
      return null
    }
    
    const group = response.value[0]
    const { purpose, owners } = parseGroupDescription(group.description)
    
    const distributionGroup: DistributionGroup = {
      id: group.id,
      displayName: group.displayName,
      accountName,
      description: group.description || '',
      owners,
      mail: group.mail,
      memberCount: 0 // Will be populated if needed
    }
    
    // Cache the result
    await accountCache.set(
      cacheKey,
      distributionGroup,
      {
        ttl: entraConfig.cache.ttl,
        tags: [CacheTags.ACCOUNTS, 'ENTRA', 'ENTRA_GROUPS']
      }
    )
    
    return distributionGroup
  } catch (error) {
    console.error(`Failed to find distribution group for ${accountIdentifier}:`, error)
    return null
  }
}

/**
 * Get all distribution groups
 */
export async function getAllDistributionGroups(
  event: H3Event
): Promise<DistributionGroup[]> {
  const cacheKey = getCacheKey('groups', 'all-distribution')
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached) {
    console.log('Cache hit for all distribution groups')
    return cached
  }
  
  try {
    const filter = `endsWith(displayName, '${entraConfig.search.distributionSuffix}')`
    const queryParams = new URLSearchParams({
      '$filter': filter,
      '$select': 'id,displayName,description,mail,mailEnabled',
      '$top': entraConfig.search.batchSize.toString(),
      '$count': 'true'  // Required for endsWith operator
    })
    
    const groups = await getAllPages<EntraGroup>(event, `/groups?${queryParams}`)
    
    const distributionGroups: DistributionGroup[] = groups.map(group => {
      const { purpose, owners } = parseGroupDescription(group.description)
      const accountName = extractAccountName(group.displayName) || ''
      
      return {
        id: group.id,
        displayName: group.displayName,
        accountName,
        description: group.description || '',
        owners,
        mail: group.mail,
        memberCount: 0
      }
    })
    
    // Cache the results
    await accountCache.set(
      cacheKey,
      distributionGroups,
      {
        ttl: entraConfig.cache.ttl,
        tags: [CacheTags.ACCOUNTS, 'ENTRA', 'ENTRA_GROUPS']
      }
    )
    
    return distributionGroups
  } catch (error) {
    console.error('Failed to get all distribution groups:', error)
    throw error
  }
}

/**
 * Get members of a distribution group
 */
export async function getDistributionGroupMembers(
  event: H3Event,
  groupId: string
): Promise<EntraUser[]> {
  const cacheKey = getCacheKey('members', `dist-${groupId}`)
  
  // Check cache first
  const cached = await accountCache.get(cacheKey)
  if (cached) {
    console.log(`Cache hit for distribution group members ${groupId}`)
    return cached
  }
  
  try {
    const queryParams = new URLSearchParams({
      '$select': 'id,displayName,mail,userPrincipalName',
      '$top': entraConfig.search.batchSize.toString()
    })
    
    const members = await getAllPages<EntraUser>(
      event, 
      `/groups/${groupId}/members?${queryParams}`
    )
    
    // Cache the results
    await accountCache.set(
      cacheKey,
      members,
      {
        ttl: entraConfig.cache.ttl,
        tags: ['ENTRA', 'ENTRA_USERS']
      }
    )
    
    return members
  } catch (error) {
    console.error(`Failed to get distribution group members for ${groupId}:`, error)
    throw error
  }
}

/**
 * Link distribution groups to AWS accounts
 * This requires account lookup from your existing account management
 */
export async function linkDistributionGroupsToAccounts(
  distributionGroups: DistributionGroup[],
  accounts: any[] // Use your existing account type
): Map<string, string> {
  const accountMap = new Map<string, string>()
  
  for (const group of distributionGroups) {
    // Find matching account by email prefix
    const matchingAccount = accounts.find(account => {
      if (!account.email) return false
      const emailPrefix = account.email.split('@')[0]
      return emailPrefix === group.accountName
    })
    
    if (matchingAccount) {
      accountMap.set(group.accountName, matchingAccount.id)
    }
  }
  
  return accountMap
}

/**
 * Create a distribution group summary
 */
export function summarizeDistributionGroups(
  groups: DistributionGroup[]
): {
  total: number
  withOwners: number
  withoutOwners: number
  byAccountName: Record<string, DistributionGroup>
  uniqueOwners: Set<string>
} {
  const summary = {
    total: groups.length,
    withOwners: 0,
    withoutOwners: 0,
    byAccountName: {} as Record<string, DistributionGroup>,
    uniqueOwners: new Set<string>()
  }
  
  for (const group of groups) {
    // Count owners
    if (group.owners.length > 0) {
      summary.withOwners++
      group.owners.forEach(owner => summary.uniqueOwners.add(owner))
    } else {
      summary.withoutOwners++
    }
    
    // Index by account name
    summary.byAccountName[group.accountName] = group
  }
  
  return summary
}

/**
 * Validate distribution group configuration
 */
export function validateDistributionGroup(group: DistributionGroup): {
  valid: boolean
  warnings: string[]
  errors: string[]
} {
  const warnings: string[] = []
  const errors: string[] = []
  
  // Check group name format
  if (!isDistributionGroup(group.displayName)) {
    errors.push(`Group name doesn't end with ${entraConfig.search.distributionSuffix}`)
  }
  
  // Check for owners
  if (group.owners.length === 0) {
    warnings.push('No owners defined in group description')
  }
  
  // Check account name
  if (!group.accountName) {
    errors.push('Unable to extract account name from group name')
  }
  
  // Check if mail-enabled (distribution groups should be)
  if (group.mail === undefined) {
    warnings.push('Distribution group may not be mail-enabled')
  }
  
  return {
    valid: errors.length === 0,
    warnings,
    errors
  }
}