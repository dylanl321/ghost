<template>
  <div class="space-y-6 p-6">
    <!-- Account Header -->
    <UCard>
      <div class="flex gap-2 items-center">
        <div :class="`w-3 h-3 rounded-full ${accountStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'}`" />
        <h1 class="font-semibold text-2xl">{{ accountName ?? "Loading..." }}</h1>
      </div>
    </UCard>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4 row-auto">
      <!-- Account Details -->
      <AccountDetails v-if="accountId" :account-id="accountId" :current-spend="currentSpend" class="col-span-2" />

      <!-- Account Users -->
      <AccountUsers :users="users" :account-id="accountId" :loading="loading" class="col-span-1" />

      <CostTrendChart title="Account Cost Trends" :time-series-billable="billableTimeSeries" :time-series-proforma="proformaTimeSeries" :loading="loading" class="col-span-2" />

      <!-- <ResourceUsage :columns="2" class="col-span-1" /> -->
      <ResourceUsage :data="resourceCounts || {}" :columns="2" :loading="loading" />
      <!-- <EC2Usage :instance-summary="instanceData?.summary || null" :loading="loading" /> -->
    </div>
  </div>
</template>

<script setup lang="ts">
import type { GraphUser } from '~/composables/useGroupMembers'

const route = useRoute()
const enclaveStore = useEnclaveStore()
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()

const accountId = computed(() => route.params.id as string)
const govCloudId = computed(() => enclaveStore.enclaves[accountId.value]?.awsGovCloudAccountID)
const accountName = computed(() => enclaveStore.enclaves[accountId.value]?.projectName)
const accountStatus = computed(() => enclaveStore.enclaves[accountId.value]?.enclaveStatus)

interface InstanceResponse {
  instances: Instance[]
  summary: InstanceSummary
}

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

const users = ref<GraphUser[]>([])
const instanceData = ref<InstanceResponse | null>(null)
const costResponse = ref<CostResponse | null>(null)
const resourceCounts = ref<ResourceCounts | null>(null)
const loading = ref(true)

const currentSpend = computed(() => costResponse.value?.data.billableMonthToDateTotal || 0)

const billableTimeSeries = computed(() => {
  if (!costResponse.value) return []
  return costResponse.value.data.billableLast14Days
})

const proformaTimeSeries = computed(() => {
  if (!costResponse.value) return []
  return costResponse.value.data.proformaLast14Days
})

onMounted(async () => {
  try {
    if (accountId.value) {
      users.value = await groupMembers.fetchEnclaveUsers(accountId.value, govCloudId.value || '', user.value?.accessToken || '')
    }
    const response = await fetch(`/api/instances?environment=govcloud&accountIds=${accountId.value}&limit=2000`)
    const json = await response.json()
    instanceData.value = json.data

    const response2 = await fetch(`/api/accounts/dashboard-simplified?standard_account_id=${accountId.value}`)
    costResponse.value = await response2.json()

    const response3 = await fetch(`/api/config/summary-simplified?govcloud_account_id=${govCloudId.value}`)
    const json3 = await response3.json()
    console.log(json3)
    resourceCounts.value = json3.data
  } catch (err) {
    console.error('Error fetching users:', err)
  } finally {
    loading.value = false
  }
})
</script>
