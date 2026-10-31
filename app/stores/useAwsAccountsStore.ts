import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const logger = createLogger('AwsAccountsStore')

export interface AwsAccount {
  accountId: string
  accountName: string
  awsStandardAccountID?: string
  awsCommercialAccountID?: string
  awsGovCloudAccountID?: string
  isGovCloud: boolean
  isActive: boolean
  environment?: 'production' | 'development' | 'staging' | 'test'
  organizationalUnit?: string
  linesOfBusiness?: string
  departmentNumber?: string
  tags?: Record<string, string>
}

export const useAwsAccountsStore = defineStore('awsAccounts', () => {
  // State
  const accounts = ref<Record<string, AwsAccount>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const lastFetched = ref<Date | null>(null)

  // Getters
  const accountsList = computed((): AwsAccount[] => {
    return Object.values(accounts.value)
  })

  const activeAccounts = computed((): AwsAccount[] => {
    return Object.values(accounts.value).filter(acc => acc.isActive)
  })

  const govCloudAccounts = computed((): AwsAccount[] => {
    return Object.values(accounts.value).filter(acc => acc.isGovCloud)
  })

  const commercialAccounts = computed((): AwsAccount[] => {
    return Object.values(accounts.value).filter(acc => !acc.isGovCloud)
  })

  const getAccountById = computed(() => (id: string): AwsAccount | undefined => {
    // Direct lookup
    if (accounts.value[id]) {
      return accounts.value[id]
    }
    
    // Search by alternative ID formats
    return Object.values(accounts.value).find(acc => 
      acc.accountId === id ||
      acc.awsStandardAccountID === id ||
      acc.awsCommercialAccountID === id ||
      acc.awsGovCloudAccountID === id
    )
  })

  const allAccountsInitialized = computed((): boolean => {
    return Object.keys(accounts.value).length > 0
  })

  // Actions
  const fetchAccounts = async (force = false) => {
    // Skip if recently fetched (within 5 minutes) unless forced
    if (!force && lastFetched.value) {
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
      if (lastFetched.value > fiveMinutesAgo) {
        return
      }
    }

    loading.value = true
    error.value = null

    try {
      // Fetch from the accounts API
      const response = await $fetch('/api/accounts/list', {
        method: 'GET'
      })

      // Process and store accounts
      const accountsMap: Record<string, AwsAccount> = {}
      
      // Handle different response structures
      const data = (response as any)?.data || response
      
      if (Array.isArray(data)) {
        data.forEach((account: any) => {
          const accountId = account.accountId || account.awsStandardAccountID || account.id
          
          if (accountId) {
            accountsMap[accountId] = {
              accountId,
              accountName: account.accountName || account.projectName || `Account ${accountId}`,
              awsStandardAccountID: account.awsStandardAccountID,
              awsCommercialAccountID: account.awsCommercialAccountID,
              awsGovCloudAccountID: account.awsGovCloudAccountID,
              isGovCloud: account.isGovCloud || false,
              isActive: account.isActive !== false, // Default to true if not specified
              environment: account.environment,
              organizationalUnit: account.organizationalUnit,
              linesOfBusiness: account.linesOfBusiness || account.lineOfBusiness,
              departmentNumber: account.pepDepartment || account.departmentNumber || account.department,
              tags: account.tags
            }
          }
        })
      }

      accounts.value = accountsMap
      lastFetched.value = new Date()
    } catch (err: any) {
      error.value = err?.message || 'Failed to fetch AWS accounts'
      logger.error('Error fetching AWS accounts:', err)
    } finally {
      loading.value = false
    }
  }

  const initialize = async (force = false) => {
    return fetchAccounts(force)
  }

  const initializeAllAccounts = async (force = false) => {
    return fetchAccounts(force)
  }

  const findAccountById = (id: string): AwsAccount | undefined => {
    return getAccountById.value(id)
  }

  const setAccount = (account: AwsAccount) => {
    accounts.value[account.accountId] = account
  }

  const removeAccount = (accountId: string) => {
    const { [accountId]: _removed, ...rest } = accounts.value
    accounts.value = rest
  }

  const clearAccounts = () => {
    accounts.value = {}
    lastFetched.value = null
  }

  const searchAccounts = (query: string): AwsAccount[] => {
    const searchTerm = query.toLowerCase()
    
    return Object.values(accounts.value).filter(account => 
      account.accountId.toLowerCase().includes(searchTerm) ||
      account.accountName.toLowerCase().includes(searchTerm) ||
      (account.awsStandardAccountID?.toLowerCase().includes(searchTerm)) ||
      (account.linesOfBusiness?.toLowerCase().includes(searchTerm)) ||
      (account.departmentNumber?.toLowerCase().includes(searchTerm))
    )
  }

  return {
    // State
    accounts,
    loading,
    error,
    lastFetched,
    
    // Getters
    accountsList,
    activeAccounts,
    govCloudAccounts,
    commercialAccounts,
    getAccountById,
    allAccountsInitialized,
    
    // Actions
    fetchAccounts,
    initialize,
    initializeAllAccounts,
    findAccountById,
    setAccount,
    removeAccount,
    clearAccounts,
    searchAccounts
  }
}, {
  persist: true
})