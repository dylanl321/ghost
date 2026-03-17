<template>
  <div class="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 h-full overflow-hidden">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <UIcon name="i-heroicons-star-solid" class="w-5 h-5 text-yellow-500" />
        <h2 class="text-sm font-semibold text-gray-900 dark:text-white">Favorite Accounts</h2>
        <UBadge v-if="favorites.length > 0" size="xs" color="gray" variant="subtle">{{ favorites.length }}</UBadge>
      </div>
      <NuxtLink v-if="favorites.length > 0" to="/account/explorer" class="text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors">
        View All →
      </NuxtLink>
    </div>

    <!-- Loading -->
    <div v-if="loading" :class="gridClass">
      <div v-for="i in 3" :key="i" class="animate-pulse rounded-lg border border-gray-100 dark:border-gray-800 p-3">
        <div class="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div class="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
        <div class="h-4 w-16 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>

    <!-- Empty state -->
    <div v-else-if="favorites.length === 0" class="text-center py-6">
      <UIcon name="i-heroicons-star" class="w-8 h-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
      <p class="text-sm text-gray-500 dark:text-gray-400">No favorites yet.</p>
      <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">Star accounts from the Account Explorer.</p>
    </div>

    <!-- Compact: horizontal chips -->
    <div v-else-if="displayStyle === 'compact'" class="flex gap-2 overflow-x-auto pb-1">
      <NuxtLink
        v-for="account in displayedFavorites"
        :key="account.accountId"
        :to="`/account/${account.accountId}`"
        class="flex-shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors text-xs"
      >
        <span class="font-medium text-gray-900 dark:text-white truncate max-w-[120px]">{{ account.projectName || account.accountName || account.accountId }}</span>
        <span v-if="allAccountCosts && allAccountCosts[account.accountId] != null" class="text-gray-500 dark:text-gray-400">{{ formatCurrency(allAccountCosts[account.accountId], 0) }}</span>
      </NuxtLink>
    </div>

    <!-- Favorites grid (full / half) -->
    <div v-else :class="gridClass" class="max-h-[400px] overflow-y-auto">
      <NuxtLink
        v-for="account in displayedFavorites"
        :key="account.accountId"
        :to="`/account/${account.accountId}`"
        class="group rounded-lg border border-gray-100 dark:border-gray-800 p-3 hover:border-blue-200 dark:hover:border-blue-800 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors"
      >
        <p class="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">
          {{ account.projectName || account.accountName || account.accountId }}
        </p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ account.accountId }}</p>
        <p v-if="allAccountCosts && allAccountCosts[account.accountId] != null" class="text-sm font-semibold text-gray-900 dark:text-white mt-2">
          {{ formatCurrency(allAccountCosts[account.accountId], 0) }}
          <span class="text-[10px] font-normal text-gray-400 dark:text-gray-500">MTD</span>
        </p>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { DisplayStyle } from '#shared/types/dashboard-layout'

const props = defineProps<{
  allAccountCosts?: Record<string, number>
  loading: boolean
  displayStyle?: DisplayStyle
}>()

const { favorites } = useFavoriteAccounts()

const displayedFavorites = computed(() => {
  if (props.displayStyle === 'compact') return favorites.value.slice(0, 6)
  if (props.displayStyle === 'half') return favorites.value.slice(0, 4)
  return favorites.value.slice(0, 9)
})

const gridClass = computed(() => {
  if (props.displayStyle === 'half') return 'grid grid-cols-1 sm:grid-cols-2 gap-3'
  return 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3'
})
</script>
