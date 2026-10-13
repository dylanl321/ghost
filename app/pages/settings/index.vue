<template>
  <div>
    <!-- Page Header -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
      <p class="mt-1 text-gray-500 dark:text-gray-400">
        Manage your personal preferences and customize your experience.
      </p>
    </div>

    <!-- Settings Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <NuxtLink to="/settings/api-access">
        <UCard class="h-full hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-key" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                API Access
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Create personal API keys, review usage, and open integration documentation.
              </p>
            </div>
          </div>
        </UCard>
      </NuxtLink>

      <!-- Preferences Card -->
      <NuxtLink to="/settings/preferences">
        <UCard class="h-full hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-adjustments-horizontal" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Preferences
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Configure your timezone, notification settings, and default behaviors.
              </p>
              <div class="mt-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                <span>Timezone: {{ timezone }}</span>
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>

      <!-- Appearance Card -->
      <NuxtLink to="/settings/appearance">
        <UCard class="h-full hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-paint-brush" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Appearance
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Customize the look and feel with theme options and display preferences.
              </p>
              <div class="mt-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <UIcon name="i-heroicons-moon" class="w-4 h-4" />
                <span>Theme: {{ currentTheme }}</span>
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>

      <!-- Account Preferences Card -->
      <NuxtLink to="/settings/accounts">
        <UCard class="h-full hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-star" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Account Preferences
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage your favorite accounts and recent account history.
              </p>
              <div class="mt-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <UIcon name="i-heroicons-star-solid" class="w-4 h-4" />
                <span>{{ favoriteCount }} favorite accounts</span>
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>

      <!-- Notifications Card -->
      <NuxtLink to="/settings/notifications">
        <UCard class="h-full hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-bell" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Notifications
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Manage notification delivery, email digest settings, and view history.
              </p>
              <div class="mt-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <UIcon name="i-heroicons-bell-alert" class="w-4 h-4" />
                <span>Digest, mute, and category preferences</span>
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>

      <!-- Profile Link Card -->
      <NuxtLink to="/profile">
        <UCard class="h-full hover:shadow-lg transition-shadow cursor-pointer group">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform">
              <UIcon name="i-heroicons-user-circle" class="w-6 h-6" />
            </div>
            <div class="flex-1">
              <h3 class="font-semibold text-gray-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                Profile
              </h3>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                View your profile information, roles, and AWS access permissions.
              </p>
              <div class="mt-3 flex items-center gap-2 text-sm text-gray-400 dark:text-gray-500">
                <UIcon name="i-heroicons-identification" class="w-4 h-4" />
                <span>View your identity</span>
              </div>
            </div>
          </div>
        </UCard>
      </NuxtLink>
    </div>

    <!-- Quick Stats -->
    <div class="mt-8 pt-8 border-t border-gray-200 dark:border-slate-700">
      <h2 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4">
        Your Activity
      </h2>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ favoriteCount }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Favorites</div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ recentCount }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Recent</div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
          <div class="text-2xl font-bold text-gray-900 dark:text-white">{{ lastLoginFormatted }}</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Last Login</div>
        </div>
        <div class="bg-white dark:bg-slate-800 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Active</div>
          <div class="text-sm text-gray-500 dark:text-gray-400">Status</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: 'settings'
})

const { timezone, lastLogin } = useUserPreferences()
const { favorites } = useFavoriteAccounts()
const { recentAccounts } = useRecentAccounts()

const favoriteCount = computed(() => favorites.value?.length || 0)
const recentCount = computed(() => recentAccounts.value?.length || 0)

const currentTheme = computed(() => {
  if (import.meta.client) {
    return document.documentElement.classList.contains('dark') ? 'Dark' : 'Light'
  }
  return 'System'
})

const lastLoginFormatted = computed(() => {
  if (!lastLogin.value) return 'Today'
  const now = new Date()
  const diff = now.getTime() - lastLogin.value.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
})
</script>
