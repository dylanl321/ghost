import { evaluateUserBadges, type BadgeContext, type UserBadge } from '~/config/userBadgeConfig'

export function useUserBadges() {
  const { fetchUserMemberOf } = useGraphApi()
  
  /**
   * Get badges for a single user
   */
  const getUserBadges = async (
    userPrincipalName: string,
    accessToken: string,
    additionalContext?: Partial<BadgeContext>
  ): Promise<UserBadge[]> => {
    try {
      // Fetch user's group memberships
      const groups = await fetchUserMemberOf(accessToken, userPrincipalName)
      const groupNames = groups.map((g: any) => g.displayName || '')
      
      // Build badge context
      const context: BadgeContext = {
        userPrincipalName,
        groups: groupNames,
        ...additionalContext
      }
      
      // Evaluate badges using the centralized configuration
      return await evaluateUserBadges(context)
    } catch (error) {
      console.warn(`Failed to get badges for user ${userPrincipalName}:`, error)
      return []
    }
  }
  
  /**
   * Batch process badges for multiple users
   */
  const batchGetUserBadges = async (
    users: Array<{
      userPrincipalName: string
      displayName?: string
      jobTitle?: string
      department?: string
      awsAccounts?: BadgeContext['awsAccounts']
    }>,
    accessToken: string
  ): Promise<Record<string, UserBadge[]>> => {
    const result: Record<string, UserBadge[]> = {}
    
    // Process in smaller batches to avoid rate limiting
    const batchSize = 5
    const batches = []
    
    for (let i = 0; i < users.length; i += batchSize) {
      batches.push(users.slice(i, i + batchSize))
    }
    
    for (const batch of batches) {
      await Promise.all(batch.map(async (user) => {
        try {
          const badges = await getUserBadges(
            user.userPrincipalName,
            accessToken,
            {
              displayName: user.displayName,
              jobTitle: user.jobTitle,
              department: user.department,
              awsAccounts: user.awsAccounts
            }
          )
          result[user.userPrincipalName] = badges
        } catch (error) {
          console.warn(`Failed to get badges for ${user.userPrincipalName}:`, error)
          result[user.userPrincipalName] = []
        }
      }))
    }
    
    return result
  }
  
  /**
   * Get badges from cached group data (no additional API calls)
   */
  const getBadgesFromGroups = async (
    groupNames: string[],
    additionalContext?: Partial<BadgeContext>
  ): Promise<UserBadge[]> => {
    const context: BadgeContext = {
      userPrincipalName: additionalContext?.userPrincipalName || '',
      groups: groupNames,
      ...additionalContext
    }
    
    return await evaluateUserBadges(context)
  }
  
  return {
    getUserBadges,
    batchGetUserBadges,
    getBadgesFromGroups
  }
}