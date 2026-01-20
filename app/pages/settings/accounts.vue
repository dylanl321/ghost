<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Account Preferences</h1>
      <p class="mt-1 text-gray-500 dark:text-gray-400">
        Manage your favorite accounts and recent account history.
      </p>
    </div>

    <div class="space-y-6">
      <!-- Favorite Accounts Section -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                <UIcon name="i-heroicons-star" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Favorite Accounts</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Quick access to your most used accounts
                </p>
              </div>
            </div>
            <UBadge color="amber" variant="soft">
              {{ favorites.length }} accounts
            </UBadge>
          </div>
        </template>

        <div v-if="favoritesLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
        </div>

        <div v-else-if="favorites.length === 0" class="text-center py-8">
          <UIcon name="i-heroicons-star" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">No favorite accounts</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Star accounts from the Account Explorer to add them here.
          </p>
          <UButton to="/account/explorer" color="emerald" variant="soft">
            Go to Account Explorer
          </UButton>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="account in favorites"
            :key="account.accountId"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-star-solid" class="w-5 h-5 text-amber-500" />
              <div>
                <div class="font-medium text-gray-900 dark:text-white">
                  {{ account.accountName || account.accountId }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ account.accountId }}
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                :to="`/account/${account.accountId}`"
                color="gray"
                variant="ghost"
                size="sm"
                icon="i-heroicons-arrow-right"
              />
              <UButton
                color="red"
                variant="ghost"
                size="sm"
                icon="i-heroicons-trash"
                @click="removeFavorite(account.accountId)"
              />
            </div>
          </div>

          <div class="pt-4 border-t border-gray-200 dark:border-slate-700 mt-4">
            <UButton
              color="red"
              variant="soft"
              @click="clearAllFavorites"
            >
              <UIcon name="i-heroicons-trash" class="w-4 h-4 mr-2" />
              Clear All Favorites
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Recent Accounts Section -->
      <UCard>
        <template #header>
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <UIcon name="i-heroicons-clock" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Recent Accounts</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Accounts you've recently viewed
                </p>
              </div>
            </div>
            <UBadge color="blue" variant="soft">
              {{ recentAccounts.length }} accounts
            </UBadge>
          </div>
        </template>

        <div v-if="recentLoading" class="flex items-center justify-center py-8">
          <UIcon name="i-heroicons-arrow-path" class="w-6 h-6 animate-spin text-gray-400" />
        </div>

        <div v-else-if="recentAccounts.length === 0" class="text-center py-8">
          <UIcon name="i-heroicons-clock" class="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">No recent accounts</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
            View accounts from the Account Explorer to see them here.
          </p>
          <UButton to="/account/explorer" color="emerald" variant="soft">
            Go to Account Explorer
          </UButton>
        </div>

        <div v-else class="space-y-2">
          <div
            v-for="account in recentAccounts"
            :key="account.accountId"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <div class="flex items-center gap-3">
              <UIcon name="i-heroicons-clock" class="w-5 h-5 text-gray-400" />
              <div>
                <div class="font-medium text-gray-900 dark:text-white">
                  {{ account.accountName || account.accountId }}
                </div>
                <div class="text-sm text-gray-500 dark:text-gray-400">
                  {{ account.accountId }}
                  <span v-if="account.visitedAt" class="ml-2">
                    &bull; {{ formatRelativeTime(account.visitedAt) }}
                  </span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <UButton
                v-if="!isFavorite(account.accountId)"
                color="amber"
                variant="ghost"
                size="sm"
                icon="i-heroicons-star"
                @click="addToFavorites(account)"
                title="Add to favorites"
              />
              <UButton
                :to="`/account/${account.accountId}`"
                color="gray"
                variant="ghost"
                size="sm"
                icon="i-heroicons-arrow-right"
              />
            </div>
          </div>

          <div class="pt-4 border-t border-gray-200 dark:border-slate-700 mt-4">
            <UButton
              color="gray"
              variant="soft"
              @click="clearRecentAccounts"
            >
              <UIcon name="i-heroicons-trash" class="w-4 h-4 mr-2" />
              Clear Recent History
            </UButton>
          </div>
        </div>
      </UCard>

      <!-- Settings Section -->
      <UCard>
        <template #header>
          <div class="flex items-center gap-3">
            <div class="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
              <UIcon name="i-heroicons-cog-6-tooth" class="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Account Settings</h2>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Configure account display preferences
              </p>
            </div>
          </div>
        </template>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Maximum Recent Accounts
            </label>
            <USelectMenu
              v-model="maxRecentAccounts"
              :options="[5, 10, 15, 20, 25]"
              @change="saveAccountSettings"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              How many recent accounts to remember
            </p>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Show Favorites in Sidebar</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Display favorite accounts in the navigation sidebar
              </p>
            </div>
            <UToggle v-model="showFavoritesInSidebar" @change="saveAccountSettings" />
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">Show Recent in Sidebar</div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                Display recent accounts in the navigation sidebar
              </p>
            </div>
            <UToggle v-model="showRecentInSidebar" @change="saveAccountSettings" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'settings'
})

const toast = useToast()
const { setPreference, getPreference } = useUserPreferences()

// Favorites
const {
  favorites,
  loading: favoritesLoading,
  removeFavorite: removeFav,
  addFavorite,
  clearFavorites
} = useFavoriteAccounts()

// Recent
const {
  recentAccounts,
  loading: recentLoading,
  clearHistory
} = useRecentAccounts()

function isFavorite(accountId: string) {
  return favorites.value.some(f => f.accountId === accountId)
}

async function removeFavorite(accountId: string) {
  await removeFav(accountId)
  toast.add({
    title: 'Favorite Removed',
    color: 'blue',
    icon: 'i-heroicons-star'
  })
}

async function clearAllFavorites() {
  await clearFavorites()
  toast.add({
    title: 'Favorites Cleared',
    description: 'All favorite accounts have been removed.',
    color: 'blue',
    icon: 'i-heroicons-trash'
  })
}

async function addToFavorites(account: any) {
  await addFavorite({
    accountId: account.accountId,
    accountName: account.accountName
  })
  toast.add({
    title: 'Added to Favorites',
    color: 'green',
    icon: 'i-heroicons-star'
  })
}

async function clearRecentAccounts() {
  await clearHistory()
  toast.add({
    title: 'History Cleared',
    description: 'Recent account history has been cleared.',
    color: 'blue',
    icon: 'i-heroicons-trash'
  })
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString()
}

// Account Settings
const maxRecentAccounts = ref(10)
const showFavoritesInSidebar = ref(true)
const showRecentInSidebar = ref(true)

onMounted(() => {
  maxRecentAccounts.value = getPreference('maxRecentAccounts', 10)
  showFavoritesInSidebar.value = getPreference('showFavoritesInSidebar', true)
  showRecentInSidebar.value = getPreference('showRecentInSidebar', true)
})

function saveAccountSettings() {
  setPreference('maxRecentAccounts', maxRecentAccounts.value)
  setPreference('showFavoritesInSidebar', showFavoritesInSidebar.value)
  setPreference('showRecentInSidebar', showRecentInSidebar.value)
  toast.add({
    title: 'Settings Saved',
    color: 'green',
    icon: 'i-heroicons-check-circle'
  })
}
</script>
