/**
 * Composable for sidebar grouping computations (LOB, Department, Smart Groups).
 * Extracted from costs.vue to reduce file size and isolate grouping logic.
 */
import { computed } from 'vue'
import type { Ref, ComputedRef } from 'vue'
import { getMonthlyBudget } from '#shared/utils/budget-utils'

interface Account {
  accountName?: string
  projectName?: string
  name?: string
  accountId?: string
  awsStandardAccountID?: string
  awsCommercialAccountID?: string
  id?: string
  estimatedMonthlyCharge?: string | number
  budget?: string | number
  estimatedBudget?: string | number
  currentSpend?: number
  totalSpend?: number
  spend?: number
  linesOfBusiness?: string
  lineOfBusiness?: string
  departmentNumber?: string
  department?: string
  periodBudget?: number
}

interface GroupData {
  name: string
  accounts: Account[]
  totalBudget: number
  totalSpend: number
}

interface SmartGroupData extends GroupData {
  id: string
  description: string
  icon: string
  iconColor: string
}

function getBudget(account: Account): number {
  // The cost page sets periodBudget for quarter and year-to-date views
  return account.periodBudget ?? getMonthlyBudget(account)
}

function getSpend(account: Account): number {
  return account.currentSpend ?? account.totalSpend ?? account.spend ?? 0
}

function getAccountKey(account: Account): string {
  return account.accountId ?? account.awsStandardAccountID ?? ''
}

function matchesSearchTerm(account: Account, term: string): boolean {
  const nameMatch = (account.accountName ?? '').toLowerCase().includes(term)
  const projectMatch = (account.projectName ?? '').toLowerCase().includes(term)
  const idMatch = (account.accountId ?? '').toLowerCase().includes(term)
  const stdIdMatch = (account.awsStandardAccountID ?? '').toLowerCase().includes(term)
  const lobMatch = ((account as any).linesOfBusiness ?? '').toLowerCase().includes(term)
  const deptMatch = ((account as any).departmentNumber ?? '').toLowerCase().includes(term)
  const requestIdMatch = ((account as any).requestID ?? (account as any).requestId)?.toString().includes(term)
  return nameMatch || projectMatch || idMatch || stdIdMatch || lobMatch || deptMatch || requestIdMatch
}

/** Apply search filtering to a list of groups */
function filterGroups<T extends GroupData>(
  groups: T[],
  searchTerm: string,
  searchScope: string,
  activeTab: string,
  targetTab: string
): T[] {
  if (!searchTerm || (searchScope !== 'global' && activeTab !== targetTab)) return groups

  const term = searchTerm.toLowerCase()
  return groups.filter(group => {
    const groupNameMatches = group.name.toLowerCase().includes(term)
    const descMatches = 'description' in group ? (group as any).description?.toLowerCase().includes(term) : false
    const hasMatchingAccounts = group.accounts.some(acc => matchesSearchTerm(acc, term))
    return groupNameMatches || descMatches || hasMatchingAccounts
  }).map(group => {
    const groupNameMatches = group.name.toLowerCase().includes(term)
    const descMatches = 'description' in group ? (group as any).description?.toLowerCase().includes(term) : false
    if (!groupNameMatches && !descMatches) {
      return { ...group, accounts: group.accounts.filter(acc => matchesSearchTerm(acc, term)) }
    }
    return group
  })
}

