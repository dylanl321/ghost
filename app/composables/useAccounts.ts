import type { AccountInfo, AccountLookupCriteria } from '../../server/types/aws'

/**
 * Composable for managing AWS account data
 */
export const useAccounts = () => {
  const accounts = ref<AccountInfo[]>([])
  const selectedAccount = ref<AccountInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Fetch all accounts from the API
   */
  const fetchAccounts = async () => {
    try {
      loading.value = true
      error.value = null
      
      // This would use your actual API endpoint
      const { data } = await $fetch<{ data: AccountInfo[] }>('/api/organization/accounts')
      
      accounts.value = data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch accounts'
      console.error('Error fetching accounts:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Search accounts by criteria
   */
  const searchAccounts = async (criteria: AccountLookupCriteria) => {
    try {
      loading.value = true
      error.value = null
      
      const queryParams = new URLSearchParams()
      Object.entries(criteria).forEach(([key, value]) => {
        if (value) queryParams.set(key, value)
      })
      
      const { data } = await $fetch<{ data: AccountInfo[] }>(
        `/api/organization/accounts/search?${queryParams}`
      )
      
      accounts.value = data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to search accounts'
      console.error('Error searching accounts:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Get a specific account by ID
   */
  const getAccount = async (accountId: string) => {
    try {
      loading.value = true
      error.value = null
      
      const data = await $fetch<AccountInfo>(`/api/organization/accounts/${accountId}`)
      
      selectedAccount.value = data
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch account'
      console.error('Error fetching account:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Update account information
   */
  const updateAccount = async (accountId: string, updates: Partial<AccountInfo>) => {
    try {
      loading.value = true
      error.value = null
      
      const data = await $fetch<AccountInfo>(`/api/organization/accounts/${accountId}`, {
        method: 'PUT',
        body: updates
      })
      
      // Update local data
      const index = accounts.value.findIndex(acc => acc.accountId === accountId)
      if (index !== -1) {
        accounts.value[index] = data
      }
      
      if (selectedAccount.value?.accountId === accountId) {
        selectedAccount.value = data
      }
      
      return data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update account'
      console.error('Error updating account:', err)
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * Sync account data from AWS
   */
  const syncAccountData = async (accountId?: string) => {
    try {
      loading.value = true
      error.value = null
      
      const endpoint = accountId 
        ? `/api/organization/accounts/${accountId}/sync`
        : '/api/organization/accounts/sync'
      
      const { data } = await $fetch<{ data: AccountInfo[] }>(endpoint, {
        method: 'POST'
      })
      
      accounts.value = data
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to sync account data'
      console.error('Error syncing accounts:', err)
    } finally {
      loading.value = false
    }
  }

  /**
   * Filter accounts by various criteria
   */
  const filterAccounts = (filters: {
    status?: string
    environment?: string
    hasGovCloud?: boolean
    projectCode?: string
  }) => {
    return computed(() => {
      return accounts.value.filter(account => {
        if (filters.status && account.accountStatus !== filters.status) return false
        if (filters.environment && account.environment !== filters.environment) return false
        if (filters.hasGovCloud !== undefined && account.hasGovCloud !== filters.hasGovCloud) return false
        if (filters.projectCode && account.projectCode !== filters.projectCode) return false
        return true
      })
    })
  }

  /**
   * Group accounts by organizational unit
   */
  const accountsByOU = computed(() => {
    const grouped: Record<string, AccountInfo[]> = {}
    
    accounts.value.forEach(account => {
      const ou = account.organizationalUnit || 'Unorganized'
      if (!grouped[ou]) grouped[ou] = []
      grouped[ou].push(account)
    })
    
    return grouped
  })

  /**
   * Get account statistics
   */
  const accountStats = computed(() => {
    const total = accounts.value.length
    const active = accounts.value.filter(acc => acc.accountStatus === 'ACTIVE').length
    const govCloudPaired = accounts.value.filter(acc => acc.hasGovCloud).length
    const environments = [...new Set(accounts.value.map(acc => acc.environment).filter(Boolean))]
    
    return {
      total,
      active,
      govCloudPaired,
      environments,
      suspended: accounts.value.filter(acc => acc.accountStatus === 'SUSPENDED').length,
      closed: accounts.value.filter(acc => acc.accountStatus === 'CLOSED').length
    }
  })

  // Auto-fetch on composable initialization
  onMounted(() => {
    if (accounts.value.length === 0) {
      fetchAccounts()
    }
  })

  return {
    // State
    accounts: readonly(accounts),
    selectedAccount: readonly(selectedAccount),
    loading: readonly(loading),
    error: readonly(error),

    // Actions
    fetchAccounts,
    searchAccounts,
    getAccount,
    updateAccount,
    syncAccountData,

    // Computed
    filterAccounts,
    accountsByOU,
    accountStats
  }
}