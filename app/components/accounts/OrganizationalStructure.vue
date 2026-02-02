<template>
  <UCard class="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-building-office-2" class="text-purple-500 w-5 h-5" />
        <h3 class="font-semibold text-lg">Organizational Structure</h3>
      </div>
    </template>

    <div v-if="loading" class="flex items-center justify-center py-8">
      <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
    </div>

    <div v-else-if="error" class="text-red-600 dark:text-red-400 text-sm">
      {{ error }}
    </div>

    <div v-else-if="!orgData" class="text-gray-600 dark:text-gray-400 text-sm">
      No organizational data available
    </div>

    <div v-else class="space-y-6">
      <!-- Environment Tabs if both exist -->
      <div v-if="hasMultipleEnvironments" class="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
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

      <!-- OU Hierarchy -->
      <div v-if="currentOrgContext?.ouHierarchy">
        <div class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3">Organization Path</div>
        <div class="space-y-2">
          <div
            v-for="(ou, index) in currentOrgContext.ouHierarchy"
            :key="ou.id"
            class="flex items-center gap-2"
          >
            <!-- Indent based on level -->
            <div :style="{ marginLeft: `${index * 16}px` }" class="flex items-center gap-2 flex-1">
              <UIcon
                :name="ou.type === 'Root' ? 'i-heroicons-home' : 'i-heroicons-folder'"
                class="w-4 h-4"
                :class="ou.type === 'Root' ? 'text-yellow-500 dark:text-yellow-400' : 'text-blue-500 dark:text-blue-400'"
              />
              <span class="text-sm text-gray-700 dark:text-gray-300">{{ ou.name }}</span>
              <UBadge
                v-if="index === 0"
                color="gray"
                variant="soft"
                size="xs"
                label="Root"
              />
            </div>
          </div>

          <!-- Current Location -->
          <div
            v-if="currentOrgContext.accountLocation"
            class="flex items-center gap-2 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-700/30 rounded p-2"
            :style="{ marginLeft: `${currentOrgContext.ouHierarchy.length * 16}px` }"
          >
            <UIcon name="i-heroicons-map-pin" class="w-4 h-4 text-green-500 dark:text-green-400" />
            <span class="text-sm font-medium text-green-700 dark:text-green-300">{{ currentOrgContext.accountLocation.name }}</span>
            <UBadge color="green" variant="soft" size="xs" label="Current Location" />
          </div>
        </div>
      </div>

      <!-- Quick Stats -->
      <div v-if="currentOrgContext" class="grid grid-cols-2 gap-3">
        <div class="bg-gray-100 dark:bg-gray-800/50 rounded p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400">OU Depth</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ currentOrgContext.ouHierarchy?.length || 0 }}
          </div>
        </div>
        <div class="bg-gray-100 dark:bg-gray-800/50 rounded p-3">
          <div class="text-xs text-gray-600 dark:text-gray-400">Total Policies</div>
          <div class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ (currentOrgContext.directPolicies?.length || 0) + (currentOrgContext.inheritedPolicies?.length || 0) }}
          </div>
        </div>
      </div>
    </div>
  </UCard>
</template>

<script setup lang="ts">
const props = defineProps<{
  accountId: string
}>()

interface OrgContext {
  accountLocation: {
    id: string
    arn: string
    name: string
  }
  ouHierarchy: Array<{
    id: string
    name: string
    type: string
  }>
  directPolicies: any[]
  inheritedPolicies: any[]
  allPolicies: any[]
}

const loading = ref(true)
const error = ref<string | null>(null)
const orgData = ref<any>(null)
const selectedEnvironment = ref<'commercial' | 'govcloud'>('govcloud')

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

onMounted(async () => {
  try {
    loading.value = true
    const response = await fetch(`/api/organization/accounts/${props.accountId}/governance`)
    const data = await response.json()

    if (!data.success) {
      throw new Error(data.message || 'Failed to fetch organizational data')
    }

    orgData.value = data

    // Set initial environment based on available data
    if (data.data?.organizationalContext?.govcloud) {
      selectedEnvironment.value = 'govcloud'
    } else if (data.data?.organizationalContext?.commercial) {
      selectedEnvironment.value = 'commercial'
    }
  } catch (err: any) {
    error.value = err.message || 'Failed to load organizational structure'
    console.error('Error fetching organizational data:', err)
  } finally {
    loading.value = false
  }
})
</script>
