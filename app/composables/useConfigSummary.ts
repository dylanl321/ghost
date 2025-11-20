/**
 * useConfigSummary Composable
 *
 * Provides reactive interface for fetching AWS Config resource summaries
 * Supports both detailed summaries and simplified counts
 */

import type {
  ConfigSummaryResponse,
  ConfigSummaryQueryParams,
  ResourceCounts,
  ConfigSummarySimplifiedQueryParams
} from '~/shared/types/resources'

export interface UseConfigSummaryOptions extends ConfigSummaryQueryParams {
  immediate?: boolean
  simplified?: boolean
  onError?: (error: Error) => void
  onSuccess?: (data: ConfigSummaryResponse | ResourceCounts) => void
}

export function useConfigSummary(options: UseConfigSummaryOptions = {}) {
  const { immediate = false, simplified = false, onError, onSuccess, ...queryParams } = options

  // Reactive state
  const data = ref<ConfigSummaryResponse | ResourceCounts | null>(null)
  const loading = ref(false)
  const error = ref<Error | null>(null)

  // Computed getters for detailed summary
  const summary = computed(() => {
    if (!data.value || simplified) return null
    return (data.value as ConfigSummaryResponse).summary
  })

  const topResourceTypes = computed(() => {
    if (!data.value || simplified) return []
    return (data.value as ConfigSummaryResponse).topResourceTypes || []
  })

  const ageDistribution = computed(() => {
    if (!data.value || simplified) return null
    return (data.value as ConfigSummaryResponse).ageDistribution
  })

  const byAccount = computed(() => {
    if (!data.value || simplified) return {}
    return (data.value as ConfigSummaryResponse).byAccount || {}
  })

  const byRegion = computed(() => {
    if (!data.value || simplified) return {}
    return (data.value as ConfigSummaryResponse).byRegion || {}
  })

  const byType = computed(() => {
    if (!data.value || simplified) return {}
    return (data.value as ConfigSummaryResponse).byType || {}
  })

  const performance = computed(() => {
    if (!data.value || simplified) return null
    return (data.value as ConfigSummaryResponse).performance
  })

  // Computed getters for simplified summary
  const resourceCounts = computed(() => {
    if (!simplified || !data.value) return null
    return data.value as ResourceCounts
  })

  // Build query string from params
  const buildQueryString = (params: any) => {
    const query = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value))
      }
    })

    return query.toString()
  }

  // Fetch summary
  const fetch = async (additionalParams: Partial<ConfigSummaryQueryParams> = {}) => {
    loading.value = true
    error.value = null

    try {
      const mergedParams = { ...queryParams, ...additionalParams }
      const queryString = buildQueryString(mergedParams)

      // Choose endpoint based on simplified flag
      const endpoint = simplified ? '/api/config/summary-simplified' : '/api/config/summary'
      const url = `${endpoint}${queryString ? `?${queryString}` : ''}`

      const response = await $fetch<{
        success: boolean
        data: ConfigSummaryResponse | ResourceCounts
      }>(url)

      if (!response.success) {
        throw new Error('Failed to fetch config summary')
      }

      data.value = response.data

      if (onSuccess) {
        onSuccess(response.data)
      }

      return response.data
    } catch (err) {
      const fetchError = err instanceof Error ? err : new Error('Unknown error occurred')
      error.value = fetchError

      if (onError) {
        onError(fetchError)
      }

      throw fetchError
    } finally {
      loading.value = false
    }
  }

  // Refresh current data
  const refresh = () => fetch()

  // Reset state
  const reset = () => {
    data.value = null
    error.value = null
    loading.value = false
  }

  // Get total resource count
  const totalResources = computed(() => {
    if (simplified && resourceCounts.value) {
      // Sum all resource counts for simplified
      const counts = resourceCounts.value
      return (
        (counts.ec2?.total || 0) +
        (counts.volumes?.total || 0) +
        (counts.ecsContainers?.total || 0) +
        (counts.eksClusters?.total || 0) +
        (counts.buckets?.total || 0) +
        (counts.lambda?.total || 0) +
        (counts.rds?.total || 0)
      )
    }

    return summary.value?.totalResources || 0
  })

  // Immediate fetch if requested
  if (immediate) {
    fetch()
  }

  return {
    // State
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),

    // Detailed summary computed values
    summary,
    topResourceTypes,
    ageDistribution,
    byAccount,
    byRegion,
    byType,
    performance,

    // Simplified summary computed values
    resourceCounts,

    // Methods
    fetch,
    refresh,
    reset,

    // Computed helpers
    hasData: computed(() => data.value !== null),
    hasError: computed(() => error.value !== null),
    totalResources,
    isSimplified: computed(() => simplified)
  }
}
