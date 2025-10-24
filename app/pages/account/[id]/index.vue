<template>
  <div class="space-y-6 p-6">
    <!-- Decommissioned Account Warning Banner -->
    <UAlert
      v-if="isAccountInactive"
      color="orange"
      variant="solid"
      icon="i-heroicons-exclamation-triangle"
      :close-button="{ icon: 'i-heroicons-x-mark', color: 'white', variant: 'link' }"
    >
      <template #title>
        <span class="font-semibold">Account {{ accountStatus }}</span>
      </template>
    </UAlert>

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
          <UTooltip text="Learn about favorites">
            <NuxtLink to="/support/docs?topic=favorites-guide">
              <UButton
                icon="i-heroicons-question-mark-circle"
                color="gray"
                variant="ghost"
                size="sm"
              />
            </NuxtLink>
          </UTooltip>

          <AccountShareButton
            v-if="accountId"
            :account-id="accountId"
            :account-name="accountName"
            :selected-tab="selectedTab"
            :tab-name="currentTabName"
          />
          
          <!-- AWS Console Access Dropdown -->
          <UDropdown
            v-if="accountId"
            :items="consoleMenuItems"
            :popper="{ placement: 'bottom-end' }"
          >
            <UButton
              icon="i-heroicons-arrow-top-right-on-square"
              color="blue"
              variant="soft"
              trailing-icon="i-heroicons-chevron-down"
            >
              AWS Console
            </UButton>
          </UDropdown>

          <UButton
            v-if="accountId"
            icon="i-heroicons-chart-bar"
            color="primary"
            variant="soft"
            :disabled="isAccountInactive"
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
          <AccountDetails v-if="accountId" :account-id="accountId" :current-spend="currentSpend" :users="users" class="col-span-1 lg:col-span-2" />

          <!-- Budget Health - with overlay for inactive accounts -->
          <div class="col-span-1 relative">
            <BudgetHealthCard
              :budget="budget"
              :current-spend="currentSpend"
              :forecast-data="forecastData"
              :loading="loading"
              :class="{ 'opacity-50 pointer-events-none': isAccountInactive }"
            />
            <div v-if="isAccountInactive" class="absolute inset-0 flex items-center justify-center bg-gray-900/80 rounded-lg">
              <div class="text-center p-4">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                <p class="text-white font-semibold mb-1">Account {{ accountStatus }}</p>
                <p class="text-sm text-gray-400">Cost data is not available for inactive accounts</p>
              </div>
            </div>
          </div>

          <!-- Account Users -->
          <AccountUsers :users="users" :account-id="accountId" :loading="loading" class="col-span-1" />

          <!-- Cost Trend Chart - with overlay for inactive accounts -->
          <div class="col-span-1 lg:col-span-2 relative">
            <CostTrendChart
              title="Account Cost Trends"
              :time-series-billable="billableTimeSeries"
              :time-series-proforma="proformaTimeSeries"
              :loading="loading"
              :class="{ 'opacity-50 pointer-events-none': isAccountInactive }"
            />
            <div v-if="isAccountInactive" class="absolute inset-0 flex items-center justify-center bg-gray-900/80 rounded-lg">
              <div class="text-center p-4">
                <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-yellow-400 mx-auto mb-2" />
                <p class="text-white font-semibold mb-1">Account {{ accountStatus }}</p>
                <p class="text-sm text-gray-400">Cost trends are not available for inactive accounts</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Resources Tab -->
      <template #resources>
        <div v-if="!isAccountInactive" class="space-y-4 mt-4">
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
        <div v-else class="flex items-center justify-center py-16">
          <div class="text-center">
            <UIcon name="i-heroicons-server-stack" class="w-16 h-16 text-gray-500 mx-auto mb-4 opacity-50" />
            <h3 class="text-lg font-semibold text-white mb-2">Resources Unavailable</h3>
            <p class="text-gray-400">This tab is disabled because the account is {{ accountStatus?.toLowerCase() }}.</p>
          </div>
        </div>
      </template>

      <!-- Policies Tab -->
      <template #policies>
        <div v-if="!isAccountInactive" class="grid grid-cols-1 md:grid-cols-3 gap-4 row-auto mt-4">
          <!-- Service Control Policies -->
          <ServiceControlPolicies v-if="accountId" :account-id="accountId" class="col-span-2" />

          <!-- Organizational Structure -->
          <OrganizationalStructure v-if="accountId" :account-id="accountId" class="col-span-1" />

          <!-- Policy Analyzer -->
          <PolicyAnalyzer v-if="accountId" :account-id="accountId" class="col-span-3" />
        </div>
        <div v-else class="flex items-center justify-center py-16 mt-4">
          <div class="text-center">
            <UIcon name="i-heroicons-shield-check" class="w-16 h-16 text-gray-500 mx-auto mb-4 opacity-50" />
            <h3 class="text-lg font-semibold text-white mb-2">Policies Unavailable</h3>
            <p class="text-gray-400">This tab is disabled because the account is {{ accountStatus?.toLowerCase() }}.</p>
          </div>
        </div>
      </template>

      <!-- Notes Tab (Admin Only) -->
      <template #notes>
        <div class="mt-4">
          <AccountNotesPanel v-if="accountId && isAdmin" :account-id="accountId" />
        </div>
      </template>
    </UTabs>
  </div>
