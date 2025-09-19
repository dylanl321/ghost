/**
 * Composable for managing user group memberships and tags
 */

// interface GroupMember {
//   displayName: string;
//   userPrincipalName: string;
//   roles: string[];
// }

// interface GroupMembersResponse {
//   members: GroupMember[];
//   error?: string;
// }

// interface SimpleGroupMembersResponse {
//   members: Array<{
//     displayName: string;
//     userPrincipalName: string;
//   }>;
//   error?: string;
// }

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

interface GraphUser {
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
  const awsGroupRegex = new RegExp(`^AWS-${accountId}[_-](.+)$`);
  const match = groupName.match(awsGroupRegex);
  return match && match[1] ? match[1] : null;
};

const fetchGroupsWithPagination = async (accountId: string, accessToken: string): Promise<GraphGroup[]> => {
  const allGroups: GraphGroup[] = [];
  // Use startswith filter to get relevant groups only
  const filterQuery = `startswith(displayName,'AWS-${accountId}')`;
  let nextUrl = `https://graph.microsoft.us/v1.0/groups?$filter=${encodeURIComponent(filterQuery)}&$top=999`;

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Graph API Error: ${response.statusText}`);
      }

      const data = await response.json();
      allGroups.push(...data.value);

      nextUrl = data['@odata.nextLink'] || '';
    }

    return allGroups;
  } catch (error) {
    console.error('Error fetching groups with pagination:', error);
    throw error;
  }
};

const fetchGroupMembersWithPagination = async (groupId: string, accessToken: string): Promise<Array<{ displayName: string; userPrincipalName: string }>> => {
  const allMembers: Array<{ displayName: string; userPrincipalName: string }> = [];
  let nextUrl = `https://graph.microsoft.us/v1.0/groups/${groupId}/members?$top=999`;

  try {
    while (nextUrl) {
      const response = await fetch(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        // Enhanced error logging for debugging 401 issues
        const errorText = await response.text();
        console.error(`Graph API Error Details:`, {
          status: response.status,
          statusText: response.statusText,
          url: nextUrl,
          headers: response.headers,
          body: errorText
        });
        throw new Error(`Failed to fetch members for group ID ${groupId}: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data: GraphMembersResponse = await response.json();
      allMembers.push(...data.value);

      nextUrl = data['@odata.nextLink'] || '';
    }

    return allMembers;
  } catch (error) {
    console.error(`Error fetching members for group ${groupId}:`, error);
    throw error;
  }
};

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
            const role = parseAwsGroupRole(group.displayName, accountId);

            if (!role) {
              console.debug(`Skipping group with invalid format: ${group.displayName}`);
              return [];
            }

            const members = await fetchGroupMembersWithPagination(group.id, accessToken)

            return members.map((member) => ({
              displayName: member.displayName,
              userPrincipalName: member.userPrincipalName,
              role
            }));
          })
        )
        return memberResults.flat()
      }

      // Fetch users for commercial + govcloud
      const [commercialUsers, govcloudUsers] = await Promise.all([
        fetchForAccount(commercialId),
        fetchForAccount(govcloudId)
      ])

      const memberMap = new Map<string, GraphUser>();

      const combined = [...commercialUsers, ...govcloudUsers]

      combined.forEach((member: any) => {
        if (!member.userPrincipalName || !member.displayName) {
          console.debug('Skipping member with missing data:', member);
          return;
        }

        if (memberMap.has(member.userPrincipalName)) {
          // Add role to existing member
          const existing = memberMap.get(member.userPrincipalName)!;
          if (!existing.roles.includes(member.role)) {
            existing.roles.push(member.role);
          }
        } else {
          // Add new member
          memberMap.set(member.userPrincipalName, {
            displayName: member.displayName,
            userPrincipalName: member.userPrincipalName,
            roles: [member.role]
          });
        }
      });

      const finalMembers = Array.from(memberMap.values());
      console.log(`Found ${finalMembers.length} unique members across all groups`);

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
      console.error(
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
    // displayName?: string
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
    fetchEnclaveUsers,
    getUserTags,
    batchGetUserTags,
    getUserGroupStats,
    fetchMembersForGroup
  }
}