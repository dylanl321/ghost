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
    <UCard data-tour="account-header">
      <div class="flex gap-2 items-center justify-between">
        <div class="flex gap-2 items-center">
          <div :class="`w-3 h-3 rounded-full ${accountStatus !== 'Decommissioned' ? 'bg-green-500' : 'bg-red-500'}`" />
          <h1 class="font-semibold text-2xl text-gray-900 dark:text-white">{{ accountName ?? "Loading..." }}</h1>
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
          <span data-tour="account-docs-link">
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
          </span>
          <UTooltip text="Start Guided Tour">
            <UButton
              icon="i-heroicons-sparkles"
              color="gray"
              variant="ghost"
              size="sm"
              @click="handleStartAccountTour"
            />
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
    <UTabs v-model="selectedTab" :items="tabs" data-tour="account-tabs">
      <!-- Overview Tab -->
      <template #overview>
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 row-auto">
          <!-- Account Details -->
          <div data-tour="account-details" class="col-span-1 lg:col-span-2">
            <AccountDetails v-if="accountId" :account-id="accountId" :current-spend="currentSpend" :users="users" />
          </div>

          <!-- Budget Health - with overlay for inactive accounts -->
          <div class="col-span-1" data-tour="account-budget">
            <InactiveAccountOverlay :active="isAccountInactive" :status="accountStatus" message="Cost data is not available for inactive accounts">
              <BudgetHealthCard
                :budget="budget"
                :current-spend="currentSpend"
                :forecast-data="forecastData"
                :daily-costs="proformaTimeSeries"
                :loading="loading"
                :class="{ 'opacity-50 pointer-events-none': isAccountInactive }"
              />
            </InactiveAccountOverlay>
          </div>

          <!-- Account Users -->
          <div class="col-span-1" data-tour="account-users">
            <AccountUsers :users="users" :account-id="accountId" :loading="loading" />
          </div>

          <!-- Cost Trend Chart - with overlay for inactive accounts -->
          <div class="col-span-1 lg:col-span-2" data-tour="account-cost-trend">
            <InactiveAccountOverlay :active="isAccountInactive" :status="accountStatus" message="Cost trends are not available for inactive accounts">
              <CostTrendChart
                title="Account Cost Trends"
                :time-series-billable="billableTimeSeries"
                :time-series-proforma="proformaTimeSeries"
                :loading="loading"
                :date-range="costDays"
                :date-range-options="dateRangeOptions"
                :class="{ 'opacity-50 pointer-events-none': isAccountInactive }"
                @update:date-range="handleDateRangeChange"
              />
            </InactiveAccountOverlay>
          </div>

          <!-- Budget Alert History - full width -->
          <div v-if="accountId" class="col-span-1 lg:col-span-3" data-tour="account-alerts">
            <AccountAlertHistory :account-id="accountId" />
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
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Resources Unavailable</h3>
            <p class="text-gray-600 dark:text-gray-400">This tab is disabled because the account is {{ accountStatus?.toLowerCase() }}.</p>
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
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Policies Unavailable</h3>
            <p class="text-gray-600 dark:text-gray-400">This tab is disabled because the account is {{ accountStatus?.toLowerCase() }}.</p>
          </div>
        </div>
      </template>

      <!-- Security Tab -->
      <template #security>
        <div v-if="!isAccountInactive">
          <AccountSecurityDashboard v-if="accountId" :account-id="accountId" />
        </div>
        <div v-else class="flex items-center justify-center py-16 mt-4">
          <div class="text-center">
            <UIcon name="i-heroicons-shield-exclamation" class="w-16 h-16 text-gray-500 mx-auto mb-4 opacity-50" />
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">Security Unavailable</h3>
            <p class="text-gray-600 dark:text-gray-400">This tab is disabled because the account is {{ accountStatus?.toLowerCase() }}.</p>
          </div>
        </div>
      </template>

      <!-- Pipelines Tab -->
      <template #pipelines>
        <div class="mt-4">
          <UAlert color="blue" icon="i-heroicons-clock" variant="soft" class="mb-4">
            <template #title>Pipeline Data Loading</template>
            <template #description>
              Pipeline data is queried from AWS Athena and may take 30-60 seconds to load initially.
              Data is cached for 5 minutes to improve subsequent load times.
            </template>
          </UAlert>
          <PipelinesDashboard v-if="accountId" :account-id="accountId" />
        </div>
      </template>

      <!-- Notes Tab (Admin Only) -->
      <template #notes>
        <div class="mt-4">
          <AccountNotesPanel v-if="accountId && isAdmin" :account-id="accountId" />
        </div>
      </template>

      <!-- Settings Tab (Account Admin) -->
      <template #settings>
        <div class="mt-4">
          <AccountSettingsPanel v-if="accountId" :account-id="accountId" :environment="govCloudId ? 'govcloud' : 'commercial'" />
        </div>
      </template>
    </UTabs>
  </div>
