<template>
  <UCard class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-shield-check" class="text-blue-500 w-5 h-5" />
          <h3 class="font-semibold text-lg">Security Policies</h3>
        </div>
        <div class="flex items-center gap-2">
          <UButton
            v-if="totalPolicies > 0"
            icon="i-heroicons-wrench-screwdriver"
            color="blue"
            size="sm"
            @click="showAnalyzer = true"
          >
            Troubleshoot
          </UButton>
          <UBadge v-if="totalPolicies > 0" color="blue" variant="soft">
            {{ totalPolicies }}
          </UBadge>
        </div>
      </div>
    </template>

    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
    </div>

    <div v-else-if="error" class="text-red-600 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-else-if="!orgData" class="text-gray-600 dark:text-gray-400 text-sm">
      No policy data available
    </div>

    <div v-else class="space-y-4">
      <!-- Environment Tabs if both exist -->
      <div v-if="hasMultipleEnvironments" class="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-4">
        <button
          v-for="env in availableEnvironments"
          :key="env"
          @click="selectedEnvironment = env"
          class="px-3 py-1.5 text-sm rounded-t transition-colors"
          :class="selectedEnvironment === env
            ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-b-2 border-blue-500 dark:border-blue-400'
            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-300'"
        >
          {{ env === 'govcloud' ? 'GovCloud' : 'Commercial' }}
        </button>
      </div>

      <!-- Policy Summary -->
      <div v-if="totalPolicies > 0" class="space-y-2">
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600 dark:text-gray-400">Direct Policies</span>
          <span class="font-medium text-orange-600 dark:text-orange-300">{{ currentOrgContext?.directPolicies?.length || 0 }}</span>
        </div>
        <div class="flex items-center justify-between text-sm">
          <span class="text-gray-600 dark:text-gray-400">Inherited Policies</span>
          <span class="font-medium text-blue-600 dark:text-blue-300">{{ currentOrgContext?.inheritedPolicies?.length || 0 }}</span>
        </div>
      </div>

      <!-- Policy List (Compact) -->
      <div v-if="totalPolicies > 0" class="space-y-1">
        <div
          v-for="policy in allPoliciesCompact"
          :key="policy.id"
          class="flex items-center justify-between py-2 px-3 rounded hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1">
            <UIcon
              :name="policy.source === 'direct' ? 'i-heroicons-paper-clip' : 'i-heroicons-arrow-down-on-square'"
              :class="policy.source === 'direct' ? 'text-orange-500 dark:text-orange-400' : 'text-blue-500 dark:text-blue-400'"
              class="w-4 h-4 flex-shrink-0"
            />
            <span class="text-sm text-gray-900 dark:text-white truncate">{{ policy.name }}</span>
          </div>
          <UBadge
            :color="policy.source === 'direct' ? 'orange' : 'blue'"
            variant="soft"
            size="xs"
          >
            {{ policy.source === 'direct' ? 'Direct' : policy.attachedAt }}
          </UBadge>
        </div>
      </div>

      <!-- No Policies Message -->
      <div v-if="totalPolicies === 0" class="text-center py-8 text-gray-600 dark:text-gray-400">
        <UIcon name="i-heroicons-shield-check" class="w-12 h-12 mx-auto mb-2 text-green-500 dark:text-green-400 opacity-50" />
        <p class="text-sm">No security policies applied</p>
      </div>
    </div>

    <!-- Policy Troubleshooter Modal -->
    <PolicyAnalyzerSimple
      v-model="showAnalyzer"
      :account-id="accountId"
      :environment="selectedEnvironment"
    />
  </UCard>
</template>

<script setup lang="ts">
const logger = createLogger('ServiceControlPolicies')

const props = defineProps<{
  accountId: string
}>()

interface Policy {
  id: string
  name: string
  description: string
  type: string
  source: string
  attachedAt: string
}

interface OrgContext {
  directPolicies: Policy[]
  inheritedPolicies: Policy[]
  allPolicies: Policy[]
}

const loading = ref(true)
const error = ref<string | null>(null)
const orgData = ref<any>(null)
const selectedEnvironment = ref<'commercial' | 'govcloud'>('govcloud')
const showAnalyzer = ref(false)

const availableEnvironments = computed(() => {
  return orgData.value?.data?.summary?.availableEnvironments || []
})

const hasMultipleEnvironments = computed(() => {
  return availableEnvironments.value.length > 1
})

const currentOrgContext = computed((): OrgContext | null => {
  if (!orgData.value?.data?.organizationalContext) return null
  return orgData.value.data.organizationalContext[selectedEnvironment.value] || null
})

const totalPolicies = computed(() => {
  if (!currentOrgContext.value) return 0
  return (currentOrgContext.value.directPolicies?.length || 0) +
         (currentOrgContext.value.inheritedPolicies?.length || 0)
})

// All policies in compact view (excluding FullAWSAccess)
const allPoliciesCompact = computed(() => {
  if (!currentOrgContext.value) return []

  const direct = (currentOrgContext.value.directPolicies || [])
    .filter((p: Policy) => p.name !== 'FullAWSAccess')
    .map((p: Policy) => ({
      ...p,
      source: 'direct' as const
    }))

  const inherited = (currentOrgContext.value.inheritedPolicies || [])
    .filter((p: Policy) => p.name !== 'FullAWSAccess')
    .map((p: Policy) => ({
      ...p,
      source: 'inherited' as const
    }))

  return [...direct, ...inherited]
})

onMounted(async () => {
  try {
    loading.value = true
    const response = await fetch(`/api/organization/accounts/${props.accountId}/governance`)
    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch policy data')
    }

    orgData.value = data

    // Set initial environment based on available data
    if (data.data?.organizationalContext?.govcloud) {
      selectedEnvironment.value = 'govcloud'
    } else if (data.data?.organizationalContext?.commercial) {
      selectedEnvironment.value = 'commercial'
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to load service control policies'
    logger.error('Error fetching policy data:', err)
  } finally {
    loading.value = false
  }
})
</script>
