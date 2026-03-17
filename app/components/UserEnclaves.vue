<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5">
    <!-- Section Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-building-office-2" class="w-5 h-5 text-blue-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">My Accounts</h2>
        <UBadge v-if="tableData.length > 0" color="blue" variant="soft" size="xs">{{ tableData.length }}</UBadge>
      </div>
      <NuxtLink v-if="tableData.length > 0" to="/account/explorer" class="text-xs text-blue-500 hover:text-blue-400 transition-colors">
        View All →
      </NuxtLink>
    </div>

    <!-- Loading skeleton -->
    <div v-if="props.loading" :class="[
      'grid gap-3',
      props.displayStyle === 'compact' ? 'grid-cols-1' :
      props.displayStyle === 'half' ? 'grid-cols-1 sm:grid-cols-2' :
      'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
    ]">
      <div v-for="i in (props.displayStyle === 'compact' ? 2 : 4)" :key="i" class="rounded-xl border border-gray-200 dark:border-gray-800 p-4 animate-pulse">
        <div class="flex items-center justify-between mb-3">
          <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
          <div class="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
        <div class="h-3 w-48 bg-gray-200 dark:bg-gray-700 rounded mb-3" />
        <div class="flex gap-1.5">
          <div class="h-5 w-16 bg-gray-200 dark:bg-gray-700 rounded-full" />
          <div class="h-5 w-20 bg-gray-200 dark:bg-gray-700 rounded-full" />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="tableData.length === 0" class="py-8 text-center">
      <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <UIcon name="i-heroicons-folder-open" class="w-6 h-6 text-gray-400" />
      </div>
      <h3 class="text-sm font-medium text-gray-900 dark:text-gray-300 mb-1">No Account Access</h3>
      <p class="text-gray-500 dark:text-gray-400 text-xs max-w-xs mx-auto">
        You don't have access to any AWS accounts yet. Contact your administrator to request access.
      </p>
    </div>

    <!-- Compact mini-tiles: 2-col grid of small squares when >2 accounts -->
    <div v-else-if="props.displayStyle === 'compact' && displayedAccounts.length > 2" class="grid grid-cols-2 gap-2">
      <NuxtLink
        v-for="enclave in displayedAccounts"
        :key="enclave.standardId"
        :to="`/account/${enclave.standardId}`"
        class="group rounded-lg border border-gray-200 dark:border-gray-700 p-2.5 transition-all duration-150 hover:border-blue-500/50 hover:bg-gray-50 dark:hover:bg-gray-700/50"
      >
        <div class="flex items-center gap-1.5 mb-1">
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :class="enclave.environment === 'GovCloud' ? 'bg-orange-400' : 'bg-blue-400'"
          />
          <span class="text-xs font-semibold text-gray-900 dark:text-white truncate group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
            {{ enclave.projectName }}
          </span>
        </div>
        <span class="text-[10px] font-mono text-gray-400 dark:text-gray-500">{{ enclave.standardId }}</span>
      </NuxtLink>
      <NuxtLink
        v-if="hiddenCount > 0"
        to="/account/explorer"
        class="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-2.5 flex items-center justify-center text-xs text-gray-400 hover:text-blue-500 hover:border-blue-500/50 transition-colors"
      >
        +{{ hiddenCount }} more
      </NuxtLink>
    </div>

    <!-- Full account cards for non-compact or compact with ≤2 accounts -->
    <div v-else :class="[
      'grid gap-3 overflow-y-auto',
      props.displayStyle === 'compact' ? 'grid-cols-1 max-h-[280px]' :
      props.displayStyle === 'half' ? 'max-h-[400px]' :
      'max-h-[500px]',
      props.displayStyle === 'half' ? (displayedAccounts.length === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2') :
      displayedAccounts.length === 1 ? 'grid-cols-1 max-w-lg' :
      displayedAccounts.length === 2 ? 'grid-cols-1 sm:grid-cols-2' :
      'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
    ]">
      <NuxtLink
        v-for="enclave in displayedAccounts"
        :key="enclave.standardId"
        :to="`/account/${enclave.standardId}`"
        class="group relative rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 transition-all duration-200 hover:border-blue-500/50 hover:shadow-md hover:shadow-blue-500/5 hover:-translate-y-0.5"
      >
        <!-- Top row: name + environment badge -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors leading-tight">
            {{ enclave.projectName }}
          </h3>
          <UBadge
            :color="enclave.environment === 'GovCloud' ? 'orange' : 'blue'"
            variant="subtle"
            size="xs"
            class="shrink-0"
          >
            {{ enclave.environment === 'GovCloud' ? 'GovCloud' : 'Commercial' }}
          </UBadge>
        </div>

        <!-- Account IDs -->
        <div class="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
          <span class="font-mono text-blue-400/80">{{ enclave.standardId }}</span>
          <span v-if="enclave.govcloudId" class="font-mono text-orange-400/80">{{ enclave.govcloudId }}</span>
        </div>

        <!-- Roles -->
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="role in visibleRoles(enclave)"
            :key="role"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"
          >
            <span
              class="w-1.5 h-1.5 rounded-full"
              :class="role.includes(GOV_IDENTIFIER) ? 'bg-orange-400' : 'bg-blue-400'"
            />
            {{ role.split(' |')[0] }}
          </span>
          <button
            v-if="!isExpanded(enclave) && enclave.roles.length > 3"
            @click.prevent="setExpanded(enclave)"
            class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            +{{ enclave.roles.length - 3 }}
          </button>
        </div>

        <!-- Hover arrow indicator -->
        <UIcon
          name="i-heroicons-arrow-right"
          class="absolute top-4 right-4 w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
        />
      </NuxtLink>
    </div>

    <!-- Show count of hidden accounts when truncated (non-compact only, compact has inline "+X more" tile) -->
    <div v-if="!props.loading && hiddenCount > 0 && !(props.displayStyle === 'compact' && displayedAccounts.length > 2)" class="mt-3 text-center">
      <NuxtLink to="/account/explorer" class="text-xs text-gray-400 hover:text-blue-500 transition-colors">
        +{{ hiddenCount }} more account{{ hiddenCount !== 1 ? 's' : '' }}
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
const userGroupStore = useUserGroupStore()

const props = defineProps<{
  loading: boolean
  displayStyle?: 'full' | 'half' | 'compact'
}>()

const GOV_IDENTIFIER = ' | gov'
const COMM_IDENTIFIER = ' | comm'

// Keep track of which rows have expanded roles
const expanded = ref<Set<string>>(new Set())

function isExpanded(row: any) {
  return expanded.value.has(row.standardId)
}

function setExpanded(row: any) {
  expanded.value.add(row.standardId)
}

function visibleRoles(row: any) {
  return isExpanded(row) ? row.roles : row.roles.slice(0, 3)
}

const tableData = computed(() => {
  if (!userGroupStore.myEnclaves) return []
  return Object.values(userGroupStore.myEnclaves)
})

// Cap visible accounts per display style to prevent unbounded growth
const displayedAccounts = computed(() => {
  const all = tableData.value
  if (props.displayStyle === 'compact') return all.slice(0, 6)
  if (props.displayStyle === 'half') return all.slice(0, 6)
  return all.slice(0, 9)
})

const hiddenCount = computed(() => tableData.value.length - displayedAccounts.value.length)
</script>
