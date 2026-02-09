/**
 * Composable that handles all data fetching for the Account Details page.
 * Fetches costs, resource counts, forecast data, and users in parallel.
 */
import type { GraphUser } from '~/composables/useGroupMembers'
import { getMonthlyBudget } from '#shared/utils/budget-utils'

interface CostResponse {
  success: boolean
  data: CostData
}
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

export function useAccountData(
  accountId: ComputedRef<string>,
  govCloudId: ComputedRef<string | undefined>,
  isAccountInactive: ComputedRef<boolean>,
) {
  const enclaveStore = useEnclaveStore()
  const groupMembers = useGroupMembers()
  const { user } = useOidcAuth()

  const users = ref<GraphUser[]>([])
  const costResponse = ref<CostResponse | null>(null)
  const resourceCounts = ref<ResourceCounts | null>(null)
  const forecastData = ref<any>(null)
  const loading = ref(true)

  const currentSpend = computed(() => costResponse.value?.data.proformaMonthToDateTotal || 0)

  const budget = computed(() => {
    const enclave = enclaveStore.enclaves[accountId.value]
    return getMonthlyBudget(enclave)
  })

  const billableTimeSeries = computed(() => {
    if (!costResponse.value) return []
    return costResponse.value.data.billableLast14Days
  })

  const proformaTimeSeries = computed(() => {
    if (!costResponse.value) return []
    return costResponse.value.data.proformaLast14Days
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

      const [costsRes, resourcesRes, forecastRes] = await Promise.all([
        fetch(`/api/accounts/dashboard-simplified?standard_account_id=${accountId.value}`),
        fetch(`/api/config/summary-simplified?govcloud_account_id=${govCloudId.value}`),
        fetch(`/api/costs/projections?period=current-month-remainder&accountIds=${accountId.value}&granularity=DAILY&environment=commercial`),
      ])

      const [costsJson, resourcesJson, forecastJson] = await Promise.all([
        costsRes.json(),
        resourcesRes.json(),
        forecastRes.json(),
      ])

      costResponse.value = costsJson
      resourceCounts.value = resourcesJson.data
      forecastData.value = forecastJson.data
    } catch (err) {
      console.error('Error fetching account data:', err)
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
