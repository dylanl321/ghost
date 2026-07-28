import type { H3Event } from 'h3'
import { getAWSGroups, getGroupMembers } from './entra/graph-client'
import { getAllAccountsUnified } from './accounts-consolidated'
import { logger } from './logger'
import type {
  EntraUserRecord,
  EntraUsersDatasetFilters,
  DatasetQueryOptions,
  DatasetQueryResult
} from '../../shared/types/dataset-reports'

/**
 * Fetches Entra ID user-to-account access mappings
 * Returns one record per user-account-role combination (expanded view)
 */
export async function getEntraUsers(
  event: H3Event,
  accountIds: string[],
  filters: EntraUsersDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<EntraUserRecord[]> {
  return (await queryEntraUsers(event, accountIds, filters, options)).records
}

export async function queryEntraUsers(
  event: H3Event,
  accountIds: string[],
  filters: EntraUsersDatasetFilters = {},
  options: DatasetQueryOptions = {}
): Promise<DatasetQueryResult<EntraUserRecord>> {
  const startTime = Date.now()

  logger.info('[EntraUsers] Fetching user access data', {
    accountCount: accountIds.length || 'all',
    filters
  })

  try {
    // 1. Get all accounts for mapping
    const allAccounts = await getAllAccountsUnified()
    const accountMap = new Map(
      allAccounts.map(acc => [acc.accountId, acc.accountName || acc.accountId])
    )

    // 2. Determine target accounts
    const targetAccountIds = accountIds.length > 0
      ? accountIds
      : allAccounts.map(acc => acc.accountId)

    // 3. Get AWS groups from Entra (server-side, uses session)
    const { data: groupsByAccount } = await getAWSGroups(event, {
      accountId: undefined, // Get all groups
      includeDistribution: false // Only role groups for access reports
    }, options.mode === 'preview' ? { maxPages: 2, signal: options.signal } : { signal: options.signal })

    // 4. Build user-account-role mappings
    const userRecords: EntraUserRecord[] = []
    const processedGroups: string[] = []
    let hasMore = false

    // groupsByAccount structure: Record<accountId, AccountGroups>
    // AccountGroups has: { accountId, commercial: ParsedAWSGroup[], govcloud: ParsedAWSGroup[], distribution, uniqueOwners }
    for (const [accountId, accountGroups] of Object.entries(groupsByAccount)) {
      // Filter by selected accounts
      if (targetAccountIds.length > 0 && !targetAccountIds.includes(accountId)) {
        continue
      }

      // Process both commercial and govcloud groups
      const allGroups = [...accountGroups.commercial, ...accountGroups.govcloud]

      for (const group of allGroups) {
        if (options.signal?.aborted) throw options.signal.reason || new Error('Query canceled')
        if (options.limit && userRecords.length >= options.limit) {
          hasMore = true
          break
        }
        // Filter by roles if specified
        if (filters.roles && filters.roles.length > 0 && !filters.roles.includes(group.role)) {
          continue
        }

        try {
          // Get members of this group
          const membersResponse = await getGroupMembers(event, group.id, true, options.mode === 'preview'
            ? { limit: Math.max(1, (options.limit || 25) - userRecords.length), maxPages: 2, signal: options.signal }
            : { signal: options.signal })

          for (const member of membersResponse.members || []) {
            const graphMember = member as any
            // Only include users (not groups or service principals)
            if (graphMember['@odata.type'] !== '#microsoft.graph.user') {
              continue
            }

            userRecords.push({
              userId: member.id,
              userPrincipalName: member.userPrincipalName || '',
              displayName: member.displayName || 'Unknown User',
              email: member.mail || member.userPrincipalName || '',
              accountId: group.accountId,
              accountName: accountMap.get(group.accountId) || group.accountId,
              role: group.role,
              groupName: group.displayName,
              groupId: group.id,
              lastSignIn: graphMember.signInActivity?.lastSignInDateTime,
              jobTitle: member.jobTitle,
              department: member.department,
              manager: graphMember.manager?.displayName
            })
            if (options.limit && userRecords.length >= options.limit) {
              hasMore = true
              break
            }
          }

          processedGroups.push(group.displayName)
          await options.onProgress?.({ phase: 'entraUsers', processed: userRecords.length })
        } catch (error: any) {
          logger.warn('[EntraUsers] Failed to fetch members for group', {
            groupName: group.displayName,
            error: error.message
          })
        }
      }
    }

    // 5. Apply additional filters
    let filteredRecords = userRecords

    // User search filter
    if (filters.userSearch) {
      const search = filters.userSearch.toLowerCase()
      filteredRecords = filteredRecords.filter(r =>
        r.displayName.toLowerCase().includes(search) ||
        r.email.toLowerCase().includes(search) ||
        r.userPrincipalName.toLowerCase().includes(search)
      )
    }

    // Apply activity state against the requested lookback window.
    const activityStatus = filters.activityStatus || (filters.activeOnly ? 'active' : 'all')
    if (activityStatus !== 'all') {
      const cutoffDate = new Date()
      cutoffDate.setDate(cutoffDate.getDate() - (filters.lookbackDays || 30))
      filteredRecords = filteredRecords.filter(record => {
        const lastSignIn = record.lastSignIn ? new Date(record.lastSignIn) : null
        if (activityStatus === 'active') return !!lastSignIn && lastSignIn >= cutoffDate
        return !lastSignIn || lastSignIn < cutoffDate
      })
    }

    // Department filter
    if (filters.departments && filters.departments.length > 0) {
      filteredRecords = filteredRecords.filter(r =>
        r.department && filters.departments!.includes(r.department)
      )
    }

    const duration = Date.now() - startTime
    logger.info('[EntraUsers] Fetch complete', {
      totalRecords: filteredRecords.length,
      processedGroups: processedGroups.length,
      durationMs: duration
    })

    const records = options.limit ? filteredRecords.slice(0, options.limit) : filteredRecords
    return {
      records,
      sampleCount: records.length,
      hasMore,
      truncated: hasMore,
      scannedCount: userRecords.length
    }

  } catch (error: any) {
    logger.error('[EntraUsers] Failed to fetch user data', { error: error.message, stack: error.stack })
    throw new Error(`Failed to fetch Entra user data: ${error.message}`)
  }
}

/**
 * Generates summary statistics for Entra user access
 */
export async function getEntraUsersSummary(
  event: H3Event,
  accountIds: string[],
  filters: EntraUsersDatasetFilters = {}
): Promise<{
  totalUsers: number
  totalAccessMappings: number
  usersByAccount: Record<string, number>
  usersByRole: Record<string, number>
  activeUsers: number
  inactiveUsers: number
  usersWithMultipleAccounts: number
}> {
  const users = await getEntraUsers(event, accountIds, filters)

  const uniqueUserIds = new Set(users.map(u => u.userId))
  const userAccountCounts = new Map<string, number>()

  const summary = {
    totalUsers: uniqueUserIds.size,
    totalAccessMappings: users.length,
    usersByAccount: {} as Record<string, number>,
    usersByRole: {} as Record<string, number>,
    activeUsers: 0,
    inactiveUsers: 0,
    usersWithMultipleAccounts: 0
  }

  for (const user of users) {
    // Count unique users per account
    const uniqueUsersForAccount = users
      .filter(u => u.accountId === user.accountId)
      .map(u => u.userId)
    summary.usersByAccount[user.accountId] = new Set(uniqueUsersForAccount).size

    // Count access mappings by role
    const roleKey = user.role
    summary.usersByRole[roleKey] = (summary.usersByRole[roleKey] || 0) + 1

    // Count accounts per user
    const userAccounts = userAccountCounts.get(user.userId) || 0
    userAccountCounts.set(user.userId, userAccounts + 1)

    // Count active users (at least one record with sign-in)
    if (user.lastSignIn) {
      summary.activeUsers++
    } else {
      summary.inactiveUsers++
    }
  }

  // Count users with multiple accounts
  for (const count of userAccountCounts.values()) {
    if (count > 1) {
      summary.usersWithMultipleAccounts++
    }
  }

  return summary
}

/**
 * Aggregates user records into compact view (one row per user)
 * Used for compact export formats
 */
export function aggregateUserRecords(records: EntraUserRecord[]): Array<{
  userId: string
  userPrincipalName: string
  displayName: string
  email: string
  department?: string
  jobTitle?: string
  manager?: string
  lastSignIn?: string
  accountCount: number
  accounts: string[]
  roles: string[]
  accessMappings: Array<{ accountId: string; accountName: string; role: string }>
}> {
  const userMap = new Map<string, any>()

  for (const record of records) {
    if (!userMap.has(record.userId)) {
      userMap.set(record.userId, {
        userId: record.userId,
        userPrincipalName: record.userPrincipalName,
        displayName: record.displayName,
        email: record.email,
        department: record.department,
        jobTitle: record.jobTitle,
        manager: record.manager,
        lastSignIn: record.lastSignIn,
        accountCount: 0,
        accounts: new Set<string>(),
        roles: new Set<string>(),
        accessMappings: []
      })
    }

    const user = userMap.get(record.userId)
    user.accounts.add(`${record.accountName} (${record.accountId})`)
    user.roles.add(record.role)
    user.accessMappings.push({
      accountId: record.accountId,
      accountName: record.accountName,
      role: record.role
    })

    // Update last sign-in if more recent
    if (record.lastSignIn) {
      if (!user.lastSignIn || new Date(record.lastSignIn) > new Date(user.lastSignIn)) {
        user.lastSignIn = record.lastSignIn
      }
    }
  }

  // Convert sets to arrays and calculate counts
  const aggregated = Array.from(userMap.values()).map(user => ({
    ...user,
    accountCount: user.accounts.size,
    accounts: Array.from(user.accounts).sort(),
    roles: Array.from(user.roles).sort()
  }))

  return aggregated
}
