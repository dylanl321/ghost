/**
 * Composable for managing user group memberships and tags
 */

export interface UserTag {
  title: string
  color: string
  icon?: string
  description?: string
}

export const useGroupMembers = () => {
  /**
   * Get tags for a user based on their group memberships and attributes
   */
  const getUserTags = async (
    userPrincipalName: string, 
    accessToken: string,
    displayName?: string
  ): Promise<UserTag[]> => {
    const tags: UserTag[] = []
    
    try {
      // Fetch user's group memberships
      const { fetchUserMemberOf } = useGraphApi()
      const groups = await fetchUserMemberOf(accessToken, userPrincipalName)
      
      // Analyze groups for special roles
      const groupNames = groups.map((g: any) => g.displayName?.toLowerCase() || '')
      
      // Check for admin groups
      if (groupNames.some(g => g.includes('admin') || g.includes('administrator'))) {
        tags.push({
          title: 'Admin',
          color: 'red',
          icon: 'i-heroicons-shield-exclamation',
          description: 'Has administrative privileges'
        })
      }
      
      // Check for security groups
      if (groupNames.some(g => g.includes('security') || g.includes('infosec'))) {
        tags.push({
          title: 'Security',
          color: 'yellow',
          icon: 'i-heroicons-lock-closed',
          description: 'Member of security team'
        })
      }
      
      // Check for developer groups
      if (groupNames.some(g => g.includes('developer') || g.includes('engineering'))) {
        tags.push({
          title: 'Developer',
          color: 'blue',
          icon: 'i-heroicons-code-bracket',
          description: 'Developer access'
        })
      }
      
      // Check for AWS access
      if (groupNames.some(g => g.toLowerCase().startsWith('aws'))) {
        tags.push({
          title: 'AWS',
          color: 'orange',
          icon: 'i-heroicons-cloud',
          description: 'Has AWS account access'
        })
      }
      
      // Check for GovCloud access
      if (groupNames.some(g => g.includes('govcloud'))) {
        tags.push({
          title: 'GovCloud',
          color: 'purple',
          icon: 'i-heroicons-building-library',
          description: 'Has GovCloud access'
        })
      }
      
      // Check for contractor/external
      if (groupNames.some(g => g.includes('contractor') || g.includes('external'))) {
        tags.push({
          title: 'Contractor',
          color: 'gray',
          icon: 'i-heroicons-user-circle',
          description: 'External contractor'
        })
      }
      
    } catch (error) {
      console.warn(`Failed to get tags for user ${userPrincipalName}:`, error)
    }
    
    return tags
  }

  /**
   * Batch process tags for multiple users
   */
  const batchGetUserTags = async (
    users: Array<{ userPrincipalName: string; displayName?: string }>,
    accessToken: string
  ): Promise<Record<string, UserTag[]>> => {
    const result: Record<string, UserTag[]> = {}
    
    // Process in smaller batches to avoid rate limiting
    const batchSize = 5
    const batches = []
    
    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize))
    }
    
    for (const batch of batches) {
      const promises = batch.map(async (user) => {
        const tags = await getUserTags(user.userPrincipalName, accessToken, user.displayName)
        return { userPrincipalName: user.userPrincipalName, tags }
      })
      
      const batchResults = await Promise.all(promises)
      batchResults.forEach(({ userPrincipalName, tags }) => {
        result[userPrincipalName] = tags
      })
      
      // Small delay between batches to avoid rate limiting
      if (batches.indexOf(batch) < batches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }
    
    return result
  }

  /**
   * Get group statistics for a user
   */
  const getUserGroupStats = async (
    userPrincipalName: string,
    accessToken: string
  ): Promise<{
    totalGroups: number
    awsGroups: number
    securityGroups: number
    distributionLists: number
  }> => {
    try {
      const { fetchUserMemberOf } = useGraphApi()
      const groups = await fetchUserMemberOf(accessToken, userPrincipalName)
      
      let awsGroups = 0
      let securityGroups = 0
      let distributionLists = 0
      
      groups.forEach((group: any) => {
        const name = group.displayName?.toLowerCase() || ''
        
        if (name.startsWith('aws') || name.includes('govcloud')) {
          awsGroups++
        }
        
        if (name.includes('security') || name.includes('infosec')) {
          securityGroups++
        }
        
        if (group.mailEnabled) {
          distributionLists++
        }
      })
      
      return {
        totalGroups: groups.length,
        awsGroups,
        securityGroups,
        distributionLists
      }
    } catch (error) {
      console.error('Failed to get group stats:', error)
      return {
        totalGroups: 0,
        awsGroups: 0,
        securityGroups: 0,
        distributionLists: 0
      }
    }
  }

  /**
   * Fetch members of a specific group
   */
  const fetchMembersForGroup = async (
    groupId: string,
    accessToken: string
  ): Promise<{
    members: Array<{
      userPrincipalName: string
      displayName: string
      jobTitle?: string
    }>
    memberCount: number
  }> => {
    try {
      const allMembers: any[] = []
      let nextUrl = `https://graph.microsoft.us/v1.0/groups/${encodeURIComponent(groupId)}/members?$top=999&$select=id,displayName,userPrincipalName,jobTitle`

      while (nextUrl) {
        const response = await fetch(nextUrl, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })

        if (!response.ok) {
          throw new Error(`Failed to fetch group members: ${response.statusText}`)
        }

        const data = await response.json()
        allMembers.push(...data.value)
        nextUrl = data['@odata.nextLink'] || ''
      }

      // Filter to only include users (not groups or other object types)
      const users = allMembers.filter(member => 
        member['@odata.type'] === '#microsoft.graph.user' || 
        member.userPrincipalName // Fallback check
      )

      return {
        members: users.map(user => ({
          userPrincipalName: user.userPrincipalName,
          displayName: user.displayName,
          jobTitle: user.jobTitle
        })),
        memberCount: users.length
      }
    } catch (error) {
      console.error(`Failed to fetch members for group ${groupId}:`, error)
      return {
        members: [],
        memberCount: 0
      }
    }
  }

  return {
    getUserTags,
    batchGetUserTags,
    getUserGroupStats,
    fetchMembersForGroup
  }
}