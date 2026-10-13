/**
 * Composable that handles all data fetching for the Account Details page.
 * Fetches costs, resource counts, forecast data, and users in parallel.
 */
import type { GraphUser } from '~/composables/useGroupMembers'
import { getMonthlyBudget } from '#shared/utils/budget-utils'

const logger = createLogger('AccountData')

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string | { message?: string }
}
type CostResponse = ApiResponse<CostData>
interface CostData {
  billableMonthToDateTotal: number
  proformaMonthToDateTotal: number
  billableLast14Days: CostDaily[]
  proformaLast14Days: CostDaily[]
}
interface CostDaily {
  date: string
  cost: number
}

async function fetchAccountApi<T>(url: string, label: string): Promise<ApiResponse<T>> {
  const response = await fetch(url)
  const body = await response.json() as ApiResponse<T>

  if (!response.ok || !body.success) {
    const apiMessage = typeof body.error === 'string' ? body.error : body.error?.message
    throw new Error(`${label} request failed (${response.status}): ${apiMessage || response.statusText}`)
  }

  return body
}

export function useAccountData(
  accountId: ComputedRef<string>,
  govCloudId: ComputedRef<string | undefined>,
  isAccountInactive: ComputedRef<boolean>,
  days?: Ref<number>,
) {
  const enclaveStore = useEnclaveStore()
  const groupMembers = useGroupMembers()
  const { user } = useOidcAuth()

  const users = ref<GraphUser[]>([])
  const costResponse = ref<CostResponse | null>(null)
  const resourceCounts = ref<ResourceCounts | null>(null)
  const forecastData = ref<any>(null)
  const loading = ref(true)

  const currentSpend = computed(() => costResponse.value?.data?.proformaMonthToDateTotal ?? 0)

  const budget = computed(() => {
    const enclave = enclaveStore.enclaves[accountId.value]
    return getMonthlyBudget(enclave)
  })

  const billableTimeSeries = computed(() => {
    return costResponse.value?.data?.billableLast14Days ?? []
  })

  const proformaTimeSeries = computed(() => {
    return costResponse.value?.data?.proformaLast14Days ?? []
  })

  async function fetchAll() {
    try {
      // Skip data fetching for inactive/decommissioned accounts
      if (isAccountInactive.value) {
        loading.value = false
        return
      }

      if (accountId.value) {
        users.value = await groupMembers.fetchEnclaveUsers(
          accountId.value,
          govCloudId.value || '',
          user.value?.accessToken || '',
        )
      }

      const resourceAccountId = govCloudId.value || accountId.value
      const resourceEnvironment = govCloudId.value ? 'govcloud' : 'commercial'

      // Keep successful sections usable when one AWS dependency is unavailable.
      const [costsResult, resourcesResult, forecastResult] = await Promise.allSettled([
        fetchAccountApi<CostData>(`/api/accounts/dashboard-simplified?standard_account_id=${accountId.value}${days ? `&days=${days.value}` : ''}`, 'Costs'),
        fetchAccountApi<ResourceCounts>(`/api/config/summary-simplified?account_id=${resourceAccountId}&environment=${resourceEnvironment}`, 'Resources'),
        fetchAccountApi<any>(`/api/costs/projections?period=current-month-remainder&accountIds=${accountId.value}&granularity=DAILY&environment=commercial`, 'Forecast'),
      ])

      if (costsResult.status === 'fulfilled') {
        costResponse.value = costsResult.value
      } else {
        logger.error('Error fetching account costs:', costsResult.reason)
      }

      if (resourcesResult.status === 'fulfilled') {
        resourceCounts.value = resourcesResult.value.data
      } else {
        logger.error('Error fetching account resources:', resourcesResult.reason)
      }

      if (forecastResult.status === 'fulfilled') {
        forecastData.value = forecastResult.value.data
      } else {
        logger.error('Error fetching account forecast:', forecastResult.reason)
      }
    } catch (err) {
      logger.error('Error fetching account data:', err)
    } finally {
      loading.value = false
    }
  }

  return {
    users,
    resourceCounts,
    forecastData,
    loading,
    currentSpend,
    budget,
    billableTimeSeries,
    proformaTimeSeries,
    fetchAll,
  }
}
