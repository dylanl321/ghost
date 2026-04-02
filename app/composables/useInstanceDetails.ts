/**
 * Composable for fetching comprehensive EC2 instance details.
 * Calls 3 existing APIs in parallel via Promise.allSettled for graceful partial failure.
 */

const logger = createLogger('InstanceDetails')

export interface InstanceDetailsData {
  instance: any | null
  optimization: any | null
  tagSuggestions: any | null
  health: any | null
  utilization: any | null
}

export function useInstanceDetails(
  instanceId: ComputedRef<string>,
  accountId: ComputedRef<string>,
) {
  const enclaveStore = useEnclaveStore()

  const instance = ref<any>(null)
  const optimization = ref<any>(null)
  const tagSuggestions = ref<any>(null)
  const health = ref<any>(null)
  const utilization = ref<any>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Resolve environment from enclave store
  const environment = computed(() => {
    const enclave = enclaveStore.enclaves[accountId.value]
    return enclave?.isGovCloud ? 'govcloud' : 'govcloud' // Default govcloud for this org
  })

  const instanceName = computed(() => instance.value?.instanceName || instanceId.value)
  const instanceState = computed(() => instance.value?.instanceState || 'unknown')

  async function fetchAll() {
    if (!instanceId.value || !accountId.value) return

    loading.value = true
    error.value = null

    try {
      const [instanceResult, healthResult, utilizationResult] = await Promise.allSettled([
        // 1. Instance details + optimization + tag suggestions
        $fetch<any>(`/api/instances/${instanceId.value}`, {
          params: {
            accountId: accountId.value,
            environment: environment.value,
            includeOptimization: true,
            includeTagSuggestions: true,
          },
        }),

        // 2. Health dashboard (patches, security, vulns, alarms)
        $fetch<any>('/api/support/instance-health', {
          params: {
            instanceId: instanceId.value,
            accountId: accountId.value,
            environment: environment.value,
          },
        }),

        // 3. Utilization metrics (CPU, network, classification)
        $fetch<any>('/api/instances/utilization', {
          params: {
            accountIds: accountId.value,
            environment: environment.value,
            includeMetrics: true,
          },
        }),
      ])

      // Process instance details
      if (instanceResult.status === 'fulfilled' && instanceResult.value?.data) {
        instance.value = instanceResult.value.data.instance
        optimization.value = instanceResult.value.data.optimization || null
        tagSuggestions.value = instanceResult.value.data.tagSuggestions || null
      } else {
        const reason = instanceResult.status === 'rejected' ? instanceResult.reason?.message : 'No data'
        logger.warn('Instance details fetch failed:', reason)
        error.value = `Failed to load instance details: ${reason}`
      }

      // Process health data
      if (healthResult.status === 'fulfilled' && healthResult.value?.data) {
        health.value = healthResult.value.data
      } else {
        logger.warn('Health data fetch failed:', healthResult.status === 'rejected' ? healthResult.reason?.message : 'No data')
      }

      // Process utilization - find this specific instance in results
      if (utilizationResult.status === 'fulfilled' && utilizationResult.value?.data) {
        const allInstances = utilizationResult.value.data.instances || []
        utilization.value = allInstances.find((i: any) => i.instanceId === instanceId.value || i.resourceId === instanceId.value) || null
      } else {
        logger.warn('Utilization fetch failed:', utilizationResult.status === 'rejected' ? utilizationResult.reason?.message : 'No data')
      }
    } catch (err: any) {
      logger.error('Unexpected error fetching instance details:', err)
      error.value = err.message || 'Failed to load instance details'
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    await fetchAll()
  }

  return {
    // State
    instance: readonly(instance),
    optimization: readonly(optimization),
    tagSuggestions: readonly(tagSuggestions),
    health: readonly(health),
    utilization: readonly(utilization),
    loading: readonly(loading),
    error: readonly(error),

    // Computed
    instanceName,
    instanceState,
    environment,

    // Methods
    fetchAll,
    refresh,
  }
}
