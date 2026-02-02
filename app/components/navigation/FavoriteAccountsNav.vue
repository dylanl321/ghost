<template>
  <div v-if="shouldShow">
    <!-- Separator -->

    <!-- Collapsed sidebar: Just the icon -->
    <div
      v-if="navigationStore.isCollapsed && !navigationStore.isHovered && favorites.length > 0"
      class="relative group py-2 px-3"
    >
      <button
        class="w-full flex items-center justify-center p-2 rounded-md text-yellow-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        @click="navigationStore.expand()"
      >
        <UIcon name="i-heroicons-star-solid" class="w-5 h-5" />
      </button>

      <!-- Tooltip -->
      <div class="absolute left-full ml-2 px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-200 dark:border-slate-600 shadow-lg">
        Favorites ({{ favorites.length }})
        <div class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-white dark:border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
      </div>
    </div>

    <!-- Expanded sidebar: Simple collapsible section -->
    <div v-else class="space-y-1 px-3">
      <!-- Header -->
      <button
        class="w-full flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative group overflow-hidden text-slate-700 dark:text-slate-400"
        :class="{ 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': isExpanded }"
        @click="isExpanded = !isExpanded"
      >
        <UIcon name="i-heroicons-star-solid" class="flex-shrink-0 w-5 h-5 text-yellow-500" />
        <div class="flex items-center justify-between flex-1 ml-3 min-w-0">
          <span class="text-sm font-medium truncate">Favorites</span>
          <div class="flex items-center gap-2 flex-shrink-0">
            <UBadge
              v-if="favorites.length > 0"
              size="xs"
              color="gray"
              variant="subtle"
            >
              {{ favorites.length }}
            </UBadge>
            <UIcon
              :name="isExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
              class="w-4 h-4 transition-transform"
            />
          </div>
        </div>
      </button>

      <!-- Favorites List -->
      <div v-if="isExpanded" class="ml-8 space-y-0.5">
        <template v-if="favorites.length > 0">
          <NuxtLink
            v-for="account in favorites"
            :key="account.accountId"
            :to="`/account/${account.accountId}`"
            class="flex items-center gap-2 px-3 py-2 rounded-md text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors text-sm"
            :class="{ 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800': isActiveAccount(account.accountId) }"
          >
            <UIcon name="i-heroicons-building-office-2" class="w-4 h-4 flex-shrink-0" />
            <span class="truncate" :title="account.projectName || account.accountId">
              {{ account.projectName || account.accountId }}
            </span>
          </NuxtLink>
        </template>

        <!-- Empty State -->
        <div v-else class="px-3 py-6 text-center">
          <UIcon name="i-heroicons-star" class="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p class="text-xs text-slate-500">No favorites yet</p>
          <p class="text-xs text-slate-600 mt-1">Click ★ on accounts</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { useNavigationStore } from '~/stores/useNavigationStore'

const route = useRoute()
const navigationStore = useNavigationStore()
const { favorites } = useFavoriteAccounts()

// Local state
const isExpanded = ref(true)

// Show the component when expanded or when collapsed with favorites
const shouldShow = computed(() => {
  // Always show when expanded (including empty state)
  if (!navigationStore.isCollapsed || navigationStore.isHovered) {
    return true
  }
  // Only show when collapsed if there are favorites
  return favorites.value.length > 0
})

// Check if account is currently active
function isActiveAccount(accountId: string): boolean {
  return route.path === `/account/${accountId}`
}
</script>
