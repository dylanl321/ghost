import { getCachedPipelineData, setCachedPipelineData } from './usePipelineDataCache'

interface ApiResponse<T = any> {
  success: boolean
  data: T
  message?: string
  error?: { message: string }
}

async function fetchCached<T>(endpoint: string, params: Record<string, string | number>): Promise<T> {
  const cached = getCachedPipelineData<T>(endpoint, params)
  if (cached) return cached

  const query = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  ).toString()

  const result = await $fetch<ApiResponse<T>>(`/api/pipelines/${endpoint}?${query}`)

  if (!result.success) {
    throw new Error(result.message || result.error?.message || `Failed to fetch ${endpoint}`)
  }

  setCachedPipelineData(endpoint, params, result.data)
  return result.data
}

export function usePipelineData() {
  function fetchPipelineSummary(days: number) {
    return fetchCached<any>('global-summary', { days })
  }

  function fetchPipelineTimeline(days: number, limit: number) {
    return fetchCached<any[]>('global-timeline', { days, limit })
  }

  function fetchAccountSummary(accountId: string, days: number, environment: string) {
    return fetchCached<any>('account-summary', { account_id: accountId, days, environment })
  }

  function fetchAccountHealth(accountId: string, days: number) {
    return fetchCached<any>('account-health', { account_id: accountId, days })
  }

  function fetchAccountDrift(accountId: string, days: number) {
    return fetchCached<any>('account-drift', { account_id: accountId, days })
  }

  return {
    fetchPipelineSummary,
    fetchPipelineTimeline,
    fetchAccountSummary,
    fetchAccountHealth,
    fetchAccountDrift
  }
}
