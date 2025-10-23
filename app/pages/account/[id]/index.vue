<template>
  <div class="space-y-6 p-6">
    <!-- Account Header -->
    <UCard>
      <div class="flex gap-2 items-center justify-between">
        <div class="flex gap-2 items-center">
          <div :class="`w-3 h-3 rounded-full ${accountStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'}`" />
          <h1 class="font-semibold text-2xl">{{ accountName ?? "Loading..." }}</h1>
        </div>
        <div class="flex gap-2">
          <!-- Favorite Button -->
          <UButton
            v-if="accountId"
            :icon="favoritesComposable.isFavorite(accountId) ? 'i-heroicons-star-solid' : 'i-heroicons-star'"
            :color="favoritesComposable.isFavorite(accountId) ? 'yellow' : 'gray'"
            variant="ghost"
            size="sm"
            :loading="favoritesComposable.loading.value"
            :title="favoritesComposable.isFavorite(accountId) ? 'Remove from favorites' : 'Add to favorites'"
            @click="favoritesComposable.toggleFavorite(accountId)"
          />

          <AccountShareButton
            v-if="accountId"
            :account-id="accountId"
            :account-name="accountName"
            :selected-tab="selectedTab"
            :tab-name="currentTabName"
          />
          <UButton
            v-if="accountId"
            icon="i-heroicons-chart-bar"
            color="primary"
            variant="soft"
            @click="navigateToCostsPage"
          >
            View Costs
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Tabs -->
    <UTabs v-model="selectedTab" :items="tabs">
      <!-- Overview Tab -->
      <template #overview>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 row-auto">
          <!-- Account Details -->
          <AccountDetails v-if="accountId" :account-id="accountId" :current-spend="currentSpend" :users="users" class="col-span-2" />

          <!-- Budget Health -->
          <BudgetHealthCard
            :budget="budget"
            :current-spend="currentSpend"
            :forecast-data="forecastData"
            :loading="loading"
            class="col-span-1"
          />

          <!-- Account Users -->
          <AccountUsers :users="users" :account-id="accountId" :loading="loading" class="col-span-1" />

          <!-- Cost Trend Chart -->
          <CostTrendChart title="Account Cost Trends" :time-series-billable="billableTimeSeries" :time-series-proforma="proformaTimeSeries" :loading="loading" class="lg:col-span-2" />
        </div>
      </template>

      <!-- Resources Tab -->
      <template #resources>
        <div class="space-y-4 mt-4">
          <!-- Row 1: Resource Usage (1 col) + S3 Buckets (2 col) -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="col-span-1 h-full">
              <ResourceUsage :data="resourceCounts || {}" :columns="1" :loading="loading" class="h-full" />
            </div>
            <div class="col-span-1 md:col-span-2 h-full">
              <S3Buckets v-if="govCloudId || accountId" :account-id="govCloudId || accountId" :environment="govCloudId ? 'govcloud' : 'commercial'" class="h-full" />
            </div>
          </div>

          <!-- Row 2: EBS Volumes (2 col) + Instance Scheduling (1 col) -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="col-span-1 md:col-span-2 h-full">
              <EBSVolumes v-if="govCloudId || accountId" :account-id="govCloudId || accountId" class="h-full" />
            </div>
            <div class="col-span-1 h-full">
              <InstanceScheduling v-if="govCloudId || accountId" :account-id="govCloudId || accountId" class="h-full" />
            </div>
          </div>

          <!-- Row 3: Instances Table - Full Width (GovCloud) -->
          <InstancesTable v-if="govCloudId || accountId" :account-id="govCloudId || accountId" />
        </div>
      </template>

      <!-- Policies Tab -->
      <template #policies>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 row-auto mt-4">
          <!-- Service Control Policies -->
          <ServiceControlPolicies v-if="accountId" :account-id="accountId" class="col-span-2" />

          <!-- Organizational Structure -->
          <OrganizationalStructure v-if="accountId" :account-id="accountId" class="col-span-1" />

          <!-- Policy Analyzer -->
          <PolicyAnalyzer v-if="accountId" :account-id="accountId" class="col-span-3" />
        </div>
      </template>
    </UTabs>
  </div>
</template>

<script setup lang="ts">
import type { GraphUser } from '~/composables/useGroupMembers'

const route = useRoute()
const enclaveStore = useEnclaveStore()
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()
const favoritesComposable = useFavoriteAccounts()

