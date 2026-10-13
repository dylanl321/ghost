/**
 * Entra ID Group Parser
 * Parses AWS groups and extracts metadata including owners
 */

import type { 
  EntraGroup, 
  ParsedAWSGroup, 
  DistributionGroup, 
  AccountGroups,
  GroupOwner,
  AWSEnvironmentType 
} from '../../types/entra'
import { entraConfig } from './config'

/**
 * Parse an AWS authentication group name
 * Format: AWS-[accountId]_[role] (e.g., AWS-926182194632_GDSSO_IAMAdmin)
 */
function parseAWSGroupName(displayName: string, contextEnvironment?: AWSEnvironmentType): {
  accountId: string
  environment: AWSEnvironmentType
  role: string
} | null {
  const pattern = /^AWS[-_](\d{12})[_-](.+)$/i
  const match = displayName.match(pattern)
  
  if (!match) {
    return null
  }
  
  // Use the context environment if provided, otherwise default to 'commercial'
  return {
    accountId: match[1],
    environment: contextEnvironment || 'commercial' as AWSEnvironmentType,
    role: match[2]
  }
}

/**
 * Parse group description to extract purpose and owners
 * Format: "owner1 owner2 owner3 \\ Purpose text"
 */
export function parseGroupDescription(description?: string): {
  purpose: string
  owners: string[]
} {
  if (!description) {
    return { purpose: '', owners: [] }
  }
  
  const match = description.match(entraConfig.parsing.ownerPattern)
  
  if (match) {
    // Extract owners (everything before the \\)
    const ownerString = match[1].trim()
    const owners = ownerString.split(/\s+/).filter(Boolean)
    
    // Extract purpose (everything after the backslashes)
    // Find the first occurrence of any number of backslashes with spaces
    const delimiterMatch = description.match(/\s\\+\s/)
    const purpose = delimiterMatch 
      ? description.substring(delimiterMatch.index! + delimiterMatch[0].length).trim()
      : ''
    
    return { purpose, owners }
  }
  
  // No owner delimiter found, entire description is the purpose
  return { purpose: description, owners: [] }
}

/**
 * Check if a group is a distribution group
 */
function isDistributionGroup(displayName: string): boolean {
  return displayName.endsWith(entraConfig.search.distributionSuffix)
}

/**
 * Parse a distribution group
 */
function parseDistributionGroup(group: EntraGroup): DistributionGroup {
  const { purpose, owners } = parseGroupDescription(group.description)
  const accountName = group.displayName.replace(entraConfig.search.distributionSuffix, '')
  
  return {
    id: group.id,
    displayName: group.displayName,
    accountName,
    description: group.description || '',
    owners,
    mail: group.mail,
    memberCount: 0 // Will be populated later if needed
  }
}

/**
 * Parse a single Entra group into AWS group metadata with environment context
 */
export function parseAWSGroupWithContext(group: EntraGroup, contextEnvironment?: AWSEnvironmentType): ParsedAWSGroup | DistributionGroup | null {
  // Check if it's a distribution group first
  if (isDistributionGroup(group.displayName)) {
    return parseDistributionGroup(group)
  }
  
  // Try to parse as AWS authentication group
  const nameComponents = parseAWSGroupName(group.displayName, contextEnvironment)
  if (!nameComponents) {
    return null // Not an AWS group
  }
  
  const { purpose, owners } = parseGroupDescription(group.description)
  
  return {
    id: group.id,
    displayName: group.displayName,
    accountId: nameComponents.accountId,
    environment: nameComponents.environment,
    role: nameComponents.role,
    description: group.description || '',
    purpose,
    owners,
    isDistributionGroup: false,
    mailEnabled: group.mailEnabled,
    securityEnabled: group.securityEnabled,
    memberCount: 0 // Will be populated later if needed
  }
}

/**
 * Parse a single Entra group into AWS group metadata
 */
export function parseAWSGroup(group: EntraGroup): ParsedAWSGroup | DistributionGroup | null {
  // Check if it's a distribution group first
  if (isDistributionGroup(group.displayName)) {
    return parseDistributionGroup(group)
  }
  
  // Try to parse as AWS authentication group
  const nameComponents = parseAWSGroupName(group.displayName)
  if (!nameComponents) {
    return null // Not an AWS group
  }
  
  const { purpose, owners } = parseGroupDescription(group.description)
  
  return {
    id: group.id,
    displayName: group.displayName,
    accountId: nameComponents.accountId,
    environment: nameComponents.environment,
    role: nameComponents.role,
    description: group.description || '',
    purpose,
    owners,
    isDistributionGroup: false,
    mailEnabled: group.mailEnabled,
    securityEnabled: group.securityEnabled,
    memberCount: 0 // Will be populated later if needed
  }
}

