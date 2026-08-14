import type { UserPreferences } from '../../shared/types/user-preferences'

export interface PersonalContextAccountSource {
  accountId?: string
  awsStandardAccountID?: string
  awsGovCloudAccountID?: string
  govCloudAccountId?: string
  name?: string
  accountName?: string
  projectName?: string
  accountAlias?: string
  enclaveStatus?: string
  status?: string
  linesOfBusiness?: string
  departmentNumber?: string
}

export interface McpPersonalAccountContextEntry {
  savedAccountId: string
  accountId: string
  displayName: string
  commercialAccountId?: string
  govCloudAccountId?: string
  status?: string
  linesOfBusiness?: string
  departmentNumber?: string
  viewedAt?: string
  resolved: boolean
}

interface ContextCollection {
  total: number
  truncated: boolean
  accounts: McpPersonalAccountContextEntry[]
  unresolvedAccountIds: string[]
}

export interface McpPersonalAccountContext {
  favorites: ContextCollection
  recentAccounts: ContextCollection
}

interface RecentAccountPreference {
  accountId?: unknown
  viewedAt?: unknown
}

function savedIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    if (typeof item !== 'string') continue
    const id = item.trim()
    if (id) unique.add(id)
  }
  return [...unique]
}

function savedRecentAccounts(value: unknown): Array<{ accountId: string; viewedAt?: string }> {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  const accounts: Array<{ accountId: string; viewedAt?: string }> = []
  for (const item of value as RecentAccountPreference[]) {
    const accountId = typeof item?.accountId === 'string' ? item.accountId.trim() : ''
    if (!accountId || unique.has(accountId)) continue
    unique.add(accountId)
    accounts.push({
      accountId,
      viewedAt: typeof item.viewedAt === 'string' ? item.viewedAt : undefined
    })
  }
  return accounts
}

function accountIndex(accounts: PersonalContextAccountSource[]): Map<string, PersonalContextAccountSource> {
  const index = new Map<string, PersonalContextAccountSource>()
  for (const account of accounts) {
    for (const id of [account.accountId, account.awsStandardAccountID, account.awsGovCloudAccountID, account.govCloudAccountId]) {
      if (id) index.set(id, account)
    }
  }
  return index
}

function contextEntry(savedAccountId: string, account: PersonalContextAccountSource | undefined, viewedAt?: string): McpPersonalAccountContextEntry {
  if (!account) {
    return {
      savedAccountId,
      accountId: savedAccountId,
      displayName: savedAccountId,
      viewedAt,
      resolved: false
    }
  }

  return {
    savedAccountId,
    accountId: account.accountId || account.awsStandardAccountID || savedAccountId,
    displayName: account.name || account.projectName || account.accountName || account.accountAlias || savedAccountId,
    commercialAccountId: account.accountId || account.awsStandardAccountID,
    govCloudAccountId: account.govCloudAccountId || account.awsGovCloudAccountID,
    status: account.enclaveStatus || account.status,
    linesOfBusiness: account.linesOfBusiness,
    departmentNumber: account.departmentNumber,
    viewedAt,
    resolved: true
  }
}

function collect(
  entries: Array<{ accountId: string; viewedAt?: string }>,
  index: Map<string, PersonalContextAccountSource>,
  limit: number
): ContextCollection {
  const accounts = entries.map(entry => contextEntry(entry.accountId, index.get(entry.accountId), entry.viewedAt))
  return {
    total: accounts.length,
    truncated: accounts.length > limit,
    accounts: accounts.slice(0, limit),
    unresolvedAccountIds: accounts.filter(account => !account.resolved).map(account => account.savedAccountId)
  }
}

export function buildPersonalAccountContext(
  preferences: Pick<UserPreferences, 'preferences'> | undefined,
  accounts: PersonalContextAccountSource[],
  limit: number
): McpPersonalAccountContext {
  const index = accountIndex(accounts)
  const favorites = savedIds(preferences?.preferences?.favoriteAccounts)
    .map(accountId => ({ accountId }))
  const recentAccounts = savedRecentAccounts(preferences?.preferences?.recentlyViewedAccounts)

  return {
    favorites: collect(favorites, index, limit),
    recentAccounts: collect(recentAccounts, index, limit)
  }
}
