<template>
  <div v-if="newAccounts.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-sparkles" class="w-5 h-5 text-blue-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">New Accounts</h2>
        <UBadge size="xs" color="blue" variant="subtle">{{ newAccounts.length }}</UBadge>
      </div>
      <span class="text-xs text-gray-400 dark:text-gray-500">Last 90 days</span>
    </div>

    <!-- Compact: just a count badge -->
    <template v-if="displayStyle === 'compact'">
      <div class="flex items-center gap-3">
        <UBadge size="sm" color="blue" variant="subtle">{{ newAccounts.length }} new</UBadge>
        <span class="text-xs text-gray-500 dark:text-gray-400">in the last 90 days</span>
        <NuxtLink to="/account/explorer" class="text-xs text-blue-500 hover:text-blue-400 font-medium ml-auto">View →</NuxtLink>
      </div>
    </template>
    <!-- Normal list -->
    <template v-else>
      <div class="space-y-1">
        <NuxtLink
          v-for="account in displayedAccounts"
          :key="account.accountId"
          :to="`/account/${account.accountId}`"
          class="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-center gap-3 min-w-0">
            <UIcon name="i-heroicons-building-office-2" class="w-4 h-4 text-gray-400 flex-shrink-0" />
            <div class="min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
                {{ account.projectName || account.accountName || account.accountId }}
              </p>
              <p class="text-xs text-gray-400 dark:text-gray-500">{{ account.accountId }}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-3">
            <span class="text-[11px] text-gray-400 dark:text-gray-500">Joined {{ daysAgo(account.joinedTimestamp!) }}d ago</span>
            <UBadge
              size="xs"
              :color="account.accountStatus === 'ACTIVE' ? 'green' : 'gray'"
              variant="subtle"
            >
              {{ account.accountStatus || 'Unknown' }}
            </UBadge>
          </div>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = withDefaults(defineProps<{
  displayStyle?: DisplayStyle
}>(), { displayStyle: 'full' })

const enclaveStore = useEnclaveStore()

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

const newAccounts = computed(() => {
  const now = Date.now()
  const cutoff = now - NINETY_DAYS_MS

  return Object.values(enclaveStore.enclaves)
    .filter(e => {
      if (!e.joinedTimestamp) return false
      return new Date(e.joinedTimestamp).getTime() >= cutoff
    })
    .sort((a, b) => new Date(b.joinedTimestamp!).getTime() - new Date(a.joinedTimestamp!).getTime())
    .slice(0, 5)
})

const displayedAccounts = computed(() => {
  if (props.displayStyle === 'half') return newAccounts.value.slice(0, 3)
  return newAccounts.value
})

function daysAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (24 * 60 * 60 * 1000))
}
</script>
