/**
 * Composable for parsing AWS group names and extracting role information
 */

export interface ParsedAwsGroup {
  type: 'aws-role' | 'other'
  accountId?: string
  role?: string
  environment?: 'commercial' | 'govcloud'
  rawGroup: string
}

export const useAwsGroupParser = () => {
  /**
   * Parse an AWS group name to extract account ID and role
   * Expected formats:
   * - AWS-{AccountID}-{RoleName}
   * - AWS_{AccountID}_{RoleName}
   * - GovCloud-{AccountID}-{RoleName}
   */
  const parseAwsGroupName = (groupName: string): ParsedAwsGroup => {
    // Check if it's an AWS group
    if (!groupName.startsWith('AWS') && !groupName.toLowerCase().includes('govcloud')) {
      return { type: 'other', rawGroup: groupName }
    }

    // Try different patterns
    const patterns = [
      /^AWS[-_](\d{12})[-_](.+)$/i,
      /^GovCloud[-_](\d{12})[-_](.+)$/i,
      /^AWS\s+(\d{12})\s+(.+)$/i,
    ]

    for (const pattern of patterns) {
      const match = groupName.match(pattern)
      if (match) {
        const [, accountId, role] = match
        const environment = groupName.toLowerCase().includes('govcloud') ? 'govcloud' : 'commercial'
        
        return {
          type: 'aws-role',
          accountId,
          role: role.trim(),
          environment,
          rawGroup: groupName
        }
      }
    }

    // If it starts with AWS but doesn't match patterns, still mark as AWS type
    if (groupName.startsWith('AWS')) {
      return { type: 'aws-role', rawGroup: groupName }
    }

    return { type: 'other', rawGroup: groupName }
  }

  /**
   * Sort roles by priority/privilege level
   */
  const sortRolesByPriority = (roles: string[]): string[] => {
    const priorityMap: Record<string, number> = {
      'administrator': 1,
      'admin': 2,
      'poweruser': 3,
      'developer': 4,
      'contributor': 5,
      'readwrite': 6,
      'readonly': 7,
      'viewer': 8,
      'limited': 9
    }

    return roles.sort((a, b) => {
      const aLower = a.toLowerCase()
      const bLower = b.toLowerCase()
      
      // Find priority for each role
      let aPriority = 999
      let bPriority = 999
      
      for (const [key, priority] of Object.entries(priorityMap)) {
        if (aLower.includes(key)) aPriority = Math.min(aPriority, priority)
        if (bLower.includes(key)) bPriority = Math.min(bPriority, priority)
      }
      
      if (aPriority !== bPriority) {
        return aPriority - bPriority
      }
      
      // If same priority, sort alphabetically
      return a.localeCompare(b)
    })
  }

  /**
   * Get role priority level
   */
  const getRolePriority = (role: string): 'high' | 'medium' | 'low' => {
    const roleLower = role.toLowerCase()
    
    if (roleLower.includes('admin') || roleLower.includes('administrator')) {
      return 'high'
    }
    
    if (roleLower.includes('power') || roleLower.includes('developer') || 
        roleLower.includes('contributor') || roleLower.includes('readwrite')) {
      return 'medium'
    }
    
    return 'low'
  }

  /**
   * Extract unique account IDs from group names
   */
  const extractAccountIds = (groupNames: string[]): string[] => {
    const accountIds = new Set<string>()
    
    groupNames.forEach(group => {
      const parsed = parseAwsGroupName(group)
      if (parsed.accountId) {
        accountIds.add(parsed.accountId)
      }
    })
    
    return Array.from(accountIds)
  }

  return {
    parseAwsGroupName,
    sortRolesByPriority,
    getRolePriority,
    extractAccountIds
  }
}