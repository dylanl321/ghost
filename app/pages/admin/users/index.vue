<template>
  <div class="container mx-auto px-6 py-8 max-w-7xl">
    <!-- Header with Back Button -->
    <div class="mb-6">
      <UButton
        color="gray"
        variant="ghost"
        icon="i-heroicons-arrow-left"
        @click="navigateTo('/admin')"
        class="mb-4"
      >
        Back to Dashboard
      </UButton>

      <div class="flex items-center gap-3 mb-2">
        <div class="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
          <Icon name="i-heroicons-user-group" class="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          User Management
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Manage user preferences, roles, and permissions
      </p>
    </div>

    <!-- Tabs -->
    <UTabs
      v-model="activeTab"
      :items="tabs"
      class="mb-6"
    />

    <!-- Tab Content -->
    <div class="mt-6">
      <UserPreferencesPanel v-if="activeTab === 0" />
      <RolesPanel v-else-if="activeTab === 1" />
      <UserActivityMetricsPanel v-else-if="activeTab === 2" />
    </div>
  </div>
</template>

<script setup lang="ts">
import UserPreferencesPanel from '~/components/admin/UserPreferencesPanel.vue'
import RolesPanel from '~/components/admin/RolesPanel.vue'
import UserActivityMetricsPanel from '~/components/admin/UserActivityMetricsPanel.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'User Management',
  description: 'Manage user preferences, roles, and permissions'
})

const route = useRoute()
const activeTab = ref(0)

const tabs = [
  {
    label: 'User Preferences',
    icon: 'i-heroicons-user-circle'
  },
  {
    label: 'Roles & Permissions',
    icon: 'i-heroicons-shield-check'
  },
  {
    label: 'Activity Metrics',
    icon: 'i-heroicons-chart-bar'
  }
]

// Read tab from query param on mount
onMounted(() => {
  const tabParam = route.query.tab
  if (tabParam !== undefined) {
    const tabIndex = parseInt(tabParam as string, 10)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
      activeTab.value = tabIndex
    }
  }
})

// Watch for query changes (e.g., back/forward navigation)
watch(() => route.query.tab, (newTab) => {
  if (newTab !== undefined) {
    const tabIndex = parseInt(newTab as string, 10)
    if (!isNaN(tabIndex) && tabIndex >= 0 && tabIndex < tabs.length) {
      activeTab.value = tabIndex
    }
  }
})

// Update URL when tab changes
watch(activeTab, (newTab) => {
  navigateTo({ query: { ...route.query, tab: newTab.toString() } }, { replace: true })
})
</script>
