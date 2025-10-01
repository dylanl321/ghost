import { Ref, computed, ref } from 'vue'

export interface Account {
  accountName?: string
  projectName?: string
  name?: string
  accountId?: string
  awsStandardAccountID?: string
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
}

export const useAccountCostsUI = (accounts: Ref<any>) => {
  // Extract accounts data from API response
  const accountsList = computed<Account[]>(() => {
    const data = accounts.value
    if (!data) return [] as Account[]
    if (Array.isArray(data)) return data as Account[]
    if ((data as any).data && Array.isArray((data as any).data)) return (data as any).data as Account[]
    return [] as Account[]
  })

  // State
  const searchTerm = ref('')
  const searchScope = ref<'tab' | 'global'>('tab')
  const selectedAccounts = ref<string[]>([])
  const selectedTimeframe = ref('thisMonth')
  const selectedView = ref('overview')
  const activeTab = ref('all')
  const expandedGroups = ref(new Set<string>())

  // Options
  const timeframeOptions = [
    { label: 'This Month', value: 'thisMonth' },
    { label: 'Last Month', value: 'lastMonth' },
    { label: 'This Quarter', value: 'thisQuarter' },
    { label: 'Last Quarter', value: 'lastQuarter' }
  ]

  const viewOptions = [
    { label: 'Overview', value: 'overview' },
    { label: 'By Department', value: 'department' },
    { label: 'By Service', value: 'service' }
  ]

  const tabs = [
    { id: 'all', label: 'All', icon: 'i-heroicons-squares-2x2' },
    { id: 'lob', label: 'LOB', icon: 'i-heroicons-briefcase' },
    { id: 'dept', label: 'Dept', icon: 'i-heroicons-building-office' },
    { id: 'smart', label: 'Smart', icon: 'i-heroicons-sparkles' }
  ]

  // Helpers
  const getAccountKey = (account: Account): string => {
    return account.accountId || account.awsStandardAccountID || ''
  }

  const getBudget = (account: Account) => {
    const budget = account.estimatedMonthlyCharge || account.budget || account.estimatedBudget || '0'
    return parseFloat(budget.toString().replace(/[^0-9.-]/g, '') || '0')
  }

  const getSpend = (account: Account) => {
    return account.currentSpend || account.totalSpend || account.spend || 0
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toFixed(0)
  }

  const matchesSearchTerm = (account: Account, term: string): boolean => {
    const nameMatch = (account.accountName ?? '').toLowerCase().includes(term)
    const projectMatch = (account.projectName ?? '').toLowerCase().includes(term)
    const idMatch = (account.accountId ?? '').toLowerCase().includes(term)
    const stdIdMatch = (account.awsStandardAccountID ?? '').toLowerCase().includes(term)
    const lobMatch = (account.linesOfBusiness ?? '').toLowerCase().includes(term)
    const deptMatch = (account.departmentNumber ?? '').toLowerCase().includes(term)
    return nameMatch || projectMatch || idMatch || stdIdMatch || lobMatch || deptMatch
  }

  const getTabLabel = (tabId: string): string => {
    const tab = tabs.find(t => t.id === tabId)
    return tab?.label || 'Tab'
  }

  // Search helpers
  const searchPlaceholder = computed(() => {
    const tabLabel = getTabLabel(activeTab.value)
    return searchScope.value === 'global' 
      ? 'Search all accounts and groups...' 
      : `Search ${tabLabel.toLowerCase()}...`
  })

  const searchScopeTooltip = computed(() => {
    return searchScope.value === 'global' 
      ? 'Searching across all tabs and groups' 
      : `Searching only in ${getTabLabel(activeTab.value)} tab`
  })

  const searchResults = computed(() => {
    if (!searchTerm.value) return { total: 0, tabSpecific: 0 }
    const term = searchTerm.value.toLowerCase()
    const allMatches = accountsList.value.filter((acc: Account) => matchesSearchTerm(acc, term))
    let tabSpecificMatches = 0
    // NOTE: Specific tab counts can be calculated in components if needed
    tabSpecificMatches = allMatches.length
    return { total: allMatches.length, tabSpecific: tabSpecificMatches }
  })

  const filteredAccounts = computed<Account[]>(() => {
    if (!searchTerm.value) return accountsList.value
    const term = searchTerm.value.toLowerCase()
    return accountsList.value.filter((acc: Account) => matchesSearchTerm(acc, term))
  })

  const totalBudget = computed<number>(() => {
    const accountsSubset: Account[] = selectedAccounts.value.length > 0 
      ? accountsList.value.filter((acc: Account) => selectedAccounts.value.includes(getAccountKey(acc)))
      : accountsList.value
    return accountsSubset.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0)
  })

  const totalSpend = computed<number>(() => {
    const accountsSubset: Account[] = selectedAccounts.value.length > 0 
      ? accountsList.value.filter((acc: Account) => selectedAccounts.value.includes(getAccountKey(acc)))
      : accountsList.value
    return accountsSubset.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
  })

  const utilization = computed(() => {
    if (totalBudget.value === 0) return 0
    return Math.round((totalSpend.value / totalBudget.value) * 100)
  })

  // Groups
  const lobGroups = computed(() => {
    const groups = new Map<string, { name: string; accounts: Account[]; totalBudget: number; totalSpend: number }>()
    accountsList.value.forEach((account: Account) => {
      const lobName = account.linesOfBusiness || account.lineOfBusiness || 'Unknown LOB'
      if (!groups.has(lobName)) {
        groups.set(lobName, { name: lobName, accounts: [], totalBudget: 0, totalSpend: 0 })
      }
      const group = groups.get(lobName)!
      group.accounts.push(account)
      group.totalBudget += getBudget(account)
      group.totalSpend += getSpend(account)
    })
    return Array.from(groups.values()).sort((a, b) => b.totalBudget - a.totalBudget)
  })

  const departmentGroups = computed(() => {
    const groups = new Map<string, { name: string; accounts: Account[]; totalBudget: number; totalSpend: number }>()
    accountsList.value.forEach((account: Account) => {
      const deptName = account.departmentNumber || account.department || 'Unknown Department'
      if (!groups.has(deptName)) {
        groups.set(deptName, { name: deptName, accounts: [], totalBudget: 0, totalSpend: 0 })
      }
      const group = groups.get(deptName)!
      group.accounts.push(account)
      group.totalBudget += getBudget(account)
      group.totalSpend += getSpend(account)
    })
    return Array.from(groups.values()).sort((a, b) => b.totalBudget - a.totalBudget)
  })

  const smartGroups = computed(() => {
    const groups: Array<{ id: string; name: string; description: string; icon: string; iconColor: string; accounts: Account[]; totalBudget: number; totalSpend: number }> = []
    const highBudgetAccounts = accountsList.value.filter((acc: Account) => getBudget(acc) > 10000)
    if (highBudgetAccounts.length > 0) {
      groups.push({
        id: 'high-budget',
        name: 'High Budget Accounts',
        description: 'Monthly budget > $10K',
        icon: 'i-heroicons-banknotes',
        iconColor: 'text-blue-400',
        accounts: highBudgetAccounts,
        totalBudget: highBudgetAccounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
        totalSpend: highBudgetAccounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
      })
    }
    const overBudgetAccounts = accountsList.value.filter((acc: Account) => {
      const budget = getBudget(acc)
      const spend = getSpend(acc)
      return budget > 0 && spend > budget
    })
    if (overBudgetAccounts.length > 0) {
      groups.push({
        id: 'over-budget',
        name: 'Over Budget',
        description: 'Spending exceeds budget',
        icon: 'i-heroicons-exclamation-triangle',
        iconColor: 'text-red-400',
        accounts: overBudgetAccounts,
        totalBudget: overBudgetAccounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
        totalSpend: overBudgetAccounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
      })
    }
    const underBudgetAccounts = accountsList.value.filter((acc: Account) => {
      const budget = getBudget(acc)
      const spend = getSpend(acc)
      return budget > 0 && spend < (budget * 0.5)
    })
    if (underBudgetAccounts.length > 0) {
      groups.push({
        id: 'under-budget',
        name: 'Severely Under Budget',
        description: 'Less than 50% budget used',
        icon: 'i-heroicons-arrow-trending-down',
        iconColor: 'text-yellow-400',
        accounts: underBudgetAccounts,
        totalBudget: underBudgetAccounts.reduce((sum: number, acc: Account) => sum + getBudget(acc), 0),
        totalSpend: underBudgetAccounts.reduce((sum: number, acc: Account) => sum + getSpend(acc), 0)
      })
    }
    return groups
  })

  // UI color helper
  const getUtilizationColor = (account: Account) => {
    const budget = getBudget(account)
    const spend = getSpend(account)
    if (budget === 0) return 'text-gray-400'
    const utilizationPct = (spend / budget) * 100
    if (utilizationPct > 100) return 'text-red-400'
    if (utilizationPct > 90) return 'text-yellow-400'
    return 'text-green-400'
  }

  // Actions
  const toggleAccount = (accountId: string) => {
    const index = selectedAccounts.value.indexOf(accountId)
    if (index > -1) selectedAccounts.value.splice(index, 1)
    else selectedAccounts.value.push(accountId)
  }

  const selectAll = () => {
    selectedAccounts.value = filteredAccounts.value.map((acc: Account) => getAccountKey(acc))
  }

  const clearSelection = () => { selectedAccounts.value = [] }

  const toggleSearchScope = () => {
    searchScope.value = searchScope.value === 'global' ? 'tab' : 'global'
  }

  const clearSearch = () => {
    searchTerm.value = ''
    searchScope.value = 'tab'
  }

  // Group interaction methods
  const toggleLOB = (lob: { name: string }) => {
    const groupKey = 'lob-' + lob.name
    if (expandedGroups.value.has(groupKey)) expandedGroups.value.delete(groupKey)
    else expandedGroups.value.add(groupKey)
  }

  const toggleDepartment = (dept: { name: string }) => {
    const groupKey = 'dept-' + dept.name
    if (expandedGroups.value.has(groupKey)) expandedGroups.value.delete(groupKey)
    else expandedGroups.value.add(groupKey)
  }

  const toggleSmartGroup = (group: { id: string }) => {
    const groupKey = 'smart-' + group.id
    if (expandedGroups.value.has(groupKey)) expandedGroups.value.delete(groupKey)
    else expandedGroups.value.add(groupKey)
  }

  const selectLOBGroup = (lob: { accounts: Account[] }) => {
    selectedAccounts.value = lob.accounts.map((acc: Account) => getAccountKey(acc))
  }

  const selectDepartmentGroup = (dept: { accounts: Account[] }) => {
    selectedAccounts.value = dept.accounts.map((acc: Account) => getAccountKey(acc))
  }

  const selectSmartGroup = (group: { accounts: Account[] }) => {
    selectedAccounts.value = group.accounts.map((acc: Account) => getAccountKey(acc))
  }

  return {
    // state
    accountsList,
    searchTerm,
    searchScope,
    selectedAccounts,
    selectedTimeframe,
    selectedView,
    activeTab,
    expandedGroups,
    timeframeOptions,
    viewOptions,
    tabs,
    // search
    searchPlaceholder,
    searchScopeTooltip,
    searchResults,
    filteredAccounts,
    // totals
    totalBudget,
    totalSpend,
    utilization,
    // groups
    lobGroups,
    departmentGroups,
    smartGroups,
    // helpers
    getAccountKey,
    getBudget,
    getSpend,
    formatCurrency,
    getTabLabel,
    getUtilizationColor,
    matchesSearchTerm,
    // actions
    toggleAccount,
    selectAll,
    clearSelection,
    toggleSearchScope,
    clearSearch,
    toggleLOB,
    toggleDepartment,
    toggleSmartGroup,
    selectLOBGroup,
    selectDepartmentGroup,
    selectSmartGroup,
  }
}


