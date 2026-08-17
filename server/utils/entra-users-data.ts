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
    const { data: groupsByAccount, truncated: groupsTruncated } = await getAWSGroups(event, {
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
            ? { maxPages: 2, signal: options.signal }
            : { signal: options.signal })

          if (membersResponse.truncated) hasMore = true

          for (const member of membersResponse.members || []) {
            const graphMember = member as any
            // Only include users (not groups or service principals)
            if (graphMember['@odata.type'] !== '#microsoft.graph.user') {
              continue
            }

            const record: EntraUserRecord = {
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
            }
            if (!matchesEntraFilters(record, filters)) continue
            userRecords.push(record)
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

    const filteredRecords = userRecords
    if (groupsTruncated) hasMore = true

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
    throw new Error(`Failed to fetch Entra user data: ${error.message}`, { cause: error })
  }
}

function matchesEntraFilters(record: EntraUserRecord, filters: EntraUsersDatasetFilters): boolean {
  if (filters.userSearch) {
    const search = filters.userSearch.toLowerCase()
    if (![record.displayName, record.email, record.userPrincipalName].some(value => value.toLowerCase().includes(search))) return false
  }
  if (filters.departments?.length && (!record.department || !filters.departments.includes(record.department))) return false
  const activityStatus = filters.activityStatus || (filters.activeOnly ? 'active' : 'all')
  if (activityStatus !== 'all') {
    const cutoff = Date.now() - (filters.lookbackDays || 30) * 86_400_000
    const lastSignIn = record.lastSignIn ? Date.parse(record.lastSignIn) : Number.NaN
    if (activityStatus === 'active' && (!Number.isFinite(lastSignIn) || lastSignIn < cutoff)) return false
    if (activityStatus === 'inactive' && Number.isFinite(lastSignIn) && lastSignIn >= cutoff) return false
  }
  return true
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
