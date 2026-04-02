<script setup lang="ts">
// Page setup
const route = useRoute()
const accountId = computed(() => route.params.id as string)
const instanceId = computed(() => route.params.instanceId as string)

// Account context
const { enhancedAccountInfo, initialize: initAccountInfo } = useAccountInfo(accountId)

// Instance data
const {
  instance, optimization, tagSuggestions, health, utilization,
  loading, error, instanceName, instanceState, environment,
  fetchAll, refresh,
} = useInstanceDetails(instanceId, accountId)

definePageMeta({
  keepalive: false,
  title: 'Instance Details',
  description: 'Comprehensive EC2 instance details and health',
})

// Breadcrumb
const breadcrumbItems = computed(() => [
  { label: 'Accounts', to: '/account/explorer' },
  {
    label: enhancedAccountInfo.value?.displayName || `Account ${accountId.value}`,
    to: `/account/${accountId.value}`,
  },
  {
    label: instanceName.value,
    current: true,
    icon: 'i-heroicons-server',
  },
])

// Tabs
const tabs = [
  { slot: 'overview', label: 'Overview', icon: 'i-heroicons-home' },
  { slot: 'networking', label: 'Networking', icon: 'i-heroicons-globe-alt' },
  { slot: 'security', label: 'Security', icon: 'i-heroicons-shield-exclamation' },
  { slot: 'monitoring', label: 'Monitoring', icon: 'i-heroicons-chart-bar' },
  { slot: 'patching', label: 'Patching', icon: 'i-heroicons-wrench-screwdriver' },
  { slot: 'tags', label: 'Tags', icon: 'i-heroicons-tag' },
  { slot: 'costs', label: 'Costs', icon: 'i-heroicons-currency-dollar' },
]

const selectedTab = ref(0)

// Handle tab from query param
const initialTab = route.query.tab as string
if (initialTab) {
  const idx = tabs.findIndex(t => t.slot === initialTab)
  if (idx >= 0) selectedTab.value = idx
}

// AWS Console link
const consoleUrl = computed(() => {
  if (!instance.value) return ''
  const region = instance.value.region || 'us-gov-west-1'
  const partition = environment.value === 'govcloud' ? 'amazonaws-us-gov' : 'aws.amazon'
  return `https://${region}.console.${partition}.com/ec2/home?region=${region}#InstanceDetails:instanceId=${instanceId.value}`
})

onMounted(async () => {
  await initAccountInfo()
  await fetchAll()
})
</script>

<template>
  <div class="max-w-[1600px] mx-auto space-y-4 p-4">
    <!-- Breadcrumb -->
    <UBreadcrumb :items="breadcrumbItems" />

    <!-- Header Card -->
    <UCard>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <UIcon name="i-heroicons-server" class="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <div class="flex items-center gap-3">
              <h1 class="text-xl font-bold text-gray-900 dark:text-white">
                {{ instanceName }}
              </h1>
              <InstanceStateBadge v-if="!loading && instanceState !== 'unknown'" :state="instanceState" />
              <UBadge v-if="environment === 'govcloud'" color="blue" variant="soft" size="xs">GovCloud</UBadge>
              <UBadge v-else color="green" variant="soft" size="xs">Commercial</UBadge>
            </div>
            <div class="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
              <span class="font-mono">{{ instanceId }}</span>
              <span v-if="instance?.instanceType">
                <UBadge color="gray" variant="soft" size="xs">{{ instance.instanceType }}</UBadge>
              </span>
              <span v-if="instance?.region">{{ instance.region }}</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="flex items-center gap-2">
          <UButton
            icon="i-heroicons-arrow-path"
            color="gray"
            variant="ghost"
            size="sm"
            :loading="loading"
            @click="refresh"
          >
            Refresh
          </UButton>
          <UButton
            v-if="consoleUrl"
            icon="i-heroicons-arrow-top-right-on-square"
            color="gray"
            variant="soft"
            size="sm"
            :to="consoleUrl"
            target="_blank"
          >
            AWS Console
          </UButton>
          <UButton
            icon="i-heroicons-clipboard-document"
            color="gray"
            variant="ghost"
            size="sm"
            @click="navigator.clipboard.writeText(instanceId)"
          >
            Copy ID
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- Loading State -->
    <CenteredLoadingSpinner v-if="loading" />

    <!-- Error State -->
    <UCard v-else-if="error && !instance">
      <div class="text-center py-8">
        <UIcon name="i-heroicons-exclamation-triangle" class="w-12 h-12 text-red-400 mx-auto mb-3" />
        <p class="text-red-600 dark:text-red-400 font-medium">{{ error }}</p>
        <UButton color="gray" variant="soft" class="mt-4" @click="refresh">Try Again</UButton>
      </div>
    </UCard>

    <!-- Tabs -->
    <UTabs v-else-if="instance" v-model="selectedTab" :items="tabs" class="w-full">
      <template #overview>
        <InstanceOverview
          :instance="instance"
          :health="health"
          :utilization="utilization"
          :optimization="optimization"
        />
      </template>

      <template #networking>
        <InstanceNetworking :instance="instance" />
      </template>

      <template #security>
        <InstanceSecurity :health="health" :instance-id="instanceId" />
      </template>

      <template #monitoring>
        <InstanceMonitoring
          :utilization="utilization"
          :health="health"
          :instance="instance"
        />
      </template>

      <template #patching>
        <InstancePatching :health="health" :instance="instance" />
      </template>

      <template #tags>
        <InstanceTags
          :instance="instance"
          :tag-suggestions="tagSuggestions"
          :instance-id="instanceId"
          :environment="environment"
          @refresh="refresh"
        />
      </template>

      <template #costs>
        <InstanceCosts :instance="instance" :optimization="optimization" />
      </template>
    </UTabs>
  </div>
</template>
