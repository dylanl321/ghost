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
        <div class="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
          <Icon name="i-heroicons-cog-6-tooth" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          System Settings
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        Configure API keys, system settings, and notifications
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
      <ApiKeysPanel v-if="activeTab === 0" />
      <SiteConfigPanel v-else-if="activeTab === 1" />
      <NotificationsPanel v-else-if="activeTab === 2" />
    </div>

    <!-- Budget Alerts Link -->
    <UCard class="mt-6">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
            <UIcon name="i-heroicons-currency-dollar" class="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">Budget Alerts</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Budget alert configuration has moved to its own dedicated admin section
            </p>
          </div>
        </div>
        <UButton color="yellow" variant="soft" @click="navigateTo('/admin/budget-alerts')">
          Go to Budget Alerts
          <UIcon name="i-heroicons-arrow-right" class="w-4 h-4 ml-2" />
        </UButton>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import ApiKeysPanel from '~/components/admin/ApiKeysPanel.vue'
import SiteConfigPanel from '~/components/admin/SiteConfigPanel.vue'
import NotificationsPanel from '~/components/admin/NotificationsPanel.vue'

definePageMeta({
  layout: 'admin',
  middleware: 'auth-permission',
  permission: 'admin',
  title: 'System Settings',
  description: 'Configure API keys, system settings, and notifications'
})

const route = useRoute()
const activeTab = ref(0)

const tabs = [
  {
    label: 'API Keys',
    icon: 'i-heroicons-key'
  },
  {
    label: 'Site Configuration',
    icon: 'i-heroicons-cog-6-tooth'
  },
  {
    label: 'Notifications',
    icon: 'i-heroicons-bell'
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
