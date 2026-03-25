const logger = createLogger('GroupMembers')

/**
 * Composable for managing user group memberships and tags
 */

interface GraphGroup {
  id: string;
  displayName: string;
}

interface GraphMembersResponse {
  value: Array<{
    displayName: string;
    userPrincipalName: string;
  }>;
  '@odata.nextLink'?: string;
}

export interface GraphUser {
  displayName: string
  userPrincipalName: string
  roles: string[]
}

export interface UserTag {
  title: string
  color: string
  icon?: string
  description?: string
}

// --------------------------------------
// ---------- Helper Functions ----------
// --------------------------------------

const parseAwsGroupRole = (groupName: string, accountId: string): string | null => {
  // Support both AWS-ID_ROLE and AWS-ID-ROLE patterns
  const awsGroupRegex = new RegExp(`^AWS-${accountId}[_-](.+)$`)
  const match = groupName.match(awsGroupRegex)
  return match && match[1] ? match[1] : null
}

const fetchGroupsWithPagination = async (accountId: string, accessToken: string): Promise<GraphGroup[]> => {
  const allGroups: GraphGroup[] = []
  // Use startswith filter to get relevant groups only
  const filterQuery = `startswith(displayName,'AWS-${accountId}')`
  let nextUrl = `https://graph.microsoft.us/v1.0/groups?$filter=${encodeURIComponent(filterQuery)}&$top=999`

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Graph API Error: ${response.statusText}`)
      }

      const data = await response.json()
      allGroups.push(...data.value)

      nextUrl = data['@odata.nextLink'] || ''
    }

    return allGroups
  } catch (error) {
    logger.error('Error fetching groups with pagination:', error)
    throw error
  }
}

const fetchGroupMembersWithPagination = async (groupId: string, accessToken: string): Promise<Array<{ displayName: string; userPrincipalName: string }>> => {
  const allMembers: Array<{ displayName: string; userPrincipalName: string }> = []
  let nextUrl = `https://graph.microsoft.us/v1.0/groups/${groupId}/members?$top=999`

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        // Enhanced error logging for debugging 401 issues
        const errorText = await response.text()
        logger.error('Graph API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          url: nextUrl,
          headers: response.headers,
          body: errorText
        })
        throw new Error(`Failed to fetch members for group ID ${groupId}: ${response.status} ${response.statusText} - ${errorText}`)
      }

      const data: GraphMembersResponse = await response.json()
      allMembers.push(...data.value)

      nextUrl = data['@odata.nextLink'] || ''
    }

    return allMembers
  } catch (error) {
    logger.error(`Error fetching members for group ${groupId}:`, error)
    throw error
  }
}

// ------------------------------------------------
// ---------- useGroupMembers Composable ----------
// ------------------------------------------------

export const useGroupMembers = () => {

  /**
   * Fetch all the users associated with an AWS Enclave
   */
  const fetchEnclaveUsers = async (commercialId: string, govcloudId: string, accessToken: string): Promise<GraphUser[]> => {
    try {
      // Helper function to fetch all users (and their roles) for a given account ID
      const fetchForAccount = async (accountId: string) => {
        const groups = await fetchGroupsWithPagination(accountId, accessToken)
        const memberResults = await Promise.all(
          groups.map(async (group: GraphGroup) => {
            const role = parseAwsGroupRole(group.displayName, accountId)

            if (!role) {
              logger.debug(`Skipping group with invalid format: ${group.displayName}`)
              return []
            }

            const members = await fetchGroupMembersWithPagination(group.id, accessToken)

            return members.map((member) => ({
              displayName: member.displayName,
              userPrincipalName: member.userPrincipalName,
              role
            }))
          })
        )
        return memberResults.flat()
      }

      // Fetch users for commercial + govcloud
      const [commercialUsers, govcloudUsers] = await Promise.all([
        fetchForAccount(commercialId),
        fetchForAccount(govcloudId)
      ])

      const memberMap = new Map<string, GraphUser>()

      const combined = [...commercialUsers, ...govcloudUsers]

      combined.forEach((member: any) => {
        if (!member.userPrincipalName || !member.displayName) {
          logger.debug('Skipping member with missing data:', member)
          return
        }

        if (memberMap.has(member.userPrincipalName)) {
          // Add role to existing member
          const existing = memberMap.get(member.userPrincipalName)!
          if (!existing.roles.includes(member.role)) {
            existing.roles.push(member.role)
          }
        } else {
          // Add new member
          memberMap.set(member.userPrincipalName, {
            displayName: member.displayName,
            userPrincipalName: member.userPrincipalName,
            roles: [member.role]
          })
        }
      })

      const finalMembers = Array.from(memberMap.values())
      logger.info(`Found ${finalMembers.length} unique members across all groups`)

      return finalMembers

      // // Deduplicate by UPN
      // const uniqueUsers = new Map<string, GraphUser>()
      // for (const user of combined) {
      //   if (user.userPrincipalName) {
      //     uniqueUsers.set(user.userPrincipalName, user)
      //   }
      // }

      // return Array.from(uniqueUsers.values())
    } catch (error) {
      logger.error(
        `Error fetching users for commercial ${commercialId} and govcloud ${govcloudId}:`,
        error
      )
      throw error
    }
  }

  /**
   * Get tags for a user based on their group memberships and attributes
   */
  const getUserTags = async (
    userPrincipalName: string, 
    accessToken: string,
    displayName?: string,
    jobTitle?: string,
    awsAccounts?: Array<{
      accountId: string
      accountName: string
      roles: string[]
      isGovCloud: boolean
    }>
  ): Promise<UserTag[]> => {
    // Use the simple badge system
    const { getUserBadges } = useSimpleBadges()
    
    try {
      const badges = await getUserBadges(
        userPrincipalName,
        accessToken,
        {
          displayName,
          jobTitle,
          awsAccounts
        }
      )
      
      // Already in UserTag format
      return badges
    } catch (error) {
      logger.warn(`Failed to get tags for user ${userPrincipalName}:`, error)
      return []
    }
  }

  /**
   * Batch process tags for multiple users
   */
  const batchGetUserTags = async (
    users: Array<{ 
      userPrincipalName: string
      displayName?: string
      jobTitle?: string
      awsAccounts?: Array<{
        accountId: string
        accountName: string
        roles: string[]
        isGovCloud: boolean
      }>
    }>,
    accessToken: string
  ): Promise<Record<string, UserTag[]>> => {
    // Use the simple badge system
    const { batchGetUserBadges } = useSimpleBadges()
    
    try {
      const badgeResults = await batchGetUserBadges(users, accessToken)
      
      // Already in correct format
      return badgeResults
    } catch (error) {
      logger.warn('Failed to batch get user tags:', error)
      return {}
    }
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
      logger.error('Failed to get group stats:', error)
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
      logger.error(`Failed to fetch members for group ${groupId}:`, error)
      return {
        members: [],
        memberCount: 0
      }
    }
  }

  return {
    fetchEnclaveUsers,
    getUserTags,
    batchGetUserTags,
    getUserGroupStats,
    fetchMembersForGroup
  }
}