/**
 * Group parsed groups by AWS account
 */
export function groupByAccount(groups: EntraGroup[]): Record<string, AccountGroups> {
  const grouped: Record<string, AccountGroups> = {}
  
  for (const group of groups) {
    const parsed = parseAWSGroup(group)
    if (!parsed) continue
    
    // Handle distribution groups
    if ('accountName' in parsed) {
      // Distribution groups are stored by account name
      const accountName = parsed.accountName
      if (!grouped[accountName]) {
        grouped[accountName] = {
          accountId: '', // Will need to be resolved from account lookup
          commercial: [],
          govcloud: [],
          distribution: null,
          uniqueOwners: []
        }
      }
      grouped[accountName].distribution = parsed
      continue
    }
    
    // Handle AWS authentication groups
    const accountId = parsed.accountId
    if (!grouped[accountId]) {
      grouped[accountId] = {
        accountId,
        commercial: [],
        govcloud: [],
        distribution: null,
        uniqueOwners: []
      }
    }
    
    if (parsed.environment === 'commercial') {
      grouped[accountId].commercial.push(parsed)
    } else if (parsed.environment === 'govcloud') {
      grouped[accountId].govcloud.push(parsed)
    }
  }
  
  // Extract unique owners for each account
  for (const accountId in grouped) {
    grouped[accountId].uniqueOwners = extractUniqueOwners(grouped[accountId])
  }
  
  return grouped
}

/**
 * Extract unique owners from all groups for an account
 */
export function extractUniqueOwners(accountGroups: AccountGroups): GroupOwner[] {
  const ownerSet = new Set<string>()
  const owners: GroupOwner[] = []
  
  // Collect owners from commercial groups
  for (const group of accountGroups.commercial) {
    group.owners.forEach(owner => ownerSet.add(owner))
  }
  
  // Collect owners from govcloud groups
  for (const group of accountGroups.govcloud) {
    group.owners.forEach(owner => ownerSet.add(owner))
  }
  
  // Collect owners from distribution group
  if (accountGroups.distribution) {
    accountGroups.distribution.owners.forEach(owner => ownerSet.add(owner))
  }
  
  // Convert to GroupOwner objects
  for (const identifier of ownerSet) {
    owners.push({
      identifier,
      type: determineOwnerType(identifier)
    })
  }
  
  return owners
}

/**
 * Determine if an owner identifier is a user or group
 */
function determineOwnerType(identifier: string): 'user' | 'group' | 'unknown' {
  // Check if it looks like an email/username (contains a dot)
  if (identifier.includes('.')) {
    return 'user'
  }
  
  // Check if it ends with common group suffixes
  if (identifier.toLowerCase().endsWith('group') || 
      identifier.toLowerCase().endsWith('team') ||
      identifier.toLowerCase().includes('gdms')) {
    return 'group'
  }
  
  // Default to unknown
  return 'unknown'
}

/**
 * Filter groups by role
 */
export function filterGroupsByRole(groups: ParsedAWSGroup[], role: string): ParsedAWSGroup[] {
  return groups.filter(group => 
    group.role.toLowerCase().includes(role.toLowerCase())
  )
}

/**
 * Sort groups by role priority (Admin > Write > Read)
 */
export function sortGroupsByRole(groups: ParsedAWSGroup[]): ParsedAWSGroup[] {
  const rolePriority: Record<string, number> = {
    'admin': 1,
    'administrator': 1,
    'write': 2,
    'poweruser': 2,
    'read': 3,
    'readonly': 3,
    'audit': 4
  }
  
  return groups.sort((a, b) => {
    const aPriority = rolePriority[a.role.toLowerCase()] || 999
    const bPriority = rolePriority[b.role.toLowerCase()] || 999
    return aPriority - bPriority
  })
}

/**
 * Get statistics for account groups
 */
export function getAccountGroupStatistics(accountGroups: AccountGroups): {
  totalGroups: number
  commercialGroups: number
  govcloudGroups: number
  hasDistribution: boolean
  totalOwners: number
  roles: string[]
} {
  const allRoles = new Set<string>()
  
  accountGroups.commercial.forEach(g => allRoles.add(g.role))
  accountGroups.govcloud.forEach(g => allRoles.add(g.role))
  
  return {
    totalGroups: accountGroups.commercial.length + accountGroups.govcloud.length,
    commercialGroups: accountGroups.commercial.length,
    govcloudGroups: accountGroups.govcloud.length,
    hasDistribution: !!accountGroups.distribution,
    totalOwners: accountGroups.uniqueOwners.length,
    roles: Array.from(allRoles)
  }
}
