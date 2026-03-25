/**
 * Composable for fetching and managing account and cost data
 */

import { ref, computed } from 'vue'
import type { AWSEnclaveData } from '~~/shared/types/accounts'
import type { CostsSummaryResponse } from '~/types/costs'

const logger = createLogger('AccountCosts')

export const useAccountCosts = () => {

  // State
  const accounts = ref<AWSEnclaveData[] | null>(null)
  const costs = ref<CostsSummaryResponse | null>(null)
  const accountDetails = ref<Map<string, AWSEnclaveData>>(new Map())
  const linesOfBusiness = ref<any[]>([])
  const departments = ref<any[]>([])
  const isLoadingAccounts = ref(false)
  const isLoadingCosts = ref(false)
  const isLoadingDetails = ref(false)
  const accountsError = ref<string | null>(null)
  const costsError = ref<string | null>(null)
  const warnings = ref<string[]>([])

  // Computed
  const isLoading = computed(() => isLoadingAccounts.value || isLoadingCosts.value)
  const error = computed(() => accountsError.value || costsError.value)

  /**
   * Fetch accounts from the API
   */
  const fetchAccounts = async (options: {
    includeDecommissioned?: boolean
    enrichment?: 'simple' | 'basic' | 'full'
  } = {}) => {
    isLoadingAccounts.value = true
    accountsError.value = null
    
    try {
      const data = await $fetch('/api/accounts/list', {
        query: {
          source: 'full',
          enrichment: options.enrichment || 'full',
          includeDecommissioned: options.includeDecommissioned || false,
          includeLZAccounts: true
        }
      })
      
      accounts.value = data
      return data
    } catch (err: any) {
      accountsError.value = err.message || 'Failed to fetch accounts'
      logger.error('Error fetching accounts:', err)
      throw err
    } finally {
      isLoadingAccounts.value = false
    }
  }

  /**
   * Fetch cost summary from the API
   */
  const fetchCostSummary = async (options: {
    period?: string
    startDate?: string
    endDate?: string
    granularity?: 'DAILY' | 'MONTHLY'
    groupBy?: 'SERVICE' | 'LINKED_ACCOUNT' | 'REGION'
    enhanced?: boolean
    proforma?: boolean
    proformaAccountId?: string
    masterAccountId?: string
  } = {}) => {
    isLoadingCosts.value = true
    costsError.value = null
    
    try {
      // Default to current month if no dates provided
      const params: any = {
        environment: 'commercial',
        granularity: options.granularity || 'MONTHLY',
        groupBy: options.groupBy || 'LINKED_ACCOUNT',
        enhanced: options.enhanced !== false,
        proforma: options.proforma || false
      }

      // Add proforma parameters if requested
      if (options.proforma) {
        params.proformaAccountId = options.proformaAccountId || '253821132832'
        params.masterAccountId = options.masterAccountId || '205950196477'
      }

      // Use period or explicit dates
      if (options.period) {
        params.period = options.period
      } else if (options.startDate && options.endDate) {
        params.startDate = options.startDate
        params.endDate = options.endDate
      } else {
        // Default to current month
        params.period = 'thisMonth'
      }

      let data
      try {
        data = await $fetch('/api/costs/summary', {
          query: params
        })
      } catch (enhancedError: any) {
        // If enhanced=true fails (likely due to AWS auth issues), try with enhanced=false
        if (params.enhanced === true && (enhancedError.statusCode >= 400 || enhancedError.status >= 400 || enhancedError.message?.includes('expired') || enhancedError.message?.includes('500'))) {
          logger.warn('Enhanced cost data failed, falling back to basic cost data:', enhancedError.message)
          const fallbackParams = { ...params, enhanced: false }
          data = await $fetch('/api/costs/summary', {
            query: fallbackParams
          })
        } else {
          throw enhancedError
        }
      }
      
      costs.value = data
      return data
    } catch (err: any) {
      costsError.value = err.message || 'Failed to fetch costs'
      logger.error('Error fetching costs:', err)
      throw err
    } finally {
      isLoadingCosts.value = false
    }
  }

  /**
   * Transform cost data into a map for easy lookup by account ID
   * Supports both standard and proforma data structures
   */
  const getCostsByAccountId = (costData: any, useProforma: boolean = false) => {
    // Handle proforma data structure
    if (useProforma && costData?.proforma?.accounts) {
      const costMap: Record<string, { cost: number; usage: number }> = {}
      
      costData.proforma.accounts.forEach((account: any) => {
        costMap[account.accountId] = {
          cost: account.totalCost || 0,
          usage: account.totalUsage || 0
        }
      })
      
      return costMap
    }
    
    // Handle billable data in proforma structure (when not using proforma)
    if (!useProforma && costData?.billable?.accounts) {
      const costMap: Record<string, { cost: number; usage: number }> = {}
      
      costData.billable.accounts.forEach((account: any) => {
        costMap[account.accountId] = {
          cost: account.totalCost || 0,
          usage: account.totalUsage || 0
        }
      })
      
      return costMap
    }
    
    // Handle standard data structure
    if (!costData?.accounts) return {}
    
    const costMap: Record<string, { cost: number; usage: number }> = {}
    
    costData.accounts.forEach((account: any) => {
      costMap[account.accountId] = {
        cost: account.totalCost || 0,
        usage: account.totalUsage || 0
      }
    })
    
    return costMap
  }

  /**
   * Merge accounts with their cost data
   */
  const mergeAccountsWithCosts = (accountList: any[], costData: any, useProforma: boolean = false) => {
    const costMap = getCostsByAccountId(costData, useProforma)
    
    return accountList.map(account => {
      const accountId = account.accountId || account.awsStandardAccountID || account.id
      const accountCosts = costMap[accountId] || { cost: 0, usage: 0 }
      
      return {
        ...account,
        currentSpend: accountCosts.cost,
        currentUsage: accountCosts.usage,
        budget: parseFloat(account.estimatedMonthlyCharge || account.estimatedMonthlyBudget) || 0
      }
    })
  }

  /**
   * Fetch lines of business data
   */
  const fetchLinesOfBusiness = async (includeDecommissioned: boolean = false) => {
    try {
      const data = await $fetch('/api/accounts/lines-of-business', {
        query: {
          includeDecommissioned
        }
      })
      linesOfBusiness.value = data?.data || data || []
      return data?.data || data || []
    } catch (err: any) {
      logger.error('Error fetching lines of business:', err)
      warnings.value.push('Lines of business data unavailable')
      return []
    }
  }

  /**
   * Fetch departments data
   */
  const fetchDepartments = async (includeDecommissioned: boolean = false) => {
    try {
      const data = await $fetch('/api/accounts/departments', {
        query: {
          includeDecommissioned
        }
      })
      departments.value = data?.data || data || []
      return data?.data || data || []
    } catch (err: any) {
      logger.error('Error fetching departments:', err)
      warnings.value.push('Department data unavailable')
      return []
    }
  }

  /**
   * Transform accounts to D3 tree format
   */
  const transformToD3Tree = (accountList: any[], costData: any, useProforma: boolean = false) => {
    if (!accountList?.length) return null
    
    // Merge accounts with costs
    const mergedAccounts = mergeAccountsWithCosts(accountList, costData, useProforma)
    
    // Filter active accounts
    const activeAccounts = mergedAccounts.filter((account: any) => {
      const status = (account.enclaveStatus || account.status || '').toLowerCase()
      return !['decommissioned', 'canceled', 'cancelled', 'suspended'].includes(status)
    })
    
    // Find master account (starts with 205)
    const masterAccount = activeAccounts.find((acc: any) => 
      acc.accountId?.startsWith('205') || 
      acc.awsStandardAccountID?.startsWith('205') ||
      acc.id?.startsWith('205')
    )
    
    if (!masterAccount) {
      logger.warn('No master account found')
      return null
    }
    
    // Create a map of LOB short codes to full names
    const lobFullNameMap: Record<string, string> = {}
    if (Array.isArray(linesOfBusiness.value)) {
      linesOfBusiness.value.forEach(lob => {
        if (lob.linesOfBusiness) {
          lobFullNameMap[lob.linesOfBusiness] = lob.linesOfBusinessFullName || lob.linesOfBusiness
        }
      })
    }
    
    // Group by LOB
    const accountsByLob = activeAccounts.reduce((acc: Record<string, any[]>, account: any) => {
      const accountId = account.accountId || account.awsStandardAccountID || account.id
      if (accountId === (masterAccount.accountId || masterAccount.awsStandardAccountID || masterAccount.id)) return acc
      
      const lob = account.linesOfBusiness || 'Unassigned'
      if (!acc[lob]) acc[lob] = []
      acc[lob].push(account)
      return acc
    }, {} as Record<string, any[]>)
    
    // Create tree structure
    const rootNode = {
      name: masterAccount.projectName || masterAccount.accountName || masterAccount.name || 'Master Account',
      id: masterAccount.accountId || masterAccount.awsStandardAccountID || masterAccount.id,
      type: 'master',
      budget: 0,
      spend: 0,
      children: Object.entries(accountsByLob).map(([lob, accounts]: [string, any[]]) => {
        // Use full LOB name if available, otherwise fall back to short code
        const lobFullName = lobFullNameMap[lob] || lob
        return {
          name: lobFullName === 'Unassigned' ? 'Unassigned' : `${lobFullName}`,
          shortName: lob,
          id: `lob-${lob}`,
          type: 'lob',
          budget: accounts.reduce((sum: number, acc: any) => sum + (acc.budget || 0), 0),
          spend: accounts.reduce((sum: number, acc: any) => sum + (acc.currentSpend || 0), 0),
          children: Object.entries(
          accounts.reduce((acc: Record<string, any[]>, account: any) => {
            const dept = account.departmentNumber || 'Unassigned'
            if (!acc[dept]) acc[dept] = []
            acc[dept].push(account)
            return acc
          }, {} as Record<string, any[]>)
        ).map(([dept, deptAccounts]: [string, any[]]) => ({
          name: `Department: ${dept}`,
          id: `dept-${lob}-${dept}`,
          type: 'department',
          budget: deptAccounts.reduce((sum: number, acc: any) => sum + (acc.budget || 0), 0),
          spend: deptAccounts.reduce((sum: number, acc: any) => sum + (acc.currentSpend || 0), 0),
          children: deptAccounts.map((account: any) => ({
            name: account.projectName || account.accountName || account.name || account.accountAlias || account.id,
            id: account.accountId || account.awsStandardAccountID || account.id,
            type: 'account',
            budget: account.budget || 0,
            spend: account.currentSpend || 0,
            usage: account.currentUsage || 0
          }))
        }))
        }
      })
    }
    
    // Calculate root totals
    rootNode.budget = rootNode.children.reduce((sum: number, lob: any) => sum + lob.budget, 0)
    rootNode.spend = rootNode.children.reduce((sum: number, lob: any) => sum + lob.spend, 0)
    
    return rootNode
  }

  /**
   * Fetch detailed account information
   */
  const fetchAccountDetails = async (accountId: string) => {
    isLoadingDetails.value = true
    
    try {
      // Check cache first
      if (accountDetails.value.has(accountId)) {
        return accountDetails.value.get(accountId)
      }
      
      const data = await $fetch(`/api/accounts/${accountId}`)
      const accountData = data?.account || data
      
      // Cache the result
      accountDetails.value.set(accountId, accountData)
      
      return accountData
    } catch (err: any) {
      logger.error(`Error fetching account details for ${accountId}:`, err)
      return null
    } finally {
      isLoadingDetails.value = false
    }
  }

  /**
   * Fetch cost analysis for an account
   */
  const fetchAccountCostAnalysis = async (accountId: string, options: {
    period?: string
    proforma?: boolean
  } = {}) => {
    try {
      const params: any = {
        environment: 'commercial',
        accountIds: accountId,
        period: options.period || 'thisMonth',
        proforma: options.proforma || false,
        includeAnomalies: true,
        includeBudget: true
      }
      
      const data = await $fetch('/api/costs/analysis', {
        query: params
      })
      return data
    } catch (err: any) {
      logger.error(`Error fetching cost analysis for ${accountId}:`, err)
      return null
    }
  }

  return {
    // State
    accounts,
    costs,
    accountDetails,
    linesOfBusiness,
    departments,
    isLoading,
    isLoadingAccounts,
    isLoadingCosts,
    isLoadingDetails,
    error,
    accountsError,
    costsError,
    warnings,
    
    // Methods
    fetchAccounts,
    fetchCostSummary,
    fetchAccountDetails,
    fetchAccountCostAnalysis,
    fetchLinesOfBusiness,
    fetchDepartments,
    getCostsByAccountId,
    mergeAccountsWithCosts,
    transformToD3Tree
  }
}