</template>

<script setup lang="ts">
import type { GraphUser } from '~/composables/useGroupMembers'
import { getIdcRoleLink, getIdcLoginLink, getAdminSupportRoles, type RoleLink } from '~/utils/awsConsoleLinks'

const route = useRoute()
const enclaveStore = useEnclaveStore()
const userGroupStore = useUserGroupStore()
const groupMembers = useGroupMembers()
const { user } = useOidcAuth()
const favoritesComposable = useFavoriteAccounts()
const { addRecentAccount } = useRecentAccounts()

const accountId = computed(() => route.params.id as string)
const govCloudId = computed(() => enclaveStore.enclaves[accountId.value]?.awsGovCloudAccountID)
const accountName = computed(() => enclaveStore.enclaves[accountId.value]?.projectName)
const accountStatus = computed(() => enclaveStore.enclaves[accountId.value]?.enclaveStatus)
const isAccountInactive = computed(() => accountStatus.value === 'Decommissioned' || accountStatus.value === 'Inactive')

// Check if user is admin
const { isAdmin } = useUserRoles()

// Get user's roles for this account
const userAccountRoles = computed<RoleLink[]>(() => {
  if (!accountId.value) return []

  const roles: RoleLink[] = []

  // Search through roleGroups for roles matching this account (commercial or GovCloud)
  Object.values(userGroupStore.roleGroups).forEach(roleGroup => {
    // Check if this role group is for the commercial account
    if (roleGroup.accountId === accountId.value) {
      roles.push(getIdcRoleLink(accountId.value, roleGroup.role, false))
    }

    // Check if this role group is for the GovCloud account
    if (govCloudId.value && roleGroup.accountId === govCloudId.value) {
      roles.push(getIdcRoleLink(govCloudId.value, roleGroup.role, true))
    }
  })

  return roles
})

// AWS Console menu items
const consoleMenuItems = computed(() => {
  if (!accountId.value) return []

  // Build menu items as array of arrays (each array is a section)
  const menuItems = []

  // User's Role Links - Primary access method
  if (userAccountRoles.value.length > 0) {
    const roleSection = [
      {
        label: 'My Roles',
        slot: 'header'
      },
      ...userAccountRoles.value.map(roleLink => ({
        label: roleLink.label,
        icon: roleLink.icon,
        href: roleLink.url,
        target: '_blank'
      }))
    ]
    menuItems.push(roleSection)
  }

  // Admin Support Roles (for central auditing accounts)
  if (isAdmin.value) {
    const targetName = accountName.value || undefined
    const supportRoles = getAdminSupportRoles(accountId.value, govCloudId.value, targetName)
    const supportSection = [
      {
        label: 'Support Roles',
        slot: 'header'
      },
      ...supportRoles.map(roleLink => ({
        label: roleLink.label,
        icon: roleLink.icon,
        href: roleLink.url,
        target: '_blank'
      }))
    ]
    menuItems.push(supportSection)
  }

  // IDC Portal Home - fallback option
  const hasGovCloud = !!govCloudId.value
  const idcLink = getIdcLoginLink(hasGovCloud)
  menuItems.push([
    {
      label: idcLink.label,
      icon: idcLink.icon,
      href: idcLink.url,
      target: '_blank'
    }
  ])

  return menuItems
})

// Tabs configuration
const selectedTab = ref(0)
const tabs = computed(() => {
  const baseTabs = [
    {
      label: 'Overview',
      slot: 'overview',
      icon: 'i-heroicons-home',
      disabled: false
    },
    {
      label: 'Resources',
      slot: 'resources',
      icon: 'i-heroicons-server-stack',
      disabled: isAccountInactive.value
    },
    {
      label: 'Policies',
      slot: 'policies',
      icon: 'i-heroicons-shield-check',
      disabled: isAccountInactive.value
    }
  ]

  // Add Notes tab for admins only
  if (isAdmin.value) {
    baseTabs.push({
      label: 'Notes',
      slot: 'notes',
      icon: 'i-heroicons-document-text',
      disabled: false
    })
  }

  return baseTabs
})

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
  const tab = tabs.value.find((t, index) => index === selectedTab.value)
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

  // Track account visit in recent accounts
  if (accountId.value) {
    addRecentAccount(accountId.value).catch(err => {
      console.warn('Failed to track recent account:', err)
    })
  }

  // Check for tab query parameter from shared link
  const tabParam = route.query.tab
  if (tabParam !== undefined && tabParam !== null) {
    const tabIndex = parseInt(tabParam as string)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.value.length) {
      selectedTab.value = tabIndex
    }
  }

  try {
    // Skip data fetching for inactive/decommissioned accounts
    if (isAccountInactive.value) {
      console.log(`Account ${accountId.value} is ${accountStatus.value}, skipping data fetch`)
      loading.value = false
      return
    }

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