</template>

<script setup lang="ts">
import { getIdcRoleLink, getIdcLoginLink, getAdminSupportRoles, type RoleLink } from '~/utils/awsConsoleLinks'

definePageMeta({
  keepalive: false
})

const route = useRoute()
const router = useRouter()
const enclaveStore = useEnclaveStore()
const userGroupStore = useUserGroupStore()
const favoritesComposable = useFavoriteAccounts()
const { addRecentAccount } = useRecentAccounts()

const accountId = computed(() => route.params.id as string)
const govCloudId = computed(() => enclaveStore.enclaves[accountId.value]?.awsGovCloudAccountID)
const accountName = computed(() => enclaveStore.enclaves[accountId.value]?.projectName)
const accountStatus = computed(() => enclaveStore.enclaves[accountId.value]?.enclaveStatus)
const isAccountInactive = computed(() => accountStatus.value === 'Decommissioned' || accountStatus.value === 'Inactive')

const { isAdmin } = useUserRoles()
const isAccountAdmin = computed(() =>
  isAdmin.value || userGroupStore.myAdminAccountIds.includes(accountId.value)
)
const { getPreference, setPreference, initialized: prefsInitialized, load: loadPrefs } = useUserPreferences()

// Cost trend date range
const costDays = ref(14)
const dateRangeOptions = [
  { label: '7D', value: 7 },
  { label: '14D', value: 14 },
  { label: '30D', value: 30 },
  { label: '90D', value: 90 },
]

function handleDateRangeChange(days: number) {
  costDays.value = days
  setPreference('costTrendDays', days)
  fetchAccountData()
}

// Tour composable
const { startTour: handleStartAccountTour, maybeAutoStart: maybeAutoStartTour } = useAccountTour()

// Data fetching composable
const {
  users,
  resourceCounts,
  forecastData,
  loading,
  currentSpend,
  budget,
  billableTimeSeries,
  proformaTimeSeries,
  fetchAll: fetchAccountData,
} = useAccountData(accountId, govCloudId, isAccountInactive, costDays)

// Get user's roles for this account
const userAccountRoles = computed<RoleLink[]>(() => {
  if (!accountId.value) return []

  const roles: RoleLink[] = []
  Object.values(userGroupStore.roleGroups).forEach(roleGroup => {
    if (roleGroup.accountId === accountId.value) {
      roles.push(getIdcRoleLink(accountId.value, roleGroup.role, false))
    }
    if (govCloudId.value && roleGroup.accountId === govCloudId.value) {
      roles.push(getIdcRoleLink(govCloudId.value, roleGroup.role, true))
    }
  })
  return roles
})

