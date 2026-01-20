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
        <div class="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
          <Icon name="i-heroicons-chart-bar" class="w-6 h-6 text-red-600 dark:text-red-400" />
        </div>
        <h1 class="text-3xl font-bold text-gray-900 dark:text-white">
          System Monitoring
        </h1>
      </div>
      <p class="text-gray-600 dark:text-gray-400">
        View system logs, health checks, and manage issues
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
      <SystemLogsPanel v-if="activeTab === 0" />
      <UserJourneyVisualizer v-else-if="activeTab === 1" />
      <StrandsHealthCheck v-else-if="activeTab === 2" />
      <IssuesPanel v-else-if="activeTab === 3" />
    </div>
  </div>
</template>

<script setup lang="ts">
import SystemLogsPanel from '~/components/admin/SystemLogsPanel.vue'
import UserJourneyVisualizer from '~/components/admin/UserJourneyVisualizer.vue'
import StrandsHealthCheck from '~/components/admin/StrandsHealthCheck.vue'
import IssuesPanel from '~/components/admin/IssuesPanel.vue'

definePageMeta({
  layout: 'admin',
  title: 'System Monitoring',
  description: 'View system logs, health checks, and manage issues'
})

const route = useRoute()
const activeTab = ref(0)

const tabs = [
  {
    label: 'Activity Logs',
    icon: 'i-heroicons-document-text'
  },
  {
    label: 'User Journeys',
    icon: 'i-heroicons-map'
  },
  {
    label: 'Service Health',
    icon: 'i-heroicons-heart'
  },
  {
    label: 'Issues & Tickets',
    icon: 'i-heroicons-exclamation-triangle'
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
