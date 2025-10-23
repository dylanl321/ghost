<template>
  <div v-if="shouldShow">
    <!-- Separator -->
    <div class="border-t border-slate-700 my-2"></div>

    <!-- Collapsed sidebar: Just the icon -->
    <div
      v-if="navigationStore.isCollapsed && !navigationStore.isHovered && recentAccounts.length > 0"
      class="relative group py-2 px-3"
    >
      <button
        class="w-full flex items-center justify-center p-2 rounded-md text-slate-400 hover:bg-slate-800 transition-colors"
        @click="navigationStore.expand()"
      >
        <UIcon name="i-heroicons-clock" class="w-5 h-5" />
      </button>

      <!-- Tooltip -->
      <div class="absolute left-full ml-2 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap z-50 border border-slate-600">
        Recent ({{ recentAccounts.length }})
        <div class="absolute left-0 top-1/2 transform -translate-x-1 -translate-y-1/2 w-0 h-0 border-r-4 border-r-slate-800 border-t-2 border-b-2 border-t-transparent border-b-transparent"></div>
      </div>
    </div>

    <!-- Expanded sidebar: Collapsible section -->
    <div v-else-if="!navigationStore.isCollapsed || navigationStore.isHovered" class="space-y-1 px-3">
      <button
        class="w-full flex items-center px-3 py-2 rounded-md cursor-pointer hover:bg-slate-800 transition-colors relative group overflow-hidden text-slate-400"
        :class="{ 'text-white bg-slate-800': isExpanded }"
        @click="isExpanded = !isExpanded"
      >
        <UIcon name="i-heroicons-clock" class="flex-shrink-0 w-5 h-5" />
        <div class="flex items-center justify-between flex-1 ml-3 min-w-0">
          <span class="text-sm font-medium truncate">Recent</span>
          <div class="flex items-center gap-2 flex-shrink-0">
            <UBadge
              v-if="recentAccounts.length > 0"
              size="xs"
              color="gray"
              variant="subtle"
            >
              {{ recentAccounts.length }}
            </UBadge>
            <UIcon
              :name="isExpanded ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
              class="w-4 h-4 transition-transform"
            />
          </div>
        </div>
      </button>

      <!-- Recent Accounts List -->
      <div v-if="isExpanded" class="ml-8 space-y-0.5">
        <template v-if="recentAccounts.length > 0">
          <div
            v-for="account in recentAccounts"
            :key="account.accountId"
            class="group/item flex items-center gap-2"
          >
            <NuxtLink
              :to="`/account/${account.accountId}`"
              class="flex-1 flex items-center gap-2 px-3 py-2 rounded-md text-slate-400 hover:bg-slate-800 hover:text-white transition-colors text-sm"
              :class="{ 'text-white bg-slate-800': isActiveAccount(account.accountId) }"
            >
              <UIcon name="i-heroicons-building-office-2" class="w-4 h-4 flex-shrink-0" />
              <span class="truncate flex-1" :title="account.projectName || account.accountId">
                {{ account.projectName || account.accountId }}
              </span>
            </NuxtLink>
            <!-- Remove button (shows on hover) -->
            <button
              class="opacity-0 group-hover/item:opacity-100 p-1 hover:bg-slate-700 rounded transition-opacity"
              :title="`Remove ${account.projectName || account.accountId} from recent`"
              @click.stop="handleRemove(account.accountId)"
            >
              <UIcon name="i-heroicons-x-mark" class="w-3 h-3 text-slate-500 hover:text-slate-300" />
            </button>
          </div>
        </template>

        <!-- Empty State -->
        <div v-else class="px-3 py-6 text-center">
          <UIcon name="i-heroicons-clock" class="w-8 h-8 mx-auto mb-2 text-slate-600" />
          <p class="text-xs text-slate-500">No recent accounts</p>
          <p class="text-xs text-slate-600 mt-1">Visit accounts to see them here</p>
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
const { recentAccounts, removeRecentAccount } = useRecentAccounts()

// Local state
const isExpanded = ref(false)

// Show the component when expanded or when collapsed with recent accounts
const shouldShow = computed(() => {
  // Always show when expanded (including empty state)
  if (!navigationStore.isCollapsed || navigationStore.isHovered) {
    return true
  }
  // Only show when collapsed if there are recent accounts
  return recentAccounts.value.length > 0
})

// Check if account is currently active
function isActiveAccount(accountId: string): boolean {
  return route.path.includes(`/account/${accountId}`)
}

// Handle removing an account from recent
async function handleRemove(accountId: string) {
  await removeRecentAccount(accountId)
}
</script>


