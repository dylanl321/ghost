/**
 * useConfigResources Composable
 *
 * Provides reactive interface for fetching AWS Config resources
 * with error handling, loading states, and retry logic
 */

import type {
  ConfigResourcesResponse,
  ConfigResourcesQueryParams,
  ConfigResource
} from '#shared/types/resources'

export interface UseConfigResourcesOptions extends ConfigResourcesQueryParams {
  immediate?: boolean
  onError?: (error: Error) => void
  onSuccess?: (data: ConfigResourcesResponse) => void
}

export function useConfigResources(options: UseConfigResourcesOptions = {}) {
  const { immediate = false, onError, onSuccess, ...queryParams } = options

  // Reactive state
  const data = ref<ConfigResourcesResponse | null>(null)
  const resources = computed(() => data.value?.resources || [])
  const summary = computed(() => data.value?.summary)
  const pagination = computed(() => data.value?.pagination)
  const aiAnalysis = computed(() => data.value?.aiAnalysis)

  const loading = ref(false)
  const error = ref<Error | null>(null)

  // Build query string from params
  const buildQueryString = (params: ConfigResourcesQueryParams) => {
    const query = new URLSearchParams()

    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value))
      }
    })

    return query.toString()
  }

  // Fetch resources
  const fetch = async (additionalParams: Partial<ConfigResourcesQueryParams> = {}) => {
    loading.value = true
    error.value = null

    try {
      const mergedParams = { ...queryParams, ...additionalParams }
      const queryString = buildQueryString(mergedParams)
      const url = `/api/config/resources${queryString ? `?${queryString}` : ''}`

      const response = await $fetch<{ success: boolean; data: ConfigResourcesResponse }>(url)

      if (!response.success) {
        throw new Error('Failed to fetch config resources')
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

  // Fetch next page
  const fetchNextPage = async () => {
    if (!pagination.value?.nextToken || !pagination.value?.hasMore) {
      return null
    }

    return fetch({ nextToken: pagination.value.nextToken })
  }

  // Refresh current data
  const refresh = () => fetch()

  // Reset state
  const reset = () => {
    data.value = null
    error.value = null
    loading.value = false
  }

  // Filter resources client-side
  const filterResources = (predicate: (resource: ConfigResource) => boolean) => {
    return computed(() => resources.value.filter(predicate))
  }

  // Group resources by field
  const groupBy = (field: keyof ConfigResource) => {
    return computed(() => {
      const groups = new Map<string, ConfigResource[]>()

      resources.value.forEach(resource => {
        const key = String(resource[field] || 'unknown')
        if (!groups.has(key)) {
          groups.set(key, [])
        }
        groups.get(key)!.push(resource)
      })

      return groups
    })
  }

  // Immediate fetch if requested
  if (immediate) {
    fetch()
  }

  return {
    // State
    data: readonly(data),
    resources,
    summary,
    pagination,
    aiAnalysis,
    loading: readonly(loading),
    error: readonly(error),

    // Methods
    fetch,
    fetchNextPage,
    refresh,
    reset,
    filterResources,
    groupBy,

    // Computed helpers
    hasData: computed(() => data.value !== null),
    hasError: computed(() => error.value !== null),
    isEmpty: computed(() => resources.value.length === 0),
    hasMore: computed(() => pagination.value?.hasMore || false)
  }
}
