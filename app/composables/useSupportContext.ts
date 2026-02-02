/**
 * Global context composable for Support Tools page
 * Manages account selection, environment, and preloaded resources (instances, log groups)
 */

import { reactive, computed, readonly } from 'vue'
import { useEnclaveStore } from '~/stores/useEnclaveStore'

export interface SupportInstance {
  resourceId: string
  instanceName?: string
  instanceType?: string
  instanceState?: string
  privateIpAddress?: string
  publicIpAddress?: string
  region?: string
}

export interface SupportLogGroup {
  name: string
  storedBytes?: number
  retentionDays?: number
  createdAt?: number
}

export interface SupportContextState {
  // Mode
  mode: 'global' | 'account'

  // Account context
  accountId: string
  accountName: string
  environment: 'commercial' | 'govcloud'

  // Preloaded resources
  instances: SupportInstance[]
  logGroups: SupportLogGroup[]

  // Loading states
  loading: boolean
  instancesLoading: boolean
  logGroupsLoading: boolean

  // Errors
  instancesError: string
  logGroupsError: string
}

// Singleton state shared across all components
const state = reactive<SupportContextState>({
  mode: 'account',
  accountId: '',
  accountName: '',
  environment: 'govcloud',
  instances: [],
  logGroups: [],
  loading: false,
  instancesLoading: false,
  logGroupsLoading: false,
  instancesError: '',
  logGroupsError: ''
})

export function useSupportContext() {
  const enclaveStore = useEnclaveStore()

  // Find account name from enclave store
  function findAccountName(accountId: string): string {
    if (!accountId) return ''
    const enclaves = Object.values(enclaveStore.enclaves || {})
    for (const account of enclaves) {
      if (!account) continue
      const commercialId = account.awsStandardAccountID || account.accountId
      const govCloudId = account.awsGovCloudAccountID
      if (commercialId === accountId || govCloudId === accountId) {
        return account.projectName || account.accountName || ''
      }
    }
    return ''
  }

  // Find GovCloud account ID from commercial ID or vice versa
  function findLinkedAccountId(accountId: string, targetEnv: 'commercial' | 'govcloud'): string | null {
    if (!accountId) return null
    const enclaves = Object.values(enclaveStore.enclaves || {})
    for (const account of enclaves) {
      if (!account) continue
      const commercialId = account.awsStandardAccountID || account.accountId
      const govCloudId = account.awsGovCloudAccountID
      if (commercialId === accountId || govCloudId === accountId) {
        if (targetEnv === 'govcloud') {
          return govCloudId || null
        } else {
          return commercialId || null
        }
      }
    }
    return null
  }

  // Load instances for the selected account
  async function loadInstances() {
    if (!state.accountId || state.mode === 'global') {
      state.instances = []
      return
    }

    state.instancesLoading = true
    state.instancesError = ''

    try {
      const response = await $fetch('/api/instances', {
        params: {
          accountIds: state.accountId,
          environment: state.environment,
          limit: 200,
          includeOptimizationHints: 'false'
        }
      })

      const data = (response as any).data
      state.instances = (data?.instances || []).map((inst: any) => ({
        resourceId: inst.resourceId,
        instanceName: inst.instanceName,
        instanceType: inst.instanceType,
        instanceState: inst.instanceState,
        privateIpAddress: inst.networkInfo?.privateIpAddress,
        publicIpAddress: inst.networkInfo?.publicIpAddress,
        region: inst.region
      }))
    } catch (err: any) {
      console.error('[SupportContext] Failed to load instances:', err)
      state.instancesError = err.data?.error?.message || err.message || 'Failed to load instances'
      state.instances = []
    } finally {
      state.instancesLoading = false
    }
  }

  // Load log groups for the selected account
  async function loadLogGroups() {
    if (!state.accountId || state.mode === 'global') {
      state.logGroups = []
      return
    }

    state.logGroupsLoading = true
    state.logGroupsError = ''

    try {
      const response = await $fetch('/api/support/log-groups', {
        params: {
          accountId: state.accountId,
          environment: state.environment
        }
      })

      const data = (response as any).data
      state.logGroups = data?.logGroups || []
    } catch (err: any) {
      console.error('[SupportContext] Failed to load log groups:', err)
      state.logGroupsError = err.data?.error?.message || err.message || 'Failed to load log groups'
      state.logGroups = []
    } finally {
      state.logGroupsLoading = false
    }
  }

  // Load all resources in parallel
  async function loadResources() {
    state.loading = true
    await Promise.all([loadInstances(), loadLogGroups()])
    state.loading = false
  }

  // Set account and trigger data loading
  async function setAccount(accountId: string) {
    if (state.accountId === accountId) return

    state.accountId = accountId
    state.accountName = findAccountName(accountId)

    // Clear previous data
    state.instances = []
    state.logGroups = []
    state.instancesError = ''
    state.logGroupsError = ''

    if (accountId) {
      await loadResources()
    }
  }

  // Set environment and reload data
  async function setEnvironment(env: 'commercial' | 'govcloud') {
    if (state.environment === env) return

    const oldAccountId = state.accountId

    state.environment = env

    // Try to find the linked account ID in the new environment
    if (oldAccountId) {
      const linkedId = findLinkedAccountId(oldAccountId, env)
      if (linkedId) {
        state.accountId = linkedId
        state.accountName = findAccountName(linkedId)
        await loadResources()
      } else {
        // No linked account found, clear selection
        state.accountId = ''
        state.accountName = ''
        state.instances = []
        state.logGroups = []
      }
    }
  }

  // Set mode
  function setMode(mode: 'global' | 'account') {
    state.mode = mode
    if (mode === 'global') {
      // Clear preloaded data in global mode
      state.instances = []
      state.logGroups = []
    } else if (state.accountId) {
      // Reload data when switching back to account mode
      loadResources()
    }
  }

  // Clear all context
  function clearContext() {
    state.accountId = ''
    state.accountName = ''
    state.instances = []
    state.logGroups = []
    state.instancesError = ''
    state.logGroupsError = ''
  }

  // Computed: check if context is ready for account-specific operations
  const isAccountReady = computed(() => {
    return state.mode === 'account' && !!state.accountId
  })

  // Computed: check if data is still loading
  const isLoading = computed(() => {
    return state.loading || state.instancesLoading || state.logGroupsLoading
  })

  // Computed: get resource counts
  const resourceCounts = computed(() => ({
    instances: state.instances.length,
    logGroups: state.logGroups.length,
    runningInstances: state.instances.filter(i => i.instanceState === 'running').length,
    stoppedInstances: state.instances.filter(i => i.instanceState === 'stopped').length
  }))

  return {
    // State (reactive)
    state: readonly(state),

    // Computed
    isAccountReady,
    isLoading,
    resourceCounts,

    // Actions
    setAccount,
    setEnvironment,
    setMode,
    clearContext,
    loadResources,

    // Direct access to mutable state for v-model bindings
    accountId: computed({
      get: () => state.accountId,
      set: (val: string) => setAccount(val)
    }),
    environment: computed({
      get: () => state.environment,
      set: (val: 'commercial' | 'govcloud') => setEnvironment(val)
    }),
    mode: computed({
      get: () => state.mode,
      set: (val: 'global' | 'account') => setMode(val)
    })
  }
}