const accountId = computed(() => route.params.id as string)
const govCloudId = computed(() => enclaveStore.enclaves[accountId.value]?.awsGovCloudAccountID)
const accountName = computed(() => enclaveStore.enclaves[accountId.value]?.projectName)
const accountStatus = computed(() => enclaveStore.enclaves[accountId.value]?.enclaveStatus)

// Tabs configuration
const selectedTab = ref(0)
const tabs = [
  {
    label: 'Overview',
    slot: 'overview',
    icon: 'i-heroicons-home'
  },
  {
    label: 'Resources',
    slot: 'resources',
    icon: 'i-heroicons-server-stack'
  },
  {
    label: 'Policies',
    slot: 'policies',
    icon: 'i-heroicons-shield-check'
  }
]

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
const forecastData = ref<any>(null)
const loading = ref(true)

const currentSpend = computed(() => costResponse.value?.data.billableMonthToDateTotal || 0)

const budget = computed(() => {
  const enclave = enclaveStore.enclaves[accountId.value]
  if (!enclave?.estimatedMonthlyCharge) return 0
  return parseFloat(enclave.estimatedMonthlyCharge.toString().replace(/[^0-9.-]/g, '') || '0')
})

const billableTimeSeries = computed(() => {
  if (!costResponse.value) return []
  return costResponse.value.data.billableLast14Days
})

const proformaTimeSeries = computed(() => {
  if (!costResponse.value) return []
  return costResponse.value.data.proformaLast14Days
})

// Get the current tab name for the share button
const currentTabName = computed(() => {
  const tab = tabs.find((t, index) => index === selectedTab.value)
  return tab?.label || 'Overview'
})

const router = useRouter()

// Navigate to costs page with this account pre-selected
const navigateToCostsPage = () => {
  if (!accountId.value) return

  // Build URL with query parameters to pre-select this account
  const queryParams = {
    accounts: JSON.stringify([accountId.value]),
    timeframe: 'thisMonth',
    tab: 'all'
  }

  router.push({
    path: '/account/costs',
    query: queryParams
  })
}

// Check if URL has GovCloud ID and redirect to commercial ID
const checkAndRedirectIfGovCloudId = () => {
  const urlId = route.params.id as string

  // Check if this ID exists in enclave store (commercial IDs are the keys)
  if (enclaveStore.enclaves[urlId]) {
    // Valid commercial ID, no redirect needed
    return
  }

  // Search for enclave where GovCloud ID matches the URL ID
  const enclave = Object.values(enclaveStore.enclaves).find(
    (enc: any) => enc.awsGovCloudAccountID === urlId
  )

  if (enclave) {
    // Found it - redirect to commercial ID
    const commercialId = enclave.accountId || enclave.awsStandardAccountID
    if (commercialId) {
      console.log(`Redirecting from GovCloud ID ${urlId} to commercial ID ${commercialId}`)
      router.replace(`/account/${commercialId}`)
    }
  }
}

onMounted(async () => {
  // Check for GovCloud ID redirect first
  checkAndRedirectIfGovCloudId()

  // Check for tab query parameter from shared link
  const tabParam = route.query.tab
  if (tabParam !== undefined && tabParam !== null) {
    const tabIndex = parseInt(tabParam as string)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
      selectedTab.value = tabIndex
    }
  }

  try {
    if (accountId.value) {
      users.value = await groupMembers.fetchEnclaveUsers(accountId.value, govCloudId.value || '', user.value?.accessToken || '')
    }

    // Fetch all data in parallel for better performance
    // Use govCloudId for govcloud APIs, accountId (commercial) for commercial APIs
    const [instancesRes, costsRes, resourcesRes, forecastRes] = await Promise.all([
      fetch(`/api/instances?environment=govcloud&accountIds=${govCloudId.value || accountId.value}&limit=2000`),
      fetch(`/api/accounts/dashboard-simplified?standard_account_id=${accountId.value}`),
      fetch(`/api/config/summary-simplified?govcloud_account_id=${govCloudId.value}`),
      fetch(`/api/costs/forecast?period=current-month-remainder&accountIds=${accountId.value}&granularity=DAILY&environment=commercial`)
    ])

    const [instancesJson, costsJson, resourcesJson, forecastJson] = await Promise.all([
      instancesRes.json(),
      costsRes.json(),
      resourcesRes.json(),
      forecastRes.json()
    ])

    instanceData.value = instancesJson.data
    costResponse.value = costsJson
    resourceCounts.value = resourcesJson.data
    forecastData.value = forecastJson.data

    console.log('Forecast data:', forecastData.value)
  } catch (err) {
    console.error('Error fetching account data:', err)
  } finally {
    loading.value = false
  }
})
</script>