// AWS Console menu items
const consoleMenuItems = computed(() => {
  if (!accountId.value) return []

  const menuItems = []

  if (userAccountRoles.value.length > 0) {
    menuItems.push([
      { label: 'My Roles', slot: 'header' },
      ...userAccountRoles.value.map(roleLink => ({
        label: roleLink.label,
        icon: roleLink.icon,
        href: roleLink.url,
        target: '_blank',
      })),
    ])
  }

  if (isAdmin.value) {
    const targetName = accountName.value || undefined
    const supportRoles = getAdminSupportRoles(accountId.value, govCloudId.value, targetName)
    menuItems.push([
      { label: 'Support Roles', slot: 'header' },
      ...supportRoles.map(roleLink => ({
        label: roleLink.label,
        icon: roleLink.icon,
        href: roleLink.url,
        target: '_blank',
      })),
    ])
  }

  const hasGovCloud = !!govCloudId.value
  const idcLink = getIdcLoginLink(hasGovCloud)
  menuItems.push([{
    label: idcLink.label,
    icon: idcLink.icon,
    href: idcLink.url,
    target: '_blank',
  }])

  return menuItems
})

// Tabs configuration
const selectedTab = ref(0)
const tabs = computed(() => {
  const baseTabs = [
    { label: 'Overview', slot: 'overview', icon: 'i-heroicons-home', disabled: false },
    { label: 'Resources', slot: 'resources', icon: 'i-heroicons-server-stack', disabled: isAccountInactive.value },
    { label: 'Policies', slot: 'policies', icon: 'i-heroicons-shield-check', disabled: isAccountInactive.value },
    { label: 'Security', slot: 'security', icon: 'i-heroicons-shield-exclamation', disabled: isAccountInactive.value },
  ]

  if (isAdmin.value) {
    baseTabs.push({ label: 'Pipelines', slot: 'pipelines', icon: 'i-heroicons-arrow-path', disabled: false })
    baseTabs.push({ label: 'Notes', slot: 'notes', icon: 'i-heroicons-document-text', disabled: false })
  }

  if (isAccountAdmin.value) {
    baseTabs.push({ label: 'Settings', slot: 'settings', icon: 'i-heroicons-cog-6-tooth', disabled: false })
  }

  return baseTabs
})

const currentTabName = computed(() => {
  const tab = tabs.value.find((_, index) => index === selectedTab.value)
  return tab?.label || 'Overview'
})

const navigateToCostsPage = () => {
  if (!accountId.value) return
  router.push({
    path: '/account/costs',
    query: {
      accounts: JSON.stringify([accountId.value]),
      timeframe: 'thisMonth',
      tab: 'all',
    },
  })
}

// Check if URL has GovCloud ID and redirect to commercial ID
function checkAndRedirectIfGovCloudId() {
  const urlId = route.params.id as string
  if (enclaveStore.enclaves[urlId]) return

  const enclave = Object.values(enclaveStore.enclaves).find(
    (enc: any) => enc.awsGovCloudAccountID === urlId,
  )

  if (enclave) {
    const commercialId = enclave.accountId || enclave.awsStandardAccountID
    if (commercialId) {
      router.replace(`/account/${commercialId}`)
    }
  }
}

onMounted(async () => {
  checkAndRedirectIfGovCloudId()

  // Load saved date range preference
  if (!prefsInitialized.value) await loadPrefs()
  costDays.value = getPreference('costTrendDays', 14)

  // Track recent account visit (fire-and-forget)
  if (accountId.value) {
    addRecentAccount(accountId.value).catch(() => {})
  }

  // Tour auto-start (handles preference loading internally)
  maybeAutoStartTour()

  // Deep-link to tab from shared link query param (supports both numeric index and slot name)
  const tabParam = route.query.tab as string | undefined
  if (tabParam) {
    const tabIndex = parseInt(tabParam)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.value.length) {
      selectedTab.value = tabIndex
    } else {
      const matchIndex = tabs.value.findIndex(t => t.slot === tabParam)
      if (matchIndex !== -1) {
        selectedTab.value = matchIndex
      }
    }
  }

  // Fetch page data
  await fetchAccountData()
})
</script>
