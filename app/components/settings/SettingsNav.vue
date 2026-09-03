<template>
  <div class="py-6 px-4">
    <!-- Header -->
    <div class="mb-6">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
      <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
        Manage your preferences
      </p>
    </div>

    <!-- Navigation Links -->
    <nav class="space-y-1">
      <NuxtLink
        v-for="item in settingsItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        :class="[
          isActive(item.to)
            ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700'
        ]"
      >
        <UIcon :name="item.icon" class="w-5 h-5 flex-shrink-0" />
        <div class="flex-1 min-w-0">
          <div>{{ item.label }}</div>
          <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
            {{ item.description }}
          </p>
        </div>
      </NuxtLink>
    </nav>

    <!-- Quick Actions -->
    <div class="mt-8 pt-6 border-t border-gray-200 dark:border-slate-700">
      <h3 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
        Quick Actions
      </h3>
      <div class="space-y-2">
        <NuxtLink
          to="/profile"
          class="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
        >
          <UIcon name="i-heroicons-user-circle" class="w-4 h-4" />
          <span>View Profile</span>
        </NuxtLink>
        <button
          class="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          @click="resetPreferences"
        >
          <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" />
          <span>Reset to Defaults</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const toast = useToast()

const settingsItems = [
  {
    label: 'API Access',
    to: '/settings/api-access',
    icon: 'i-heroicons-key',
    description: 'Integration API keys'
  },
  {
    label: 'Overview',
    to: '/settings',
    icon: 'i-heroicons-cog-6-tooth',
    description: 'Settings dashboard'
  },
  {
    label: 'Preferences',
    to: '/settings/preferences',
    icon: 'i-heroicons-adjustments-horizontal',
    description: 'Timezone, notifications'
  },
  {
    label: 'Appearance',
    to: '/settings/appearance',
    icon: 'i-heroicons-paint-brush',
    description: 'Theme and display'
  },
  {
    label: 'Account Preferences',
    to: '/settings/accounts',
    icon: 'i-heroicons-star',
    description: 'Favorites and recent'
  },
  {
    label: 'Notifications',
    to: '/settings/notifications',
    icon: 'i-heroicons-bell',
    description: 'Delivery and history'
  }
]

const isActive = (path: string) => {
  if (path === '/settings') {
    return route.path === '/settings'
  }
  return route.path.startsWith(path)
}

const resetPreferences = () => {
  toast.add({
    title: 'Reset Preferences',
    description: 'This feature is coming soon.',
    color: 'blue',
    icon: 'i-heroicons-information-circle'
  })
}
</script>
