<template>
  <div v-if="newAccounts.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
          <UIcon name="i-heroicons-sparkles" class="w-4.5 h-4.5 text-blue-500" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-gray-900 dark:text-white">New Accounts</h2>
          <p class="text-[11px] text-gray-400 dark:text-gray-500">Last 90 days</p>
        </div>
      </div>
      <UBadge size="xs" color="blue" variant="subtle" class="tabular-nums">{{ newAccounts.length }} new</UBadge>
    </div>

    <!-- Third: condensed list -->
    <template v-if="displayStyle === 'third'">
      <div class="space-y-2">
        <NuxtLink
          v-for="account in displayedAccounts"
          :key="account.accountId"
          :to="`/account/${account.accountId}`"
          class="group flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :class="account.accountStatus === 'ACTIVE' ? 'bg-green-400' : 'bg-gray-400'"
          />
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 truncate flex-1 group-hover:text-blue-600 dark:group-hover:text-blue-400">
            {{ account.projectName || account.accountName || account.accountId }}
          </span>
          <span class="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">{{ daysAgo(account.joinedTimestamp!) }}d</span>
        </NuxtLink>
      </div>
      <NuxtLink
        v-if="newAccounts.length > displayedAccounts.length"
        to="/account/explorer"
        class="block mt-3 text-center text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors"
      >
        View all {{ newAccounts.length }} accounts
      </NuxtLink>
    </template>

    <!-- Full / Half / Two-thirds: rich cards -->
    <template v-else>
      <div class="space-y-2">
        <NuxtLink
          v-for="account in displayedAccounts"
          :key="account.accountId"
          :to="`/account/${account.accountId}`"
          class="group flex items-center gap-3 px-3 py-3 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-blue-200 dark:hover:border-blue-800/50 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-all duration-150"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors duration-150"
            :class="account.accountStatus === 'ACTIVE'
              ? 'bg-green-50 dark:bg-green-900/20 group-hover:bg-green-100 dark:group-hover:bg-green-900/30'
              : 'bg-gray-100 dark:bg-gray-800 group-hover:bg-gray-200 dark:group-hover:bg-gray-700'"
          >
            <UIcon
              name="i-heroicons-building-office-2"
              class="w-4.5 h-4.5"
              :class="account.accountStatus === 'ACTIVE' ? 'text-green-500' : 'text-gray-400'"
            />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              {{ account.projectName || account.accountName || account.accountId }}
            </p>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 font-mono">{{ account.accountId }}</p>
          </div>

          <div class="flex flex-col items-end gap-1 flex-shrink-0">
            <UBadge
              size="xs"
              :color="account.accountStatus === 'ACTIVE' ? 'green' : 'gray'"
              variant="subtle"
            >
              {{ account.accountStatus || 'Unknown' }}
            </UBadge>
            <span class="text-[10px] text-gray-400 dark:text-gray-500">{{ daysAgo(account.joinedTimestamp!) }}d ago</span>
          </div>

          <UIcon name="i-heroicons-chevron-right" class="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
        </NuxtLink>
      </div>

      <NuxtLink
        v-if="newAccounts.length > displayedAccounts.length"
        to="/account/explorer"
        class="block mt-3 text-center text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors"
      >
        View all {{ newAccounts.length }} new accounts
      </NuxtLink>
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
    .slice(0, 10)
})

const displayedAccounts = computed(() => {
  if (props.displayStyle === 'third') return newAccounts.value.slice(0, 4)
  if (props.displayStyle === 'half') return newAccounts.value.slice(0, 5)
  return newAccounts.value
})

function daysAgo(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / (24 * 60 * 60 * 1000))
}
</script>