export function useSidebarGroups(args: {
  accountsWithCosts: ComputedRef<Account[]>
  favoriteIds: Ref<string[]>
  searchTerm: Ref<string>
  searchScope: Ref<string>
  activeTab: Ref<string>
}) {
  const { accountsWithCosts, favoriteIds, searchTerm, searchScope, activeTab } = args

  const lobGroups = computed<GroupData[]>(() => {
    const groups = new Map<string, GroupData>()
    accountsWithCosts.value.forEach((account: Account) => {
      const lobName = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
      if (!groups.has(lobName)) {
        groups.set(lobName, { name: lobName, accounts: [], totalBudget: 0, totalSpend: 0 })
      }
      const group = groups.get(lobName)!
      group.accounts.push(account)
      group.totalBudget += getBudget(account)
      group.totalSpend += getSpend(account)
    })
    const allGroups = Array.from(groups.values()).sort((a, b) => b.totalBudget - a.totalBudget)
    return filterGroups(allGroups, searchTerm.value, searchScope.value, activeTab.value, 'lob')
  })

  const departmentGroups = computed<GroupData[]>(() => {
    const groups = new Map<string, GroupData>()
    accountsWithCosts.value.forEach((account: Account) => {
      const deptName = account.pepDepartment || account.departmentNumber || account.department || 'Unknown Department'
      if (!groups.has(deptName)) {
        groups.set(deptName, { name: deptName, accounts: [], totalBudget: 0, totalSpend: 0 })
      }
      const group = groups.get(deptName)!
      group.accounts.push(account)
      group.totalBudget += getBudget(account)
      group.totalSpend += getSpend(account)
    })
    const allGroups = Array.from(groups.values()).sort((a, b) => b.totalBudget - a.totalBudget)
    return filterGroups(allGroups, searchTerm.value, searchScope.value, activeTab.value, 'dept')
  })

  const favoriteAccounts = computed(() => {
    if (favoriteIds.value.length === 0) return []
    let favorites = accountsWithCosts.value.filter((account: Account) => {
      return favoriteIds.value.includes(getAccountKey(account))
    })
    if (searchTerm.value && (searchScope.value === 'global' || activeTab.value === 'favorites')) {
      const term = searchTerm.value.toLowerCase()
      favorites = favorites.filter(acc => matchesSearchTerm(acc, term))
    }
    return favorites
  })

  const smartGroups = computed<SmartGroupData[]>(() => {
    const groups: SmartGroupData[] = []

    // Favorites
    if (favoriteAccounts.value.length > 0) {
      groups.push({
        id: 'favorites',
        name: 'My Favorites',
        description: 'Your starred accounts',
        icon: 'i-heroicons-star-solid',
        iconColor: 'text-yellow-500',
        accounts: favoriteAccounts.value,
        totalBudget: favoriteAccounts.value.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
        totalSpend: favoriteAccounts.value.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
      })
    }

    // High Budget (>$10K/month)
    const highBudgetAccounts = accountsWithCosts.value.filter((acc: Account) => getBudget(acc) > 10000)
    if (highBudgetAccounts.length > 0) {
      groups.push({
        id: 'high-budget', name: 'High Budget Accounts', description: 'Monthly budget > $10K',
        icon: 'i-heroicons-banknotes', iconColor: 'text-blue-400', accounts: highBudgetAccounts,
        totalBudget: highBudgetAccounts.reduce((s: number, a: Account) => s + getBudget(a), 0),
        totalSpend: highBudgetAccounts.reduce((s: number, a: Account) => s + getSpend(a), 0)
      })
    }

    // Over Budget
    const overBudgetAccounts = accountsWithCosts.value.filter((acc: Account) => {
      const b = getBudget(acc), s = getSpend(acc)
      return b > 0 && s > b
    })
    if (overBudgetAccounts.length > 0) {
      groups.push({
        id: 'over-budget', name: 'Over Budget', description: 'Spending exceeds budget',
        icon: 'i-heroicons-exclamation-triangle', iconColor: 'text-red-400', accounts: overBudgetAccounts,
        totalBudget: overBudgetAccounts.reduce((s: number, a: Account) => s + getBudget(a), 0),
        totalSpend: overBudgetAccounts.reduce((s: number, a: Account) => s + getSpend(a), 0)
      })
    }

    // Under Budget Severely (< 50% utilization)
    const underBudgetAccounts = accountsWithCosts.value.filter((acc: Account) => {
      const b = getBudget(acc), s = getSpend(acc)
      return b > 0 && s < (b * 0.5)
    })
    if (underBudgetAccounts.length > 0) {
      groups.push({
        id: 'under-budget', name: 'Severely Under Budget', description: 'Less than 50% budget used',
        icon: 'i-heroicons-arrow-trending-down', iconColor: 'text-yellow-400', accounts: underBudgetAccounts,
        totalBudget: underBudgetAccounts.reduce((s: number, a: Account) => s + getBudget(a), 0),
        totalSpend: underBudgetAccounts.reduce((s: number, a: Account) => s + getSpend(a), 0)
      })
    }

    // Keyword-based groups (e.g. "SDA Accounts")
    const keywordGroups = new Map<string, Account[]>()
    const nameGroups = new Map<string, Account[]>()

    accountsWithCosts.value.forEach((account: Account) => {
      const name = account.projectName || account.accountName || ''
      if (name && name.length > 2) {
        const keywords = name.match(/^([A-Z]{2,4})|([A-Z]{2,4}[-_\s])|(\b[A-Z]{2,4}\b)/g)
        if (keywords) {
          keywords.forEach((kw: string) => {
            const clean = kw.replace(/[-_\s]/g, '').toUpperCase()
            if (clean.length >= 2) {
              if (!keywordGroups.has(clean)) keywordGroups.set(clean, [])
              keywordGroups.get(clean)!.push(account)
            }
          })
        }

        const baseName = name
          .replace(/[-_]\d+$/g, '').replace(/\s*\d+$/g, '')
          .replace(/(dev|test|prod|staging|demo)$/i, '')
          .replace(/[-_]+(dev|test|prod|staging|demo)$/i, '')
          .replace(/\s*[-_]+\s*$/g, '').trim()

        if (baseName.length > 2) {
          if (!nameGroups.has(baseName)) nameGroups.set(baseName, [])
          nameGroups.get(baseName)!.push(account)
        }
      }
    })

    keywordGroups.forEach((accts: Account[], keyword: string) => {
      if (accts.length >= 2) {
        groups.push({
          id: `keyword-${keyword.toLowerCase()}`, name: `${keyword} Accounts`,
          description: `${accts.length} accounts containing "${keyword}"`,
          icon: 'i-heroicons-tag', iconColor: 'text-purple-400', accounts: accts,
          totalBudget: accts.reduce((s: number, a: Account) => s + getBudget(a), 0),
          totalSpend: accts.reduce((s: number, a: Account) => s + getSpend(a), 0)
        })
      }
    })

    nameGroups.forEach((accts: Account[], baseName: string) => {
      const hasKeywordGroup = Array.from(keywordGroups.keys()).some((kw: string) =>
        baseName.toUpperCase().includes(kw) && (keywordGroups.get(kw)!.length >= 2)
      )
      if (accts.length >= 2 && !hasKeywordGroup) {
        groups.push({
          id: `similar-${baseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: `Similar: ${baseName}`,
          description: `${accts.length} accounts with similar base names`,
          icon: 'i-heroicons-document-duplicate', iconColor: 'text-indigo-400', accounts: accts,
          totalBudget: accts.reduce((s: number, a: Account) => s + getBudget(a), 0),
          totalSpend: accts.reduce((s: number, a: Account) => s + getSpend(a), 0)
        })
      }
    })

    return filterGroups(groups, searchTerm.value, searchScope.value, activeTab.value, 'smart')
  })

  return {
    lobGroups,
    departmentGroups,
    smartGroups,
    favoriteAccounts,
    // Re-export helpers that the template still needs
    matchesSearchTerm,
    getAccountKey,
    getBudget,
    getSpend
  }
}
