const logger = createLogger('AccountInfo')

/**
 * Shared composable for fetching and enriching account info.
 * Used by the groups and users sub-pages to avoid duplicated logic.
 */
export interface AccountInfo {
  id: string
  name: string
  isGovCloud: boolean
  standardAccountId: string
  govCloudAccountId?: string
  status: string
}

export interface EnhancedAccountInfo extends AccountInfo {
  displayName: string
  accountTypeLabel: string
  hasMultipleAccountIds: boolean
}

export function useAccountInfo(accountId: Ref<string> | ComputedRef<string>) {
  const awsAccountsStore = useAwsAccountsStore()

  const accountInfo = ref<AccountInfo | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  const enhancedAccountInfo = computed<EnhancedAccountInfo | null>(() => {
    if (!accountInfo.value) return null

    return {
      ...accountInfo.value,
      displayName: accountInfo.value.name,
      accountTypeLabel: accountInfo.value.isGovCloud ? 'GovCloud' : 'Commercial',
      hasMultipleAccountIds: !!(
        accountInfo.value.standardAccountId &&
        accountInfo.value.govCloudAccountId &&
        accountInfo.value.standardAccountId !== accountInfo.value.govCloudAccountId
      ),
    }
  })

  function buildAccountInfo(id: string, source: { accountName?: string; isGovCloud?: boolean; standardAccountId?: string; govCloudAccountId?: string; accountStatus?: string }): AccountInfo {
    return {
      id,
      name: source.accountName || `Account ${id}`,
      isGovCloud: source.isGovCloud || false,
      standardAccountId: source.standardAccountId || id,
      govCloudAccountId: source.govCloudAccountId,
      status: source.accountStatus || 'Unknown',
    }
  }

  async function fetchAccountInfo() {
    const id = unref(accountId)
    if (!id) return

    loading.value = true
    error.value = null

    try {
      // Try the store first
      const storeAccount = awsAccountsStore.accounts[id]
      if (storeAccount) {
        accountInfo.value = buildAccountInfo(id, storeAccount)
        return
      }

      // Try system accounts
      await awsAccountsStore.initializeAllAccounts()
      const systemAccount = awsAccountsStore.findAccountById(id)
      if (systemAccount) {
        accountInfo.value = buildAccountInfo(id, systemAccount)
        return
      }

      // Fallback to API
      const response = await fetch(`/api/accounts/${encodeURIComponent(id)}?includeDecommissioned=true`)
      if (!response.ok) {
        throw new Error(`Failed to fetch account info: ${response.statusText}`)
      }

      const account = (await response.json()).data?.account || {}
      accountInfo.value = {
        id,
        name: account.name || account.accountName || `Account ${id}`,
        isGovCloud: account.govCloudAccountId === id,
        standardAccountId: account.accountId || id,
        govCloudAccountId: account.govCloudAccountId,
        status: account.status || account.accountStatus || 'Unknown',
      }
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch account information'
      logger.error('Error fetching account info:', err)

      // Fallback account info so the page still renders
      accountInfo.value = {
        id: unref(accountId),
        name: `Account ${unref(accountId)}`,
        isGovCloud: false,
        standardAccountId: unref(accountId),
        govCloudAccountId: undefined,
        status: 'Unknown',
      }
    } finally {
      loading.value = false
    }
  }

  async function initialize() {
    await awsAccountsStore.initialize()
    await fetchAccountInfo()
  }

  return {
    accountInfo: readonly(accountInfo),
    enhancedAccountInfo,
    loading: readonly(loading),
    error: readonly(error),
    fetchAccountInfo,
    initialize,
  }
}
