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
      <BudgetAlertsPanel v-else-if="activeTab === 3" />
      <AlertMetricsPanel v-else-if="activeTab === 4" />
      <AlertSettingsPanel v-else-if="activeTab === 5" />
    </div>
  </div>
</template>

<script setup lang="ts">
import ApiKeysPanel from '~/components/admin/ApiKeysPanel.vue'
import SiteConfigPanel from '~/components/admin/SiteConfigPanel.vue'
import NotificationsPanel from '~/components/admin/NotificationsPanel.vue'
import BudgetAlertsPanel from '~/components/admin/BudgetAlertsPanel.vue'
import AlertMetricsPanel from '~/components/admin/AlertMetricsPanel.vue'
import AlertSettingsPanel from '~/components/admin/AlertSettingsPanel.vue'

definePageMeta({
  layout: 'admin',
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
  },
  {
    label: 'Budget Alerts',
    icon: 'i-heroicons-bell-alert'
  },
  {
    label: 'Alert Metrics',
    icon: 'i-heroicons-chart-bar'
  },
  {
    label: 'Alert Settings',
    icon: 'i-heroicons-adjustments-horizontal'
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
</script>
