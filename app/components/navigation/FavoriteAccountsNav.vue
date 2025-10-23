<template>
  <div v-if="shouldShow">
    <!-- Separator -->
    <div class="border-t border-slate-700 my-2"></div>

    <!-- Collapsed sidebar: Just the icon -->
    <div
      v-if="navigationStore.isCollapsed && !navigationStore.isHovered && favorites.length > 0"
      class="relative group py-2 px-3"
    >
      <button
        class="w-full flex items-center justify-center p-2 rounded-md text-yellow-500 hover:bg-slate-800 transition-colors"
        @click="navigationStore.expand()"
      >
        <UIcon name="i-heroicons-star-solid" class="w-5 h-5" />
      </button>

      <!-- Tooltip -->
      <div class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-600">
        Favorites ({{ favorites.length }})
        <div class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
      </div>
    </div>

    <!-- Expanded sidebar: Simple collapsible section -->
    <div v-else class="py-2 px-3">
      <!-- Header -->
      <button
        class="w-full flex items-center justify-between px-3 py-2 rounded-md text-slate-300 hover:bg-slate-800 transition-colors group"
        @click="isExpanded = !isExpanded"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-heroicons-star-solid" class="w-4 h-4 text-yellow-500" />
          <span class="text-sm font-medium">Favorites</span>
          <UBadge
            v-if="favorites.length > 0"
            size="xs"
            color="gray"
            variant="subtle"
          >
            {{ favorites.length }}
          </UBadge>
          <UTooltip text="Learn about favorites">
            <NuxtLink
              to="/support/docs?topic=favorites-guide"
              class="text-slate-400 hover:text-slate-300"
              @click.stop
            >
              <UIcon name="i-heroicons-question-mark-circle" class="w-3.5 h-3.5" />
            </NuxtLink>
          </UTooltip>
        </div>
        <UIcon
          :name="isExpanded ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
          class="w-4 h-4 transition-transform"
        />
      </button>

      <!-- Favorites List -->
      <div v-if="isExpanded" class="mt-1 space-y-0.5">
        <template v-if="favorites.length > 0">
          <NuxtLink
            v-for="account in favorites"
            :key="account.accountId"
            :to="`/account/${account.accountId}`"
            class="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            :class="{ 'text-white bg-slate-800': isActiveAccount(account.accountId) }"
          >
            <UIcon name="i-heroicons-building-office-2" class="w-4 h-4 flex-shrink-0" />
            <span class="truncate text-xs" :title="account.projectName || account.accountId">
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
