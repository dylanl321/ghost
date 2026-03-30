<template>
  <div v-if="recentAccounts.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-clock" class="w-5 h-5 text-blue-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Recently Viewed</h2>
      </div>
      <button
        v-if="recentAccounts.length > 5 && !showAll"
        class="text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors"
        @click="showAll = true"
      >
        Show all ({{ recentAccounts.length }})
      </button>
      <button
        v-else-if="showAll && recentAccounts.length > 5"
        class="text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors"
        @click="showAll = false"
      >
        Show less
      </button>
    </div>

    <!-- Compact mode: horizontal badges -->
    <div v-if="displayStyle === 'third'" class="flex gap-2 overflow-x-auto pb-1">
      <NuxtLink
        v-for="account in displayedAccounts"
        :key="account.accountId"
        :to="`/account/${account.accountId}`"
        class="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-xs"
      >
        <span class="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{{ account.projectName || account.accountName || account.accountId }}</span>
        <span class="text-gray-400 dark:text-gray-500">{{ timeAgo(account.viewedAt) }}</span>
      </NuxtLink>
    </div>
    <!-- Normal list mode -->
    <div v-else class="space-y-1 max-h-[300px] overflow-y-auto">
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
          <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ timeAgo(account.viewedAt) }}</span>
          <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-blue-500" />
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = withDefaults(defineProps<{
  displayStyle?: DisplayStyle
}>(), { displayStyle: 'full' })

const { recentAccounts } = useRecentAccounts()
const showAll = ref(false)

const displayedAccounts = computed(() => {
  if (props.displayStyle === 'third') return recentAccounts.value.slice(0, 6)
  if (props.displayStyle === 'half') {
    return showAll.value ? recentAccounts.value : recentAccounts.value.slice(0, 3)
  }
  return showAll.value ? recentAccounts.value : recentAccounts.value.slice(0, 5)
})

function timeAgo(isoDate: string): string {
  const now = Date.now()
  const then = new Date(isoDate).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDays = Math.floor(diffHr / 24)
  if (diffDays === 1) return '1d ago'
  return `${diffDays}d ago`
}
</script>
